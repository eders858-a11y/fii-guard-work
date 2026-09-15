from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import requests
import time
import re
import html
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
CORS(app)

BRAPI_TOKEN = "fZh138TebUi2JYGBJG75C6"

FUNDAMENTUS_URL = "https://www.fundamentus.com.br/fii_proventos.php"


# ============================================================
# AUXILIARES
# ============================================================

def limpar_html(texto):
    texto = re.sub(r"<[^>]+>", "", texto)
    texto = html.unescape(texto)
    texto = texto.replace("\xa0", " ")
    return texto.strip()


def valor_brasileiro(texto):
    """
    Converte:
    0,1300       -> 0.13
    R$ 0,1300    -> 0.13
    1.234,56     -> 1234.56
    """
    texto = texto.replace("R$", "").strip()

    if "," in texto:
        texto = texto.replace(".", "")
        texto = texto.replace(",", ".")

    return float(texto)


def data_brasileira_para_iso(texto):
    """
    Converte:
    11/09/2026 -> 2026-09-11
    """
    return datetime.strptime(
        texto.strip(),
        "%d/%m/%Y"
    ).strftime("%Y-%m-%d")


# ============================================================
# FUNDAMENTUS
# ============================================================

def buscar_proventos_fundamentus(ticker):
    """
    Busca os proventos no Fundamentus.

    O Fundamentus possui:
    Data-com
    Valor
    Data de pagamento
    Tipo
    """

    tk = ticker.upper().strip()
    lista = []

    try:
        url = f"{FUNDAMENTUS_URL}?papel={tk}"

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }

        resposta = requests.get(
            url,
            headers=headers,
            timeout=15
        )

        if resposta.status_code != 200:
            print(
                f"[FUNDAMENTUS] {tk} HTTP "
                f"{resposta.status_code}"
            )
            return lista

        pagina = resposta.text

        # Localiza as linhas da tabela
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

            valores = [
                limpar_html(c)
                for c in colunas
            ]

            if len(valores) < 4:
                continue

            # Procuramos uma linha no formato:
            # Data-com | Valor | Data Pagamento | Tipo
            data_com = valores[0]
            valor = valores[1]
            data_pagamento = valores[2]
            tipo = valores[3]

            if not re.match(
                    r"^\d{2}/\d{2}/\d{4}$",
                    data_com
            ):
                continue

            if not re.match(
                    r"^\d{2}/\d{2}/\d{4}$",
                    data_pagamento
            ):
                continue

            try:
                valor_unitario = valor_brasileiro(valor)

                data_com_iso = data_brasileira_para_iso(
                    data_com
                )

                data_pagamento_iso = data_brasileira_para_iso(
                    data_pagamento
                )

                tipo_normalizado = tipo.strip().upper()

                if "AMORT" in tipo_normalizado:
                    tipo_final = "Amortização"
                else:
                    tipo_final = "Rendimento"

                lista.append({
                    "ticker": tk,
                    "dataCom": data_com_iso,
                    "dataPagamento": data_pagamento_iso,
                    "valorUnitario": valor_unitario,
                    "tipo": tipo_final,
                    "fonte": "fundamentus"
                })

            except Exception as e:
                print(
                    f"[FUNDAMENTUS] Erro linha {tk}: {e}"
                )

        print(
            f"[FUNDAMENTUS] {tk}: "
            f"{len(lista)} proventos encontrados"
        )

    except Exception as e:
        print(
            f"[FUNDAMENTUS] Falha {tk}: {e}"
        )

    return lista


# ============================================================
# YFINANCE
# ============================================================

def buscar_proventos_yfinance(ticker):
    """
    Mantém o yfinance como fonte de histórico/fallback.
    """

    tk = ticker.upper().strip()
    lista = []

    try:
        ativo = yf.Ticker(f"{tk}.SA")
        divs = ativo.dividends

        if not divs.empty:

            for data, valor in divs.items():

                data_str = data.strftime(
                    "%Y-%m-%d"
                )

                lista.append({
                    "ticker": tk,
                    "dataCom": data_str,
                    "dataPagamento": data_str,
                    "valorUnitario": float(valor),
                    "tipo": "Rendimento",
                    "fonte": "yfinance"
                })

        print(
            f"[YFINANCE] {tk}: "
            f"{len(lista)} proventos encontrados"
        )

    except Exception as e:
        print(
            f"[YFINANCE] Falha {tk}: {e}"
        )

    return lista


# ============================================================
# COTAÇÃO + PROVENTOS
# ============================================================

def buscar_dados_fundo(ticker):

    tk = ticker.upper().strip()

    res = {
        "ticker": tk,
        "price": None,
        "dividends": []
    }

    # --------------------------------------------------------
    # YFINANCE
    # --------------------------------------------------------

    try:

        ativo = yf.Ticker(
            f"{tk}.SA"
        )

        # Cotação
        try:
            res["price"] = (
                    ativo.fast_info.get("lastPrice")
                    or ativo.info.get(
                "regularMarketPrice"
            )
            )
        except Exception:
            pass

        # Histórico yfinance
        res["dividends"].extend(
            buscar_proventos_yfinance(tk)
        )

    except Exception as e:

        print(
            f"[YFINANCE] Falha geral {tk}: {e}"
        )

    # --------------------------------------------------------
    # FUNDAMENTUS
    # --------------------------------------------------------

    proventos_fundamentus = (
        buscar_proventos_fundamentus(tk)
    )

    res["dividends"].extend(
        proventos_fundamentus
    )

    # --------------------------------------------------------
    # CONSOLIDAÇÃO
    # --------------------------------------------------------
    #
    # Fundamentus ganha prioridade porque possui
    # data-com e data de pagamento separados.
    #
    # A chave é ticker + data-com.
    # --------------------------------------------------------

    consolidados = {}

    for div in res["dividends"]:

        chave = (
            div["ticker"],
            div["dataCom"]
        )

        fonte = div.get(
            "fonte",
            "desconhecida"
        )

        # Fundamentus tem prioridade
        if chave not in consolidados:
            consolidados[chave] = div

        elif fonte == "fundamentus":
            consolidados[chave] = div

    res["dividends"] = list(
        consolidados.values()
    )

    print(
        f"[OK] {tk} | "
        f"cotação={res['price']} | "
        f"proventos={len(res['dividends'])}"
    )

    return res


# ============================================================
# ROTA EXCLUSIVA PARA COTAÇÃO
# ============================================================

@app.route("/api/cotacao/<ticker>")
def get_cotacao(ticker):

    tk = ticker.upper().strip()

    try:

        ativo = yf.Ticker(
            f"{tk}.SA"
        )

        # Tenta primeiro fast_info
        price = None

        try:
            price = ativo.fast_info.get(
                "lastPrice"
            )
        except Exception:
            pass

        # Fallback
        if not price:

            try:
                price = ativo.info.get(
                    "regularMarketPrice"
                )
            except Exception:
                pass

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
# ROTA PROVENTOS + COTAÇÕES EM LOTE
# ============================================================

@app.route("/api/proventos-lote")
def get_lote():

    start_time = time.time()

    tks_param = (
        request.args
        .get("tickers", "")
        .upper()
        .split(",")
    )

    tickers = [
        t.strip()
        for t in tks_param
        if t.strip()
    ]

    print(
        f"--- Iniciando Sincronização de "
        f"{len(tickers)} ativos ---"
    )

    final_divs = []
    final_quotes = []

    # --------------------------------------------------------
    # BUSCA EM PARALELO
    # --------------------------------------------------------

    with ThreadPoolExecutor(
            max_workers=10
    ) as executor:

        resultados = list(
            executor.map(
                buscar_dados_fundo,
                tickers
            )
        )

    # --------------------------------------------------------
    # CONSOLIDA RESULTADOS
    # --------------------------------------------------------

    for r in resultados:

        if r["price"] is not None:

            final_quotes.append({
                "ticker": r["ticker"],
                "price": float(
                    r["price"]
                )
            })

        final_divs.extend(
            r["dividends"]
        )

    # --------------------------------------------------------
    # ORDENA PROVENTOS
    # --------------------------------------------------------

    final_divs.sort(
        key=lambda x: (
            x.get("ticker", ""),
            x.get("dataCom", "")
        )
    )

    total_time = (
            time.time() - start_time
    )

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

    return (
        "<h1>Servidor FII Guard Ativo</h1>"
        "<p>Fontes: yfinance + Fundamentus</p>"
    )


# ============================================================
# INICIALIZAÇÃO
# ============================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000
    )