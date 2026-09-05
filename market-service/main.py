from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from market_data import fetch, normalize_ticker
app = FastAPI(title="FII Guard Market Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["GET"], allow_headers=["*"])
@app.get("/health")
async def health(): return {"status": "ok", "service": "fii-guard-market"}
@app.get("/market/sync")
async def sync(symbols: str = Query(..., min_length=4, max_length=400), since: str | None = Query(None)):
    try: tickers = list(dict.fromkeys(normalize_ticker(value) for value in symbols.split(",") if value.strip()))
    except ValueError as error: raise HTTPException(400, str(error)) from error
    if not tickers or len(tickers) > 25: raise HTTPException(400, "Informe entre 1 e 25 tickers.")
    results, errors = [], []
    for ticker in tickers:
        try: results.append(await asyncio.to_thread(fetch, ticker, since))
        except Exception as error: errors.append({"ticker": ticker, "message": str(error)[:180]})
    return {"checkedAt": datetime.now(timezone.utc).isoformat(), "results": results, "errors": errors, "notice": "Datas de proventos são referências da fonte e devem ser conferidas."}
