from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import requests
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
CORS(app)

BRAPI_TOKEN = "fZh138TebUi2JYGBJG75C6"


def buscar_dados_fundo(ticker):
    """Busca cotação e proventos em uma única chamada rápida."""
    tk = ticker.upper().strip()
    res = {"ticker": tk, "price": None, "dividends": []}

    try:
        ativo = yf.Ticker(f"{tk}.SA")

        # Preço rápido
        res["price"] = (
                ativo.fast_info.get("lastPrice")
                or ativo.info.get("regularMarketPrice")
        )

        # Proventos - 3 mais recentes
        divs = ativo.dividends

        if not divs.empty:
            for data, valor in divs.tail(3).items():
                res["dividends"].append({
                    "ticker": tk,
                    "dataCom": data.strftime("%Y-%m-%d"),
                    "dataPagamento": data.strftime("%Y-%m-%d"),
                    "valorUnitario": float(valor),
                    "tipo": "Rendimento"
                })

        print(f"[OK] {tk}")

    except Exception as e:
        print(f"[FALHA] {tk}: {e}")

    return res


# ============================================================
# ROTA EXCLUSIVA PARA COTAÇÃO
# ============================================================

@app.route("/api/cotacao/<ticker>")
def get_cotacao(ticker):
    tk = ticker.upper().strip()

    try:
        ativo = yf.Ticker(f"{tk}.SA")

        # Tenta primeiro fast_info
        price = ativo.fast_info.get("lastPrice")

        # Se não encontrar, tenta regularMarketPrice
        if not price:
            price = ativo.info.get("regularMarketPrice")

        if price is None:
            return jsonify({
                "ticker": tk,
                "price": None,
                "status": "ERRO",
                "message": "Cotação não encontrada"
            }), 404

        return jsonify({
            "ticker": tk,
            "price": float(price),
            "status": "OK"
        })

    except Exception as e:
        return jsonify({
            "ticker": tk,
            "price": None,
            "status": "ERRO",
            "message": str(e)
        }), 500


# ============================================================
# ROTA EXISTENTE - PROVENTOS + COTAÇÕES EM LOTE
# ============================================================

@app.route("/api/proventos-lote")
def get_lote():
    start_time = time.time()

    tks_param = request.args.get("tickers", "").upper().split(",")
    tickers = [t.strip() for t in tks_param if t.strip()]

    print(
        f"--- Iniciando Sincronização de "
        f"{len(tickers)} ativos ---"
    )

    final_divs = []
    final_quotes = []

    # Busca em paralelo
    with ThreadPoolExecutor(max_workers=10) as executor:
        resultados = list(
            executor.map(buscar_dados_fundo, tickers)
        )

    for r in resultados:

        if r["price"] is not None:
            final_quotes.append({
                "ticker": r["ticker"],
                "price": float(r["price"])
            })

        final_divs.extend(r["dividends"])

    total_time = time.time() - start_time

    print(
        f"--- Concluído em "
        f"{total_time:.2f} segundos ---"
    )

    return jsonify({
        "dividends": final_divs,
        "quotes": final_quotes,
        "status": "OK",
        "responseTime": total_time
    })


# ============================================================
# TESTE DA API
# ============================================================

@app.route("/")
def home():
    return "<h1>Servidor FII Guard Ativo</h1>"


# ============================================================
# INICIALIZAÇÃO
# ============================================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000
    )