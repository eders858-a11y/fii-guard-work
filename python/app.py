from flask import Flask, jsonify, request
import yfinance as yf
import requests
import re
import html
import base64
import json

app = Flask(__name__)

FUNDAMENTUS_URL = "https://www.fundamentus.com.br/fii_proventos.php"


# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================

def limpar_html(texto):
    texto = html.unescape(texto)
    texto = re.sub(r"<[^>]+>", "", texto)
    return texto.strip()


def converter_valor_brasileiro(valor):
    try:
        # Mantém todas as casas decimais recebidas da fonte.
        # Não arredonda.
        valor = (
            str(valor)
            .upper()
            .replace("R$", "")
            .replace(" ", "")
            .strip()
        )

        valor = valor.replace(".", "").replace(",", ".")

        return float(valor)

    except Exception:
        return None


def converter_data_brasileira(data):
    try:
        partes = data.strip().split("/")

        if len(partes) != 3:
            return None

        dia, mes, ano = partes

        return f"{ano}-{mes}-{dia}"

    except Exception:
        return None


# ============================================================
# B3
# FONTE PRINCIPAL DOS PROVENTOS
# ============================================================

def buscar_proventos_b3(ticker):
    resultados = []

    try:
        ticker = ticker.upper().strip()

        # Ex.:
        # TRXF11 -> TRXF
        # BODB11 -> BODB
        codigo = re.sub(r"\d+$", "", ticker)

        payload = {
            "language": "pt-br",
            "idCEM": codigo
        }

        payload_json = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":")
        )

        payload_b64 = base64.b64encode(
            payload_json.encode("utf-8")
        ).decode("ascii")

        url = (
            "https://sistemaswebb3-listados.b3.com.br/"
            "fundsListedProxy/Search/GetEventsCorporateActions/"
            f"{payload_b64}"
        )

        headers = {
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/140.0 Safari/537.36"
            ),
            "Referer": (
                "https://sistemaswebb3-listados.b3.com.br/"
            )
        }

        resposta = requests.get(
            url,
            headers=headers,
            timeout=20
        )

        print(
            f"[B3] {ticker} "
            f"HTTP {resposta.status_code}"
        )

        if resposta.status_code != 200:
            return resultados

        try:
            dados = resposta.json()
        except Exception as e:
            print(
                f"[B3] {ticker}: "
                f"resposta nao e JSON: {e}"
            )
            return resultados

        cash_dividends = dados.get(
            "cashDividends",
            []
        )

        if not isinstance(cash_dividends, list):
            return resultados

        # --------------------------------------------------------
        # Todos os eventos de RENDIMENTO são preservados aqui.
        #
        # A consolidação abaixo continua responsável por:
        # - eliminar duplicidades
        # - comparar fontes
        # - escolher o maior valor numérico
        #
        # Não arredonda os valores.
        # --------------------------------------------------------

        for item in cash_dividends:

            label = str(
                item.get("label", "")
            ).strip().upper()

            if label != "RENDIMENTO":
                continue

            # Para evento de rendimento, a data correta para
            # representar a data-com é lastDatePrior.
            #
            # approvedOn fica como reserva caso lastDatePrior
            # não exista.
            data_com = (
                    item.get("lastDatePrior")
                    or item.get("approvedOn")
            )

            data_pagamento = item.get(
                "paymentDate"
            )

            valor = converter_valor_brasileiro(
                item.get("rate")
            )

            data_com = (
                converter_data_brasileira(data_com)
                if data_com
                else None
            )

            data_pagamento = (
                converter_data_brasileira(data_pagamento)
                if data_pagamento
                else None
            )

            if (
                    not data_com
                    or not data_pagamento
                    or valor is None
            ):
                continue

            if valor <= 0:
                continue

            resultados.append({
                "ticker": ticker,
                "dataCom": data_com,
                "dataPagamento": data_pagamento,
                "valorUnitario": float(valor),
                "tipo": "Rendimento",
                "fonte": "B3"
            })

        resultados.sort(
            key=lambda x: (
                x.get("dataPagamento") or "",
                x.get("dataCom") or ""
            )
        )

        print(
            f"[B3] {ticker}: "
            f"{len(resultados)} proventos encontrados"
        )

    except Exception as e:

        print(
            f"[B3] FALHA {ticker}: {e}"
        )

    return resultados


# ============================================================
# FUNDAMENTUS
# FONTE DE RESERVA / COMPARAÇÃO
# ============================================================

def buscar_proventos_fundamentus(ticker):
    resultados = []

    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/140.0 Safari/537.36"
            ),
            "Accept": (
                "text/html,application/xhtml+xml,"
                "application/xml;q=0.9,image/avif,"
                "image/webp,*/*;q=0.8"
            ),
            "Accept-Language": (
                "pt-BR,pt;q=0.9,en-US;q=0.8"
            ),
            "Referer": "https://www.fundamentus.com.br/",
        }

        url = f"{FUNDAMENTUS_URL}?papel={ticker}"

        resposta = requests.get(
            url,
            headers=headers,
            timeout=20
        )

        print(
            f"[FUNDAMENTUS] {ticker} "
            f"HTTP {resposta.status_code} "
            f"tamanho={len(resposta.text)}"
        )

        if resposta.status_code != 200:
            return resultados

        pagina = resposta.text

        linhas = re.findall(
            r"<tr[^>]*>(.*?)</tr>",
            pagina,
            flags=re.IGNORECASE | re.DOTALL
        )

        for linha in linhas:

            colunas = re.findall(
                r"<t[dh][^>]*>(.*?)</t[dh]>",
                linha,
                flags=re.IGNORECASE | re.DOTALL
            )

            if len(colunas) < 4:
                continue

            valores = [
                limpar_html(coluna)
                for coluna in colunas
            ]

            # ------------------------------------------------
            # COLUNAS DO FUNDAMENTUS
            #
            # 0 = Data COM
            # 1 = Tipo
            # 2 = Data Pagamento
            # 3 = Valor
            # ------------------------------------------------

            data_com = converter_data_brasileira(
                valores[0]
            )

            tipo = valores[1].strip()

            data_pagamento = converter_data_brasileira(
                valores[2]
            )

            # Valor bruto recebido da fonte.
            valor_bruto = valores[3]

            print(
                f"[FUNDAMENTUS VALOR] {ticker} "
                f"data={data_com} "
                f"bruto={valor_bruto!r}"
            )

            valor = converter_valor_brasileiro(
                valor_bruto
            )

            if (
                    data_com
                    and data_pagamento
                    and valor is not None
            ):
                resultados.append({
                    "ticker": ticker,
                    "dataCom": data_com,
                    "dataPagamento": data_pagamento,
                    "valorUnitario": float(valor),
                    "tipo": tipo or "Rendimento",
                    "fonte": "Fundamentus"
                })

        print(
            f"[FUNDAMENTUS] {ticker}: "
            f"{len(resultados)} proventos encontrados"
        )

    except Exception as e:

        print(
            f"[FUNDAMENTUS] FALHA {ticker}: {e}"
        )

    return resultados


# ============================================================
# YFINANCE
# FONTE DE RESERVA / COMPARAÇÃO
# ============================================================

def buscar_proventos_yfinance(ticker):
    resultados = []

    try:
        simbolo = (
            ticker
            if "." in ticker
            else f"{ticker}.SA"
        )

        ativo = yf.Ticker(simbolo)

        divs = ativo.dividends

        if not divs.empty:

            for data, valor in divs.items():

                data_str = data.strftime("%Y-%m-%d")

                resultados.append({
                    "ticker": ticker,
                    "dataCom": data_str,
                    "dataPagamento": data_str,
                    "valorUnitario": float(valor),
                    "tipo": "Rendimento",
                    "fonte": "yfinance"
                })

        print(
            f"[YFINANCE] {ticker}: "
            f"{len(resultados)} proventos encontrados"
        )

    except Exception as e:

        print(
            f"[YFINANCE] FALHA {ticker}: {e}"
        )

    return resultados


# ============================================================
# CONSOLIDAÇÃO
#
# TODAS AS FONTES SÃO CONSULTADAS.
#
# B3 = FONTE PRINCIPAL
# Fundamentus = RESERVA / COMPARAÇÃO
# yfinance = RESERVA / COMPARAÇÃO
#
# Para o mesmo ticker + data COM:
#
# B3          = 0,080
# Fundamentus = 0,083
#
# Resultado = 0,083
#
# A regra continua sendo pelo MAIOR VALOR NUMÉRICO,
# e não pela quantidade de casas decimais.
# ============================================================

def buscar_todos_proventos(ticker):
    ticker = ticker.upper().strip()

    # ============================================================
    # BUSCA NAS TRÊS FONTES
    # ============================================================

    b3_divs = buscar_proventos_b3(ticker)
    fundamentus_divs = buscar_proventos_fundamentus(ticker)
    yfinance_divs = buscar_proventos_yfinance(ticker)

    todas_fontes = (
            b3_divs
            + fundamentus_divs
            + yfinance_divs
    )

    # ============================================================
    # CONSOLIDAÇÃO
    #
    # REGRA PRINCIPAL:
    # 1. Um único provento por:
    #       TICKER + ANO/MÊS DA DATA DE PAGAMENTO + TIPO
    #
    # 2. Se duas fontes representarem o mesmo provento,
    #    fica somente um registro.
    #
    # 3. O MAIOR valor numérico encontrado é utilizado.
    #
    # 4. B3 tem prioridade para as DATAS.
    #
    # 5. Se não existir B3, Fundamentus é utilizado para as datas.
    #
    # 6. yfinance fica como fonte de comparação/reserva.
    #
    # Não há arredondamento dos valores.
    # ============================================================

    consolidados = {}

    for item in todas_fontes:

        ticker_item = str(
            item.get("ticker", ticker)
        ).upper().strip()

        data_com = item.get("dataCom")
        data_pagamento = item.get("dataPagamento")

        valor = item.get(
            "valorUnitario"
        )

        tipo = str(
            item.get("tipo", "Rendimento")
        ).strip()

        fonte = item.get(
            "fonte",
            "desconhecida"
        )

        if (
                not data_com
                or not data_pagamento
                or valor is None
        ):
            continue

        # --------------------------------------------------------
        # Converte valor somente para comparação.
        # Não arredonda.
        # --------------------------------------------------------

        try:
            valor = float(valor)

        except Exception:
            continue

        if valor <= 0:
            continue

        # --------------------------------------------------------
        # Normaliza data de pagamento
        # --------------------------------------------------------

        data_pagamento_str = str(
            data_pagamento
        )

        partes_pagamento = (
            data_pagamento_str.split("-")
        )

        if len(partes_pagamento) >= 2:

            ano_mes_pagamento = (
                f"{partes_pagamento[0]}-"
                f"{partes_pagamento[1]}"
            )

        else:

            ano_mes_pagamento = (
                data_pagamento_str
            )

        # --------------------------------------------------------
        # Normaliza tipo
        # --------------------------------------------------------

        tipo_normalizado = tipo.upper()

        if "AMORT" in tipo_normalizado:

            tipo_chave = "AMORTIZATION"

        else:

            tipo_chave = "INCOME"

        # --------------------------------------------------------
        # CHAVE FINAL
        #
        # Ticker + mês do pagamento + tipo
        #
        # Mantida a mesma lógica existente para evitar
        # duplicação.
        # --------------------------------------------------------

        chave = (
            ticker_item,
            ano_mes_pagamento,
            tipo_chave
        )

        # --------------------------------------------------------
        # Primeiro registro encontrado
        # --------------------------------------------------------

        if chave not in consolidados:

            consolidados[chave] = {
                "registro": item.copy(),
                "maiorValor": valor,
                "temB3": fonte == "B3",
                "temFundamentus": (
                        fonte == "Fundamentus"
                )
            }

            continue

        atual = consolidados[chave]

        # --------------------------------------------------------
        # Se encontrou valor maior, utiliza o maior valor.
        #
        # Mantém a regra anterior sem arredondar.
        # --------------------------------------------------------

        if valor > atual["maiorValor"]:

            print(
                f"[MAIOR VALOR] {ticker_item} "
                f"{ano_mes_pagamento}: "
                f"{atual['maiorValor']} -> {valor} "
                f"({fonte})"
            )

            atual["maiorValor"] = valor

        # --------------------------------------------------------
        # B3 tem prioridade para as DATAS.
        #
        # Se o primeiro registro foi Fundamentus ou yfinance
        # e depois encontramos B3, substituímos o registro
        # pelas datas da B3.
        # --------------------------------------------------------

        if fonte == "B3":

            if not atual["temB3"]:

                atual["registro"] = item.copy()
                atual["temB3"] = True

        # --------------------------------------------------------
        # Fundamentus só tem prioridade caso B3 ainda não exista.
        #
        # Se já houver B3, as datas B3 permanecem.
        # --------------------------------------------------------

        elif fonte == "Fundamentus":

            if (
                    not atual["temB3"]
                    and not atual["temFundamentus"]
            ):

                atual["registro"] = item.copy()
                atual["temFundamentus"] = True

        # --------------------------------------------------------
        # O valor final sempre será o maior encontrado.
        # --------------------------------------------------------

        atual["registro"]["valorUnitario"] = (
            atual["maiorValor"]
        )

    # ============================================================
    # MONTA RESULTADO FINAL
    # ============================================================

    resultado = [
        dados["registro"]
        for dados in consolidados.values()
    ]

    # ============================================================
    # ORDENA POR DATA DE PAGAMENTO
    # ============================================================

    resultado.sort(
        key=lambda x: (
            x.get("dataPagamento") or "",
            x.get("dataCom") or ""
        )
    )

    # ============================================================
    # LOG FINAL
    # ============================================================

    fontes = set(
        item.get("fonte", "")
        for item in resultado
    )

    print(
        f"[CONSOLIDADO] {ticker}: "
        f"{len(resultado)} proventos "
        f"comparando B3 + FUNDAMENTUS + YFINANCE "
        f"| fontes finais: "
        f"{', '.join(fontes) or 'nenhuma'}"
    )

    # ------------------------------------------------------------
    # Mostra os resultados finais para conferência
    # ------------------------------------------------------------

    for item in resultado:

        print(
            f"[PROVENTO FINAL] "
            f"{item.get('ticker')} | "
            f"COM={item.get('dataCom')} | "
            f"PAG={item.get('dataPagamento')} | "
            f"VALOR={item.get('valorUnitario')} | "
            f"FONTE={item.get('fonte')}"
        )

    return resultado


# ============================================================
# TESTE FNET - CONSULTA DIRETA
#
# Fluxo:
# Ticker
#   ↓
# CNPJ
#   ↓
# abrirGerenciadorDocumentosCVM
#   ↓
# pesquisarGerenciadorDocumentosDados
#   ↓
# ID do documento
#   ↓
# exibirDocumento
# ============================================================

FII_CNPJ = {
    # --- INFRAESTRUTURA / FI-INFRA ---
    "BODB11": "41.771.670/0001-99",
    "KDIF11": "26.324.298/0001-89",
    "SNID11": "48.969.881/0001-80",
    "XPID11": "37.404.867/0001-12",
    "BDIF11": "40.502.607/0001-94",
    "JURO11": "42.730.834/0001-00",
    "CPTI11": "38.065.012/0001-77",

    # --- FUNDOS DE PAPEL ---
    "MXRF11": "97.521.225/0001-25",
    "PCIP11": "28.729.197/0001-13",
    "KNCR11": "16.706.958/0001-32",
    "MCCI11": "23.648.935/0001-84",
    "IRDM11": "28.830.325/0001-10",
    "DEVA11": "37.087.810/0001-37",
    "VGIR11": "29.852.732/0001-91",
    "KNIP11": "24.960.430/0001-13",
    "HGLS11": "32.067.896/0001-57",
    "RBRR11": "29.467.977/0001-03",
    "RECR11": "28.152.272/0001-26",
    "HCTR11": "30.248.180/0001-96",
    "VGHF11": "36.771.692/0001-19",
    "TGLT11": "33.516.270/0001-00",
    "BARI11": "29.267.567/0001-00",
    "CLIN11": "49.005.348/0001-60",
    "CVBI11": "28.729.197/0001-13",
    "GCRA11": "37.037.297/0001-70",
    "HABT11": "30.578.417/0001-05",
    "OUFF11": "30.791.386/0001-68",
    "PORD11": "28.718.730/0001-44",
    "RZAK11": "36.642.219/0001-31",
    "VGRI11": "53.656.482/0001-07",
    "RBRX11": "41.088.458/0001-21",

    # --- FUNDOS DE TIJOLO ---
    "HGLG11": "11.728.688/0001-47",
    "KNRI11": "12.005.956/0001-65",
    "XPML11": "28.757.546/0001-00",
    "VISC11": "17.554.274/0001-25",
    "BTLG11": "11.839.593/0001-09",
    "XPLG11": "26.502.794/0001-85",
    "RECT11": "32.274.163/0001-59",
    "LVBI11": "30.629.603/0001-18",
    "GGRC11": "26.614.291/0001-00",
    "MALL11": "26.499.833/0001-32",
    "TGAR11": "25.032.881/0001-53",
    "RBVA11": "15.576.907/0001-70",
    "ALZR11": "28.737.771/0001-85",
    "HGRU11": "29.641.226/0001-53",
    "BRCO11": "20.748.515/0001-81",
    "HSLG11": "32.903.621/0001-71",
    "PVBI11": "35.652.102/0001-76",
    "JSRE11": "13.371.132/0001-71",
    "FLMA11": "04.141.645/0001-03",
    "PATC11": "13.687.940/0001-44",
    "SARE11": "32.903.702/0001-71",
    "TRNT11": "04.722.883/0001-02",
    "VILG11": "24.853.044/0001-22",
    "ONEF11": "12.948.291/0001-23",
    "RBRP11": "21.408.063/0001-51",
    "BLMG11": "32.062.247/0001-52",
    "EDGA11": "15.333.306/0001-37",
    "TRXF11": "28.548.288/0001-52",
    "HGBS11": "08.431.747/0001-06",
    "GARE11": "37.295.919/0001-60",
    "DAMA11": "53.866.872/0001-01",

    # --- FUNDOS DE FUNDOS (FOFs) ---
    "BCFF11": "11.026.627/0001-38",
    "RBRF11": "27.529.279/0001-51",
    "HFOF11": "18.307.582/0001-19",
    "KFOF11": "30.091.444/0001-40",
    "BPFF11": "17.324.357/0001-28",
    "CPFF11": "34.081.611/0001-23",
    "MCHF11": "40.916.278/0001-20",
    "MFII11": "16.915.968/0001-88",
}

def fnet_normalizar_cnpj(cnpj):
    return re.sub(r"\D", "", str(cnpj))


def fnet_obter_cnpj(ticker):
    ticker = ticker.strip().upper()
    return FII_CNPJ.get(ticker)


def fnet_buscar_documentos(ticker, quantidade=10):

    ticker = ticker.strip().upper()

    cnpj = fnet_obter_cnpj(ticker)

    if not cnpj:
        return {
            "erro": f"CNPJ nao encontrado para {ticker}"
        }

    cnpj_normalizado = fnet_normalizar_cnpj(cnpj)

    print(
        f"[FNET TESTE] {ticker}: "
        f"CNPJ={cnpj_normalizado}"
    )

    # --------------------------------------------------------
    # IMPORTANTE:
    # O TS primeiro abre esta página para criar a sessão.
    # --------------------------------------------------------

    pagina_url = (
        "https://fnet.bmfbovespa.com.br/fnet/publico/"
        "abrirGerenciadorDocumentosCVM"
        f"?cnpjFundo={cnpj_normalizado}"
    )

    headers_pagina = {
        "Accept": (
            "text/html,application/xhtml+xml,"
            "application/xml;q=0.9,*/*;q=0.8"
        ),
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/140.0 Safari/537.36"
        ),
    }

    # Session é importante porque a segunda chamada
    # depende da sessão criada pela primeira.
    sessao = requests.Session()

    pagina = sessao.get(
        pagina_url,
        headers=headers_pagina,
        timeout=30
    )

    print(
        f"[FNET TESTE] {ticker}: "
        f"pagina HTTP {pagina.status_code}"
    )

    if not pagina.ok:
        return {
            "ticker": ticker,
            "cnpj": cnpj,
            "etapa": "abrirGerenciadorDocumentosCVM",
            "http": pagina.status_code,
            "erro": "Falha ao abrir pagina FNET"
        }

    # --------------------------------------------------------
    # SEGUNDA CHAMADA
    #
    # Esta URL é exatamente a do código TS enviado.
    # --------------------------------------------------------

    documentos_url = (
        "https://fnet.bmfbovespa.com.br/fnet/publico/"
        "pesquisarGerenciadorDocumentosDados"
        "?d=1"
        "&s=0"
        f"&l={quantidade}"
        "&o%5B0%5D%5BdataReferencia%5D=desc"
        "&idCategoriaDocumento=0"
        "&idTipoDocumento=0"
        "&idEspecieDocumento=0"
        "&isSession=true"
    )

    headers_documentos = {
        "Accept": (
            "application/json, text/javascript, */*; q=0.01"
        ),
        "User-Agent": headers_pagina["User-Agent"],
        "Referer": pagina_url,
        "X-Requested-With": "XMLHttpRequest",
    }

    resposta = sessao.get(
        documentos_url,
        headers=headers_documentos,
        timeout=30
    )

    print(
        f"[FNET TESTE] {ticker}: "
        f"documentos HTTP {resposta.status_code}"
    )

    if not resposta.ok:
        return {
            "ticker": ticker,
            "cnpj": cnpj,
            "etapa": "pesquisarGerenciadorDocumentosDados",
            "http": resposta.status_code,
            "erro": "Falha ao consultar documentos FNET"
        }

    try:
        json_fnet = resposta.json()

    except Exception as e:

        return {
            "ticker": ticker,
            "cnpj": cnpj,
            "etapa": "json",
            "http": resposta.status_code,
            "erro": f"Resposta nao e JSON: {e}",
            "resposta_inicio": resposta.text[:1000]
        }

    documentos = json_fnet.get(
        "data",
        []
    )

    if not isinstance(documentos, list):
        documentos = []

    resultado = []

    for item in documentos:

        if not item.get("id"):
            continue

        documento_id = int(
            item["id"]
        )

        link = (
            "https://fnet.bmfbovespa.com.br/fnet/publico/"
            f"exibirDocumento?id={documento_id}&cvm=true"
        )

        resultado.append({
            "id": documento_id,
            "dataReferencia": item.get(
                "dataReferencia",
                ""
            ),
            "dataEntrega": item.get(
                "dataEntrega",
                ""
            ),
            "categoriaDocumento": item.get(
                "categoriaDocumento",
                ""
            ),
            "tipoDocumento": item.get(
                "tipoDocumento",
                ""
            ),
            "descricaoFundo": item.get(
                "descricaoFundo",
                ""
            ),
            "nomePregao": item.get(
                "nomePregao",
                ""
            ),
            "status": item.get(
                "status",
                ""
            ),
            "situacaoDocumento": item.get(
                "situacaoDocumento",
                ""
            ),
            "linkDocumento": link
        })

    print(
        f"[FNET TESTE] {ticker}: "
        f"{len(resultado)} documentos encontrados"
    )

    return {
        "ticker": ticker,
        "cnpj": cnpj,
        "cnpjNormalizado": cnpj_normalizado,
        "recordsTotal": json_fnet.get(
            "recordsTotal",
            0
        ),
        "documentos": resultado
    }


def fnet_extrair_documento(sessao, documento_id):

    url = (
        "https://fnet.bmfbovespa.com.br/fnet/publico/"
        f"exibirDocumento?id={documento_id}&cvm=true"
    )

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/140.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,"
            "application/xml;q=0.9,*/*;q=0.8"
        ),
        "Referer": (
            "https://fnet.bmfbovespa.com.br/"
            "fnet/publico/"
        )
    }

    resposta = sessao.get(
        url,
        headers=headers,
        timeout=30
    )

    print(
        f"[FNET DOCUMENTO] ID={documento_id} "
        f"HTTP={resposta.status_code} "
        f"tamanho={len(resposta.text)}"
    )

    if not resposta.ok:

        return {
            "id": documento_id,
            "url": url,
            "http": resposta.status_code,
            "erro": "Falha ao abrir documento"
        }

    texto = limpar_html(
        resposta.text
    )

    return {
        "id": documento_id,
        "url": url,
        "http": resposta.status_code,
        "html_tamanho": len(resposta.text),
        "texto": texto
    }


def fnet_extrair_dados_provento(
        texto,
        documento_id
):

    resultado = {
        "documentoId": documento_id,
        "dataBase": None,
        "valorProvento": None,
        "dataPagamento": None,
        "periodo": None,
        "isentoIR": None
    }

    texto_limpo = re.sub(
        r"\s+",
        " ",
        texto
    )

    match = re.search(
        r"Data-base.*?(\d{2}/\d{2}/\d{4})",
        texto_limpo,
        re.IGNORECASE
    )

    if match:
        resultado["dataBase"] = match.group(1)

    match = re.search(
        r"Valor do provento.*?(\d+,\d+)",
        texto_limpo,
        re.IGNORECASE
    )

    if match:

        resultado["valorProvento"] = (
            converter_valor_brasileiro(
                match.group(1)
            )
        )

    match = re.search(
        r"Data do pagamento.*?(\d{2}/\d{2}/\d{4})",
        texto_limpo,
        re.IGNORECASE
    )

    if match:
        resultado["dataPagamento"] = match.group(1)

    match = re.search(
        r"Período de referência\s*([A-Za-zÀ-ÿ]+)",
        texto_limpo,
        re.IGNORECASE
    )

    if match:
        resultado["periodo"] = match.group(1)

    match = re.search(
        r"Rendimento isento de IR\*?\s*(Sim|Não)",
        texto_limpo,
        re.IGNORECASE
    )

    if match:

        resultado["isentoIR"] = (
                match.group(1).lower() == "sim"
        )

    return resultado


# ============================================================
# API FNET
# ============================================================

@app.route(
    "/api/fnet/provento",
    methods=["GET"]
)
def api_fnet_provento():

    ticker = request.args.get(
        "ticker",
        ""
    ).upper().strip()

    if not ticker:

        return jsonify({
            "status": "ERRO",
            "error": "Ticker nao informado"
        }), 400

    try:

        ticker = ticker.upper().strip()

        cnpj = fnet_obter_cnpj(
            ticker
        )

        if not cnpj:

            return jsonify({
                "status": "ERRO",
                "ticker": ticker,
                "error": "CNPJ nao encontrado"
            }), 404

        cnpj_normalizado = (
            fnet_normalizar_cnpj(cnpj)
        )

        # ----------------------------------------------------
        # SESSION
        # ----------------------------------------------------

        sessao = requests.Session()

        user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/140.0 Safari/537.36"
        )

        # ----------------------------------------------------
        # 1 - ABRE GERENCIADOR
        # ----------------------------------------------------

        pagina_url = (
            "https://fnet.bmfbovespa.com.br/fnet/publico/"
            "abrirGerenciadorDocumentosCVM"
            f"?cnpjFundo={cnpj_normalizado}"
        )

        pagina = sessao.get(
            pagina_url,
            headers={
                "Accept": (
                    "text/html,application/xhtml+xml,"
                    "application/xml;q=0.9,*/*;q=0.8"
                ),
                "User-Agent": user_agent
            },
            timeout=30
        )

        print(
            f"[FNET API] {ticker}: "
            f"gerenciador HTTP "
            f"{pagina.status_code}"
        )

        if not pagina.ok:

            return jsonify({
                "status": "ERRO",
                "ticker": ticker,
                "cnpj": cnpj,
                "etapa": "gerenciador",
                "http": pagina.status_code
            }), 502

        # ----------------------------------------------------
        # 2 - PESQUISA DOCUMENTOS
        # ----------------------------------------------------

        documentos_url = (
            "https://fnet.bmfbovespa.com.br/fnet/publico/"
            "pesquisarGerenciadorDocumentosDados"
            "?d=1"
            "&s=0"
            "&l=100"
            "&o%5B0%5D%5BdataReferencia%5D=desc"
            "&idCategoriaDocumento=0"
            "&idTipoDocumento=0"
            "&idEspecieDocumento=0"
            "&isSession=true"
        )

        resposta = sessao.get(
            documentos_url,
            headers={
                "Accept": (
                    "application/json, text/javascript, */*; q=0.01"
                ),
                "User-Agent": user_agent,
                "Referer": pagina_url,
                "X-Requested-With": "XMLHttpRequest"
            },
            timeout=30
        )

        print(
            f"[FNET API] {ticker}: "
            f"documentos HTTP "
            f"{resposta.status_code}"
        )

        if not resposta.ok:

            return jsonify({
                "status": "ERRO",
                "ticker": ticker,
                "cnpj": cnpj,
                "etapa": "documentos",
                "http": resposta.status_code
            }), 502

        try:

            dados = resposta.json()

        except Exception:

            return jsonify({
                "status": "ERRO",
                "ticker": ticker,
                "cnpj": cnpj,
                "etapa": "documentos",
                "erro": "FNET nao retornou JSON",
                "resposta": resposta.text[:2000]
            }), 502

        documentos = dados.get(
            "data",
            []
        )

        if not isinstance(
                documentos,
                list
        ):
            documentos = []

        # ----------------------------------------------------
        # 3 - PEGA OS IDs
        # ----------------------------------------------------

        lista_documentos = []

        for item in documentos:

            if not item.get("id"):
                continue

            documento_id = int(
                item["id"]
            )

            link = (
                "https://fnet.bmfbovespa.com.br/fnet/publico/"
                f"exibirDocumento?id={documento_id}&cvm=true"
            )

            lista_documentos.append({
                "id": documento_id,
                "dataReferencia": item.get(
                    "dataReferencia",
                    ""
                ),
                "dataEntrega": item.get(
                    "dataEntrega",
                    ""
                ),
                "categoriaDocumento": item.get(
                    "categoriaDocumento",
                    ""
                ),
                "tipoDocumento": item.get(
                    "tipoDocumento",
                    ""
                ),
                "descricaoFundo": item.get(
                    "descricaoFundo",
                    ""
                ),
                "nomePregao": item.get(
                    "nomePregao",
                    ""
                ),
                "status": item.get(
                    "status",
                    ""
                ),
                "situacaoDocumento": item.get(
                    "situacaoDocumento",
                    ""
                ),
                "linkDocumento": link
            })

        # ----------------------------------------------------
        # 4 - PROCURA O DOCUMENTO DE PROVENTOS
        # ----------------------------------------------------

        documento_alvo = None

        for item in lista_documentos:

            tipo = str(item.get("tipoDocumento", ""))
            situacao = str(item.get("situacaoDocumento", ""))

            print(
                f"[FNET DEBUG] {ticker} | "
                f"tipoDocumento={tipo!r} | "
                f"situacaoDocumento={situacao!r} | "
                f"id={item.get('id')}"
            )

            if "Rendimentos" in tipo:
                documento_alvo = item
                break

        if not documento_alvo:

            return jsonify({
                "status": "ERRO",
                "ticker": ticker,
                "cnpj": cnpj,
                "etapa": "documento_provento",
                "erro": (
                    "Documento de Rendimentos e "
                    "Amortizações não encontrado"
                )
            }), 404

        documento = fnet_extrair_documento(
            sessao,
            documento_alvo["id"]
        )

        # ----------------------------------------------------
        # RESULTADO DO TESTE
        # ----------------------------------------------------

        dados_provento = (
            fnet_extrair_dados_provento(
                documento["texto"],
                documento_alvo["id"]
            )
        )

        return jsonify({
            "status": "OK",
            "ticker": ticker,
            "cnpj": cnpj,
            "provento": dados_provento
        })

    except Exception as e:

        print(
            f"[FNET API] FALHA "
            f"{ticker}: {e}"
        )

        return jsonify({
            "status": "ERRO",
            "ticker": ticker,
            "error": str(e)
        }), 500


# ============================================================
# API DE PROVENTOS - UM FII
# ============================================================

@app.route(
    "/api/proventos",
    methods=["GET"]
)
def get_proventos():

    ticker = request.args.get(
        "ticker",
        ""
    ).upper().strip()

    if not ticker:

        return jsonify({
            "error": "Ticker nao informado"
        }), 400

    try:

        lista_divs = (
            buscar_todos_proventos(
                ticker
            )
        )

        return jsonify({
            "dividends": lista_divs,
            "status": "OK"
        })

    except Exception as e:

        print(
            f"[API PROVENTOS] FALHA "
            f"{ticker}: {e}"
        )

        return jsonify({
            "error": str(e)
        }), 500


# ============================================================
# API DE PROVENTOS - VÁRIOS FIIs
# ============================================================

@app.route(
    "/api/proventos-lote",
    methods=["GET"]
)
def get_proventos_lote():

    tickers_param = request.args.get(
        "tickers",
        ""
    ).upper().strip()

    if not tickers_param:

        return jsonify({
            "error": "Nenhum ticker informado"
        }), 400

    lista_tickers = [
        t.strip()
        for t in tickers_param.split(",")
        if t.strip()
    ]

    resultado_geral = []

    for ticker in lista_tickers:

        try:

            proventos = (
                buscar_todos_proventos(
                    ticker
                )
            )

            resultado_geral.extend(
                proventos
            )

        except Exception as e:

            print(
                f"[LOTE] FALHA "
                f"{ticker}: {e}"
            )

            continue

    return jsonify({
        "dividends": resultado_geral,
        "status": "OK"
    })


# ============================================================
# COTAÇÃO
#
# YFINANCE
# ============================================================

@app.route(
    "/api/cotacao/<ticker>",
    methods=["GET"]
)
def get_cotacao(ticker):

    ticker = ticker.upper().strip()

    try:

        simbolo = (
            ticker
            if "." in ticker
            else f"{ticker}.SA"
        )

        ativo = yf.Ticker(
            simbolo
        )

        preco = None

        # ----------------------------------------------------
        # PRIMEIRA TENTATIVA
        # ----------------------------------------------------

        try:

            preco = ativo.fast_info.get(
                "lastPrice"
            )

        except Exception:

            pass

        # ----------------------------------------------------
        # SEGUNDA TENTATIVA
        # ----------------------------------------------------

        if preco is None:

            try:

                preco = ativo.info.get(
                    "regularMarketPrice"
                )

            except Exception:

                pass

        # ----------------------------------------------------
        # NÃO ENCONTROU
        # ----------------------------------------------------

        if preco is None:

            return jsonify({
                "ticker": ticker,
                "price": None,
                "status": "ERRO",
                "message": "Cotacao nao encontrada"
            }), 404

        # ----------------------------------------------------
        # RETORNA COTAÇÃO
        # ----------------------------------------------------

        return jsonify({
            "ticker": ticker,
            "price": float(preco),
            "status": "OK"
        })

    except Exception as e:

        return jsonify({
            "ticker": ticker,
            "price": None,
            "status": "ERRO",
            "message": str(e)
        }), 500


# ============================================================
# PÁGINA INICIAL
# ============================================================

@app.route("/")
def home():

    return (
        "<h1>Servidor FII Guard Ativo</h1>"
        "<p>Proventos: B3 + Fundamentus + yfinance "
        "comparando pelo maior valor</p>"
        "<p>Cotacoes: yfinance</p>"
    )


# ============================================================
# EXECUÇÃO LOCAL
# ============================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )