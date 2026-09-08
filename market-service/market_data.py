import math
import os
import re
import requests
import yfinance as yf

# Configurações de busca
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def normalize_ticker(value):
    return re.sub(r"[^A-Z0-9]", "", value.strip().upper().replace(".SA", ""))

def fetch_investidor10(ticker):
    """Busca proventos no Investidor10 - Fonte gratuita e precisa para Data Com"""
    try:
        url = f"https://investidor10.com.br/fiis/{ticker}/"
        res = requests.get(url, headers=HEADERS, timeout=15)
        if res.status_code != 200: return []
        
        # Captura as linhas da tabela de proventos
        rows = re.findall(r'<tr>(.*?)</tr>', res.text, re.DOTALL)
        events = []
        
        for row in rows:
            # Encontra todas as datas no formato DD/MM/YYYY na linha
            found_dates = re.findall(r'(\d{2}/\d{2}/\d{4})', row)
            # Encontra o valor no formato R$ 0,00 ou apenas o número com vírgula
            val_match = re.search(r'(?:R\$\s*)?(\d+,\d+)', row)
            
            if len(found_dates) >= 2 and val_match:
                d_com = found_dates[0]
                d_pgto = found_dates[1]
                valor = float(val_match.group(1).replace(',', '.'))
                
                # Converte para padrão ISO (YYYY-MM-DD)
                c_p = d_com.split('/')
                p_p = d_pgto.split('/')
                
                events.append({
                    "ticker": ticker,
                    "paymentDate": f"{p_p[2]}-{p_p[1]}-{p_p[0]}",
                    "dateCom": f"{c_p[2]}-{c_p[1]}-{c_p[0]}",
                    "amountPerShare": valor,
                    "kind": "income",
                    "source": "investidor10"
                })
        return events
    except:
        return []

def fetch_brapi(ticker):
    token = os.getenv("BRAPI_API_KEY", "").strip()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    # Preço Atual
    res = requests.get(f"https://brapi.dev/api/quote/{ticker}", headers=headers, timeout=15)
    quote_data = (res.json().get("results") or [{}])[0]
    price = quote_data.get("regularMarketPrice")
    
    quote = {"ticker": ticker, "price": round(float(price), 4), "referenceDate": "hoje"} if price else None
    
    # Dividendos
    div_res = requests.get(f"https://brapi.dev/api/v2/fii/dividends?symbols={ticker}", headers=headers, timeout=15)
    divs = div_res.json().get("dividends") or []
    
    events = []
    for d in divs:
        rate = float(d.get("rate") or d.get("value") or 0)
        p = str(d.get("paymentDate") or "")[:10]
        c = str(d.get("lastDatePrior") or d.get("dateCom") or "")[:10]
        if rate > 0 and p and c:
            events.append({"ticker": ticker, "paymentDate": p, "dateCom": c, "amountPerShare": rate, "kind": "income", "source": "brapi"})
    
    return quote, events

def fetch(ticker, since=None):
    clean = normalize_ticker(ticker)
    data = {"ticker": clean, "quote": None, "dividends": []}
    
    # 1. Tenta Brapi (Preço e Dividendos)
    try:
        q, d = fetch_brapi(clean)
        data["quote"] = q
        data["dividends"] = d
    except:
        # Fallback Yahoo
        try:
            y = yf.Ticker(f"{clean}.SA")
            data["quote"] = {"ticker": clean, "price": float(y.fast_info['lastPrice']), "referenceDate": "hoje"}
        except: pass

    # 2. REFORÇO: Se os dividendos vieram vazios (comum no plano free), usa o Investidor10
    if not data["dividends"]:
        data["dividends"] = fetch_investidor10(clean)
        
    return data
