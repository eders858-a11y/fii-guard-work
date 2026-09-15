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

    # Busca nas duas fontes
    fundamentus_divs = buscar_proventos_fundamentus(ticker)
    yfinance_divs = buscar_proventos_yfinance(ticker)

    todas_fontes = fundamentus_divs + yfinance_divs

    # ============================================================
    # CONSOLIDAÇÃO
    #
    # REGRA:
    # 1. Um único provento por ANO + MÊS
    # 2. O MAIOR valor numérico entre as fontes é utilizado
    # 3. Se existir Fundamentus no mês:
    #       - mantém Data COM do Fundamentus
    #       - mantém Data de Pagamento do Fundamentus
    #       - usa o maior valor encontrado
    # 4. Se não existir Fundamentus:
    #       - utiliza o registro do yfinance
    # ============================================================

    consolidados = {}

    for item in todas_fontes:
        ticker_item = item.get("ticker", ticker)
        data_com = item.get("dataCom")
        valor = item.get("valorUnitario")
        fonte = item.get("fonte", "desconhecida")

        if not data_com or valor is None:
            continue

        # Converte somente para comparação.
        # Não arredonda o valor.
        try:
            valor = float(valor)
        except Exception:
            continue

        if valor <= 0:
            continue

        # --------------------------------------------------------
        # Agrupa por ANO + MÊS da Data COM
        # --------------------------------------------------------
        partes = str(data_com).split("-")

        if len(partes) >= 2:
            chave_mes = f"{partes[0]}-{partes[1]}"
        else:
            chave_mes = str(data_com)

        chave = (ticker_item, chave_mes)

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
        # Verifica se encontrou valor maior
        # --------------------------------------------------------
        if valor > atual["maiorValor"]:
            print(
                f"[MAIOR VALOR] {ticker_item} "
                f"{chave_mes}: "
                f"{atual['maiorValor']} -> {valor} "
                f"({fonte})"
            )

            atual["maiorValor"] = valor

        # --------------------------------------------------------
        # Fundamentus tem prioridade para as DATAS
        #
        # Mesmo que o yfinance tenha o valor maior,
        # NÃO substituímos o registro inteiro.
        # Apenas atualizamos o valor.
        # --------------------------------------------------------
        if fonte == "Fundamentus":
            if not atual["temFundamentus"]:
                atual["registro"] = item.copy()
                atual["temFundamentus"] = True

        # --------------------------------------------------------
        # O valor final sempre será o MAIOR encontrado
        # --------------------------------------------------------
        atual["registro"]["valorUnitario"] = atual["maiorValor"]

    # ============================================================
    # Monta resultado final
    # ============================================================

    resultado = [
        dados["registro"]
        for dados in consolidados.values()
    ]

    # Ordena pela Data COM e depois pela Data de Pagamento
    resultado.sort(
        key=lambda x: (
            x.get("dataCom") or "",
            x.get("dataPagamento") or ""
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

    # Mostra os resultados finais para conferência
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