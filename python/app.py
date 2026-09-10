from flask import Flask, jsonify, request
import yfinance as yf

app = Flask(__name__)

@app.route('/api/proventos', methods=['GET'])
def get_proventos():
    ticker = request.args.get('ticker', '').upper().strip()
    if not ticker:
        return jsonify({'error': 'Ticker nao informado'}), 400

    try:
        simbolo = ticker if '.' in ticker else f"{ticker}.SA"
        ativo = yf.Ticker(simbolo)
        divs = ativo.dividends
        
        lista_divs = []
        if not divs.empty:
            for data, valor in divs.items():
                data_str = data.strftime('%Y-%m-%d')
                lista_divs.append({
                    'ticker': ticker,
                    'dataCom': data_str,
                    'dataPagamento': data_str,
                    'valorUnitario': float(valor),
                    'tipo': 'Rendimento'
                })
        
        return jsonify({'dividends': lista_divs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/proventos-lote', methods=['GET'])
def get_proventos_lote():
    tickers_param = request.args.get('tickers', '').upper().strip()
    if not tickers_param:
        return jsonify({'error': 'Nenhum ticker informado'}), 400

    lista_tickers = [t.strip() for t in tickers_param.split(',') if t.strip()]
    resultado_geral = []

    for ticker in lista_tickers:
        try:
            simbolo = ticker if '.' in ticker else f"{ticker}.SA"
            ativo = yf.Ticker(simbolo)
            divs = ativo.dividends
            
            if not divs.empty:
                for data, valor in divs.items():
                    data_str = data.strftime('%Y-%m-%d')
                    resultado_geral.append({
                        'ticker': ticker,
                        'dataCom': data_str,
                        'dataPagamento': data_str,
                        'valorUnitario': float(valor),
                        'tipo': 'Rendimento'
                    })
        except Exception:
            continue

    return jsonify({'dividends': resultado_geral})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
