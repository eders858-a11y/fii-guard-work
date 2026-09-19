from flask import Flask, jsonify, request
import yfinance as yf
import requests
import re
import html

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
# FUNDAMENTUS
# FONTE DOS PROVENTOS
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
# Para o mesmo ticker + data COM:
#
# Fundamentus = 0,080
# Outra fonte = 0,083
#
# Resultado = 0,083
#
# A regra é pelo MAIOR VALOR NUMÉRICO,
# e não pela quantidade de casas decimais.
# ============================================================

def buscar_todos_proventos(ticker):
    ticker = ticker.upper().strip()

    # ============================================================
    # BUSCA NAS DUAS FONTES
    # ============================================================

    fundamentus_divs = buscar_proventos_fundamentus(ticker)
    yfinance_divs = buscar_proventos_yfinance(ticker)

    todas_fontes = fundamentus_divs + yfinance_divs

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
    # 4. Se existir Fundamentus, suas datas são preservadas.
    #
    # Isso evita, por exemplo:
    #
    # Fundamentus:
    # 31/08/2026 -> pagamento 08/09/2026 -> R$ 0,083
    #
    # yfinance:
    # 01/09/2026 -> pagamento 01/09/2026 -> R$ 0,083
    #
    # Os dois pertencem a SETEMBRO/2026 e representam
    # o mesmo provento.
    # ============================================================

    consolidados = {}

    for item in todas_fontes:
        ticker_item = str(
            item.get("ticker", ticker)
        ).upper().strip()

        data_com = item.get("dataCom")
        data_pagamento = item.get("dataPagamento")
        valor = item.get("valorUnitario")
        tipo = str(
            item.get("tipo", "Rendimento")
        ).strip()

        fonte = item.get("fonte", "desconhecida")

        if not data_com or not data_pagamento or valor is None:
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

        data_pagamento_str = str(data_pagamento)

        partes_pagamento = data_pagamento_str.split("-")

        if len(partes_pagamento) >= 2:
            ano_mes_pagamento = (
                f"{partes_pagamento[0]}-"
                f"{partes_pagamento[1]}"
            )
        else:
            ano_mes_pagamento = data_pagamento_str

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
                "temFundamentus": fonte == "Fundamentus"
            }

            continue

        atual = consolidados[chave]

        # --------------------------------------------------------
        # Se encontrou valor maior, utiliza o maior valor.
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
        # Fundamentus tem prioridade para as DATAS.
        #
        # Se o primeiro registro foi yfinance e depois encontramos
        # Fundamentus, substituímos o registro pelas datas do
        # Fundamentus.
        # --------------------------------------------------------

        if fonte == "Fundamentus":

            if not atual["temFundamentus"]:
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
        f"comparando FUNDAMENTUS + YFINANCE "
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
    "BODB11": "41.771.670/0001-99",
    "KDIF11": "08.604.187/0001-44",
    "SNID11": "48.969.881/0001-80",
    "XPID11": "37.404.867/0001-12",
    "BDIF11": "40.502.607/0001-94",
    "JURO11": "42.730.834/0001-00",
    "CPTI11": "38.065.012/0001-77",

    "MXRF11": "97.589.534/0001-10",
    "CPTS11": "13.932.775/0001-68",
    "KNCR11": "12.012.355/0001-10",
    "MCCI11": "30.446.526/0001-43",
    "IRDM11": "28.922.977/0001-20",
    "DEVA11": "37.146.741/0001-09",
    "VGIR11": "33.918.239/0001-34",
    "KNIP11": "15.048.917/0001-04",
    "HGLS11": "32.067.896/0001-57",
    "RBRR11": "28.740.169/0001-24",
    "RECR11": "28.528.275/0001-76",
    "HCTR11": "27.636.574/0001-20",
    "VGHF11": "37.798.818/0001-92",
    "TGLT11": "33.516.270/0001-00",
    "BARI11": "28.231.130/0001-20",
    "CLIN11": "45.029.135/0001-07",
    "CVBI11": "30.019.539/0001-05",
    "GCRA11": "41.657.442/0001-04",
    "HABT11": "32.536.858/0001-07",
    "OUFF11": "21.603.882/0001-00",
    "PORD11": "28.718.730/0001-44",
    "RZAK11": "37.525.045/0001-04",

    "HGLG11": "11.728.896/0001-89",
    "KNRI11": "12.003.768/0001-77",
    "XPML11": "28.767.113/0001-38",
    "VISC11": "24.771.748/0001-20",
    "BTLG11": "15.311.609/0001-05",
    "XPLG11": "26.568.228/0001-50",
    "RECT11": "28.533.366/0001-39",
    "LVBI11": "32.883.391/0001-06",
    "GGRC11": "18.398.805/0001-90",
    "MALL11": "30.347.019/0001-50",
    "TGAR11": "25.032.553/0001-06",
    "RBVA11": "13.111.458/0001-98",
    "ALZR11": "28.548.868/0001-50",
    "HGRU11": "28.155.198/0001-94",
    "BRCO11": "29.986.377/0001-35",
    "HSLG11": "34.195.578/0001-30",
    "PVBI11": "34.197.519/0001-00",
    "JSRE11": "09.118.892/0001-17",
    "FLMA11": "10.669.516/0001-20",
    "PATC11": "13.687.940/0001-44",
    "SARE11": "34.805.515/0001-14",
    "TRNT11": "03.047.886/0001-03",
    "VILG11": "31.399.043/0001-41",
    "ONEF11": "14.380.518/0001-42",
    "RBRP11": "16.924.965/0001-10",
    "BLMG11": "32.062.247/0001-52",
    "EDGA11": "13.370.217/0001-20",
    "TRXF11": "28.548.288/0001-52",
    "HGBS11": "13.090.934/0001-07",
    "GARE11": "42.066.533/0001-20",
    "VGRI11": "41.564.045/0001-91",
    "DAMA11": "36.331.026/0001-44",
    "RBRX11": "40.540.091/0001-08",

    "BCFF11": "11.666.195/0001-57",
    "RBRF11": "28.533.275/0001-13",
    "HFOF11": "28.877.060/0001-50",
    "KFOF11": "34.195.601/0001-05",
    "BPFF11": "17.761.352/0001-79",
    "CPFF11": "31.399.027/0001-19",
    "MCHF11": "40.916.278/0001-20",
    "MFII11": "11.392.207/0001-20",
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

    documentos = json_fnet.get("data", [])

    if not isinstance(documentos, list):
        documentos = []

    resultado = []

    for item in documentos:

        if not item.get("id"):
            continue

        documento_id = int(item["id"])

        link = (
            "https://fnet.bmfbovespa.com.br/fnet/publico/"
            f"exibirDocumento?id={documento_id}&cvm=true"
        )

        resultado.append({
            "id": documento_id,
            "dataReferencia": item.get(
                "dataReferencia", ""
            ),
            "dataEntrega": item.get(
                "dataEntrega", ""
            ),
            "categoriaDocumento": item.get(
                "categoriaDocumento", ""
            ),
            "tipoDocumento": item.get(
                "tipoDocumento", ""
            ),
            "descricaoFundo": item.get(
                "descricaoFundo", ""
            ),
            "nomePregao": item.get(
                "nomePregao", ""
            ),
            "status": item.get(
                "status", ""
            ),
            "situacaoDocumento": item.get(
                "situacaoDocumento", ""
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
            "recordsTotal", 0
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

    texto = limpar_html(resposta.text)

    return {
        "id": documento_id,
        "url": url,
        "http": resposta.status_code,
        "html_tamanho": len(resposta.text),
        "texto": texto
    }


@app.route("/api/fnet/provento", methods=["GET"])
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

        cnpj = fnet_obter_cnpj(ticker)

        if not cnpj:
            return jsonify({
                "status": "ERRO",
                "ticker": ticker,
                "error": "CNPJ nao encontrado"
            }), 404

        cnpj_normalizado = fnet_normalizar_cnpj(cnpj)

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
            f"gerenciador HTTP {pagina.status_code}"
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
            "&l=10"
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
            f"documentos HTTP {resposta.status_code}"
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

        documentos = dados.get("data", [])

        if not isinstance(documentos, list):
            documentos = []

        # ----------------------------------------------------
        # 3 - PEGA OS IDs
        # ----------------------------------------------------

        lista_documentos = []

        for item in documentos:

            if not item.get("id"):
                continue

            documento_id = int(item["id"])

            link = (
                "https://fnet.bmfbovespa.com.br/fnet/publico/"
                f"exibirDocumento?id={documento_id}&cvm=true"
            )

            lista_documentos.append({
                "id": documento_id,
                "dataReferencia": item.get(
                    "dataReferencia", ""
                ),
                "dataEntrega": item.get(
                    "dataEntrega", ""
                ),
                "categoriaDocumento": item.get(
                    "categoriaDocumento", ""
                ),
                "tipoDocumento": item.get(
                    "tipoDocumento", ""
                ),
                "descricaoFundo": item.get(
                    "descricaoFundo", ""
                ),
                "nomePregao": item.get(
                    "nomePregao", ""
                ),
                "status": item.get(
                    "status", ""
                ),
                "situacaoDocumento": item.get(
                    "situacaoDocumento", ""
                ),
                "linkDocumento": link
            })

        # ----------------------------------------------------
        # 4 - ABRE O PRIMEIRO DOCUMENTO
        #
        # Ainda NÃO estamos filtrando provento.
        # Primeiro queremos enxergar exatamente o que o FNET
        # está entregando.
        # ----------------------------------------------------

        primeiro_documento = None

        if lista_documentos:

            primeiro_documento = (
                lista_documentos[0]
            )

            documento_id = primeiro_documento["id"]

            documento = fnet_extrair_documento(
                sessao,
                documento_id
            )

        else:

            documento = None

        # ----------------------------------------------------
        # RESULTADO DO TESTE
        # ----------------------------------------------------

        return jsonify({
            "status": "OK",
            "ticker": ticker,
            "cnpj": cnpj,
            "cnpjNormalizado": cnpj_normalizado,
            "recordsTotal": dados.get(
                "recordsTotal", 0
            ),
            "quantidadeDocumentos": len(
                lista_documentos
            ),
            "documentos": lista_documentos,
            "primeiroDocumento": documento
        })

    except Exception as e:

        print(
            f"[FNET API] FALHA {ticker}: {e}"
        )

        return jsonify({
            "status": "ERRO",
            "ticker": ticker,
            "error": str(e)
        }), 500
# ============================================================
# API DE PROVENTOS - UM FII
# ============================================================

@app.route("/api/proventos", methods=["GET"])
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

        lista_divs = buscar_todos_proventos(
            ticker
        )

        return jsonify({
            "dividends": lista_divs,
            "status": "OK"
        })

    except Exception as e:

        print(
            f"[API PROVENTOS] FALHA {ticker}: {e}"
        )

        return jsonify({
            "error": str(e)
        }), 500


# ============================================================
# API DE PROVENTOS - VÁRIOS FIIs
# ============================================================

@app.route("/api/proventos-lote", methods=["GET"])
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

            proventos = buscar_todos_proventos(
                ticker
            )

            resultado_geral.extend(
                proventos
            )

        except Exception as e:

            print(
                f"[LOTE] FALHA {ticker}: {e}"
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

        ativo = yf.Ticker(simbolo)

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
        "<p>Proventos: Fundamentus + yfinance "
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