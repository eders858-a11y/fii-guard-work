from flask import Flask, jsonify, request  
from flask_cors import CORS  
import yfinance as yf  
app = Flask(__name__)  
CORS(app)  
@app.route('/api/proventos', methods=['GET'])  
def get_proventos():  
    ticker = request.args.get('ticker', '').upper().strip()  
    simbolo = ticker if ticker.endswith('.SA') else f"{ticker}.SA"  
    lista_divs = []  
    try:  
        ativo = yf.Ticker(simbolo)  
        dividends = ativo.dividends  
        if dividends is not None and not dividends.empty:  
            for data_idx, valor in dividends.items():  
                lista_divs.append({"ticker": ticker, "dataCom": data_idx.strftime('%Y-%m-%d'), "dataPagamento": data_idx.strftime('%Y-%m-%d'), "valorUnitario": float(valor), "tipo": "Rendimento"})  
    except: pass  
    return jsonify({"ticker": ticker, "dividends": lista_divs})  
if __name__ == '__main__': app.run(host='0.0.0.0', port=5000) 
