from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import requests
import os
import re
from datetime import datetime

app = Flask(__name__)
CORS(app)

HISTORICO_CACHE = {}

def buscar_yfinance(simbolo, ticker):
    lista_divs = []
    try:
        ativo = yf.Ticker(simbolo)
        # Tenta pegar os dividendos (o Yahoo às vezes demora para FIIs)
        dividends = ativo.dividends
        if dividends is not None and not dividends.empty:
            # Pega os últimos registros para garantir 2026
            for data_idx, valor in dividends.tail(20).items():
                dt_obj = data_idx.to_pydatetime()
                data_str = dt_obj.strftime('%d/%m/%Y')

                val_float = float(valor)
                valor_formatado = f"R$ {val_float:.2f}".replace('.', ',')
                lista_divs.append({
                    "ticker": ticker,
                    "dataCom": data_str,
                    "dataPagamento": data_str,
                    "valorUnitario": valor_formatado,
                    "tipo": "Rendimento",
                    "fonte": "yfinance"
                })
    except Exception as e:
        print(f"Erro YFinance {ticker}: {e}")
    return lista_divs

def buscar_statusinvest_alternativo(ticker):
    lista_divs = []
    try:
        # Endpoint mais robusto do StatusInvest
        url = f"https://statusinvest.com.br/fundos-imobiliarios/payoutresult?q={ticker}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            for item in data.get("list", []):
                raw_addr = item.get("addr", "") # Data Com
                raw_pay = item.get("payday", "") # Data Pagamento
                
                # Converte datas ISO (2026-08-10...) para BR (10/08/2026)
                try:
                    d_com = datetime.strptime(raw_addr.split('T')[0], '%Y-%m-%d').strftime('%d/%m/%Y') if raw_addr else ""
                except: d_com = raw_addr

                try:
                    d_pay = datetime.strptime(raw_pay.split('T')[0], '%Y-%m-%d').strftime('%d/%m/%Y') if raw_pay else ""
                except: d_pay = raw_pay

                val_float = float(item.get("value", 0))
                valor_formatado = f"R$ {val_float:.2f}".replace('.', ',')

                lista_divs.append({
                    "ticker": ticker,
                    "dataCom": d_com,
                    "dataPagamento": d_pay,
                    "valorUnitario": valor_formatado,
                    "tipo": "Rendimento",
                    "fonte": "statusinvest"
                })
    except Exception as e:
        print(f"Erro StatusInvest {ticker}: {e}")
    return lista_divs

def consolidar_dados(ticker, novos_dados):
    if ticker not in HISTORICO_CACHE:
        HISTORICO_CACHE[ticker] = []
    
    # Chave única agora inclui o Ticker para evitar misturar dados de fundos diferentes no cache
    # E foca na Data de Pagamento + Valor para evitar duplicados
    mapa_unicos = {f"{d['ticker']}_{d['dataPagamento']}_{d['valorUnitario']}": d for d in HISTORICO_CACHE[ticker]}
    
    for item in novos_dados:
        chave = f"{item['ticker']}_{item['dataPagamento']}_{item['valorUnitario']}"
        # StatusInvest tem prioridade pois traz a Data Com correta
        if chave not in mapa_unicos or item['fonte'] == 'statusinvest':
            mapa_unicos[chave] = item

    lista_final = list(mapa_unicos.values())
    # Ordena por data (mais recentes primeiro) para facilitar a vida do app
    try:
        lista_final.sort(key=lambda x: datetime.strptime(x['dataPagamento'], '%d/%m/%Y'), reverse=True)
    except: pass

    HISTORICO_CACHE[ticker] = lista_final
    return lista_final

@app.route('/api/proventos-lote', methods=['GET'])
def get_proventos_lote():
    tickers_param = request.args.get('tickers', '').upper().strip()
    if not tickers_param:
        return jsonify({"error": "Nenhum ticker informado"}), 400

    tickers_list = [t.strip() for t in tickers_param.split(',') if t.strip()]
    todos_dividendos = []

    for ticker in tickers_list:
        simbolo = f"{ticker}.SA"
        # Busca nas duas fontes para garantir 2026
        dados_yf = buscar_yfinance(simbolo, ticker)
        dados_alt = buscar_statusinvest_alternativo(ticker)
        
        # Consolida e limpa duplicados
        dados_consolidados = consolidar_dados(ticker, dados_yf + dados_alt)
        todos_dividendos.extend(dados_consolidados)

    return jsonify({
        "totalRegistros": len(todos_dividendos),
        "dividends": todos_dividendos,
        "status": "2026_OK"
    })

@app.route('/')
def home():
    return "FII Guard API - Online"

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
