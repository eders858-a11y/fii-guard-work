from flask import Flask, jsonify, request
import yfinance as yf
import requests
import re
import html

app = Flask(__name__)

FUNDAMENTUS_URL = "https://www.fundamentus.com.br/fii_proventos.php"


# ============================================================
# FUNÇÕES AUXILIARES - FUNDAMENTUS
# ============================================================

def limpar_html(texto):
    texto = html.unescape(texto)
    texto = re.sub(r"<[^>]+>", "", texto)
    return texto.strip()


def converter_valor_brasileiro(valor):
    try:
        valor = valor.strip()
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


def buscar_proventos_fundamentus(ticker):
    """
    Busca os proventos do FII no Fundamentus.

    Retorna:
        ticker
        dataCom
        dataPagamento
        valorUnitario
        tipo
        fonte
    """

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
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
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

        # Procura todas as linhas da tabela.
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

            data_com = converter_data_brasileira(
                valores[0]
            )

            tipo = valores[1].strip()

            data_pagamento = converter_data_brasileira(
                valores[2]
            )

            valor = converter_valor_brasileiro(
                valores[3]
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

                data_str = data.strftime(
                    "%Y-%m-%d"
                )

                resultados.append({
                    "ticker": ticker,
                    "dataCom": data_str,
                    "dataPagamento": data_str,
                    "valorUnitario": float(valor),
                    "tipo": "Rendimento",
                    "fonte": "yfinance"
                })

    except Exception as e:
        print(
            f"[YFINANCE] FALHA {ticker}: {e}"
        )

    return resultados


# ============================================================
# CONSOLIDAÇÃO DAS DUAS FONTES
# ============================================================

def buscar_todos_proventos(ticker):

    ticker = ticker.upper().strip()

    yfinance_divs = buscar_proventos_yfinance(
        ticker
    )

    fundamentus_divs = buscar_proventos_fundamentus(
        ticker
    )

    # Chave principal:
    # ticker + data-com
    #
    # Fundamentus tem prioridade porque fornece
    # data-com e data de pagamento separadamente.
    consolidados = {}

    for item in yfinance_divs:

        chave = (
            item["ticker"],
            item["dataCom"]
        )

        consolidados[chave] = item

    for item in fundamentus_divs:

        chave = (
            item["ticker"],
            item["dataCom"]
        )

        consolidados[chave] = item

    resultado = list(
        consolidados.values()
    )

    resultado.sort(
        key=lambda x: (
                x.get("dataCom") or ""
        )
    )

    print(
        f"[CONSOLIDADO] {ticker}: "
        f"{len(resultado)} proventos"
    )

    return resultado


# ============================================================
# API - PROVENTOS INDIVIDUAL
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

        lista_divs = buscar_todos_proventos(
            ticker
        )

        return jsonify({
            "dividends": lista_divs,
            "status": "OK"
        })

    except Exception as e:

        return jsonify({
            "error": str(e)
        }), 500


# ============================================================
# API - PROVENTOS EM LOTE
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
# API - COTAÇÃO ATUAL DO FII
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

        try:
            preco = ativo.fast_info.get(
                "lastPrice"
            )
        except Exception:
            pass

        if preco is None:

            try:
                preco = ativo.info.get(
                    "regularMarketPrice"
                )
            except Exception:
                pass

        if preco is None:

            return jsonify({
                "ticker": ticker,
                "price": None,
                "status": "ERRO",
                "message": "Cotacao nao encontrada"
            }), 404

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
# HOME
# ============================================================

@app.route("/")
def home():

    return (
        "<h1>Servidor FII Guard Ativo</h1>"
        "<p>Fontes: yfinance + Fundamentus</p>"
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