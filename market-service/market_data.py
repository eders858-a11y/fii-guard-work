from __future__ import annotations
import math
import os
import re
from typing import Any
import requests
import yfinance as yf

PATTERN = re.compile(r"^[A-Z0-9]{4,12}$")
BRAPI = "https://brapi.dev"
def normalize_ticker(value: str) -> str:
    ticker = re.sub(r"[^A-Z0-9]", "", value.strip().upper().replace(".SA", ""))
    if not PATTERN.fullmatch(ticker): raise ValueError(f"Ticker inválido: {value}")
    return ticker

def _headers() -> dict[str, str]:
    token = os.getenv("BRAPI_API_KEY", "").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}

def fetch_brapi(ticker: str, since: str | None = None) -> dict[str, Any]:
    quote_response = requests.get(f"{BRAPI}/api/quote/{ticker}", headers=_headers(), timeout=15); quote_response.raise_for_status()
    quote_body = quote_response.json(); item = (quote_body.get("results") or [{}])[0]
    raw_price = item.get("regularMarketPrice", item.get("price")); quote = None
    if raw_price is not None and math.isfinite(float(raw_price)):
        quote = {"ticker": ticker, "price": round(float(raw_price), 4), "referenceDate": str(item.get("regularMarketTime", ""))[:10] or None}
    params: dict[str, str] = {"symbols": ticker}
    if since: params["startDate"] = since
    dividend_response = requests.get(f"{BRAPI}/api/v2/fii/dividends", params=params, headers=_headers(), timeout=15); dividend_response.raise_for_status()
    events = []
    for item in dividend_response.json().get("dividends", []):
        rate = float(item.get("rate") or item.get("value") or 0); payment = str(item.get("paymentDate") or "")[:10]; date_com = str(item.get("lastDatePrior") or item.get("dateCom") or item.get("recordDate") or "")[:10]
        if rate > 0 and math.isfinite(rate) and payment and date_com: events.append({"ticker": ticker, "referenceDate": payment, "paymentDate": payment, "dateCom": date_com, "amountPerShare": round(rate, 8), "kind": "amortization" if "AMORT" in str(item.get("label", "")).upper() else "income", "source": "brapi"})
    return {"ticker": ticker, "quote": quote, "dividends": sorted(events, key=lambda event: event["referenceDate"], reverse=True)}

def fetch_yfinance(ticker: str, since: str | None = None) -> dict[str, Any]:
    remote = yf.Ticker(f"{ticker}.SA"); history = remote.history(period="7d", auto_adjust=False); quote = None
    if not history.empty and "Close" in history and not history["Close"].dropna().empty:
        closes = history["Close"].dropna(); quote = {"ticker": ticker, "price": round(float(closes.iloc[-1]), 4), "referenceDate": str(closes.index[-1])[:10]}
    events = []
    dividends = remote.dividends
    if dividends is not None and not dividends.empty:
        for event_date, amount in dividends.items():
            value = float(amount); payment = str(event_date)[:10]
            if math.isfinite(value) and value > 0 and (not since or payment >= since): events.append({"ticker": ticker, "referenceDate": payment, "paymentDate": payment, "dateCom": "", "amountPerShare": round(value, 8), "kind": "income", "source": "yfinance"})
    return {"ticker": ticker, "quote": quote, "dividends": sorted(events, key=lambda event: event["referenceDate"], reverse=True)}

def fetch(ticker: str, since: str | None = None) -> dict[str, Any]:
    clean = normalize_ticker(ticker)
    try: return fetch_brapi(clean, since)
    except Exception:
        return fetch_yfinance(clean, since)
