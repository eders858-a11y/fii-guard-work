from flask import Flask, jsonify, request
import yfinance as yf
import requests, re, html, base64, json, concurrent.futures

app = Flask(__name__)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
FNET = "https://fnet.bmfbovespa.com.br/fnet/publico/"
B3 = "https://sistemaswebb3-listados.b3.com.br/fundsListedProxy/Search/GetEventsCorporateActions/"

# ============================================================
# AUXILIARES
# ============================================================

def limpar_html(t):
    return re.sub(r"<[^>]+>", "", html.unescape(t)).strip()

def valor_br(v):
    try:
        return float(str(v).upper().replace("R$","").replace(" ","").replace(".","").replace(",","."))
    except:
        return None

def data_br(v):
    try:
        d,m,a = str(v).strip().split("/")
        return f"{a}-{m}-{d}"
    except:
        return None

# ============================================================
# B3 - PROVENTOS OFICIAIS
# ============================================================

def buscar_proventos_b3(ticker):
    out = []
    try:
        ticker = ticker.upper().strip()
        codigo = re.sub(r"\d+$","",ticker)
        payload = base64.b64encode(
            json.dumps(
                {"language":"pt-br","idCEM":codigo},
                ensure_ascii=False,separators=(",",":")
            ).encode()
        ).decode()

        r = requests.get(
            B3 + payload,
            headers={"Accept":"application/json","User-Agent":UA,
                     "Referer":"https://sistemaswebb3-listados.b3.com.br/"},
            timeout=15
        )

        print(f"[B3] {ticker} HTTP {r.status_code}")
        if r.status_code != 200:
            return out

        dados = r.json()
        eventos = dados.get("cashDividends",[])
        if not isinstance(eventos,list):
            return out

        for x in eventos:
    if str(x.get("label","")).strip().upper() != "RENDIMENTO":
        continue

    asset_issued = str(x.get("assetIssued","")).strip().upper()

    # Mantém somente a cota normal do FII.
    # Direitos/subscrições usam outros códigos, como R14M19, R15M18 etc.
    if not asset_issued.startswith(f"BR{codigo}CTF"):
        continue
            com = data_br(x.get("lastDatePrior") or x.get("approvedOn"))
            pag = data_br(x.get("paymentDate"))
            valor = valor_br(x.get("rate"))

            if not com or not pag or valor is None or valor <= 0:
                continue

            out.append({
                "ticker":ticker,
                "dataCom":com,
                "dataPagamento":pag,
                "valorUnitario":float(valor),
                "tipo":"Rendimento",
                "fonte":"B3"
            })

        out.sort(key=lambda x:(x["dataPagamento"],x["dataCom"]))
        print(f"[B3] {ticker}: {len(out)} proventos")
    except Exception as e:
        print(f"[B3] FALHA {ticker}: {e}")
    return out

# ============================================================
# CNPJs FNET
# ============================================================

FII_CNPJ = {
    "BODB11":"41.771.670/0001-99","KDIF11":"26.324.298/0001-89","SNID11":"48.969.881/0001-80","XPID11":"37.404.867/0001-12","BDIF11":"40.502.607/0001-94","JURO11":"42.730.834/0001-00","CPTI11":"38.065.012/0001-77","MXRF11":"97.521.225/0001-25","PCIP11":"28.729.197/0001-13","KNCR11":"16.706.958/0001-32","MCCI11":"23.648.935/0001-84","IRDM11":"28.830.325/0001-10","DEVA11":"37.087.810/0001-37","VGIR11":"29.852.732/0001-91","KNIP11":"24.960.430/0001-13","HGLS11":"32.067.896/0001-57","RBRR11":"29.467.977/0001-03","RECR11":"28.152.272/0001-26","HCTR11":"30.248.180/0001-96","VGHF11":"36.771.692/0001-19","TGLT11":"33.516.270/0001-00","BARI11":"29.267.567/0001-00","CLIN11":"49.005.348/0001-60","CVBI11":"28.729.197/0001-13","GCRA11":"37.037.297/0001-70","HABT11":"30.578.417/0001-05","OUFF11":"30.791.386/0001-68","PORD11":"28.718.730/0001-44","RZAK11":"36.642.219/0001-31","VGRI11":"53.656.482/0001-07","RBRX11":"41.088.458/0001-21","HGLG11":"11.728.688/0001-47","KNRI11":"12.005.956/0001-65","XPML11":"28.757.546/0001-00","VISC11":"17.554.274/0001-25","BTLG11":"11.839.593/0001-09","XPLG11":"26.502.794/0001-85","RECT11":"32.274.163/0001-59","LVBI11":"30.629.603/0001-18","GGRC11":"26.614.291/0001-00","MALL11":"26.499.833/0001-32","TGAR11":"25.032.881/0001-53","RBVA11":"15.576.907/0001-70","ALZR11":"28.737.771/0001-85","HGRU11":"29.641.226/0001-53","BRCO11":"20.748.515/0001-81","HSLG11":"32.903.621/0001-71","PVBI11":"35.652.102/0001-76","JSRE11":"13.371.132/0001-71","FLMA11":"04.141.645/0001-03","PATC11":"13.687.940/0001-44","SARE11":"32.903.702/0001-71","TRNT11":"04.722.883/0001-02","VILG11":"24.853.044/0001-22","ONEF11":"12.948.291/0001-23","RBRP11":"21.408.063/0001-51","BLMG11":"32.062.247/0001-52","EDGA11":"15.333.306/0001-37","TRXF11":"28.548.288/0001-52","HGBS11":"08.431.747/0001-06","GARE11":"37.295.919/0001-60","DAMA11":"53.866.872/0001-01","BCFF11":"11.026.627/0001-38","RBRF11":"27.529.279/0001-51","HFOF11":"18.307.582/0001-19","KFOF11":"30.091.444/0001-40","BPFF11":"17.324.357/0001-28","CPFF11":"34.081.611/0001-23","MCHF11":"40.916.278/0001-20","MFII11":"16.915.968/0001-88"
}

def fnet_cnpj(t):
    return FII_CNPJ.get(t.upper().strip())

def fnet_documentos(ticker, quantidade=10):
    ticker = ticker.upper().strip()
    cnpj = fnet_cnpj(ticker)

    if not cnpj:
        return {"erro":f"CNPJ nao encontrado para {ticker}"}

    cnpj = re.sub(r"\D","",cnpj)
    pagina = FNET + f"abrirGerenciadorDocumentosCVM?cnpjFundo={cnpj}"

    try:
        s = requests.Session()

        r = s.get(
            pagina,
            headers={"Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","User-Agent":UA},
            timeout=15
        )

        if not r.ok:
            return {"ticker":ticker,"cnpj":cnpj,"http":r.status_code,"erro":"Falha ao abrir FNET"}

        url = (
                FNET + "pesquisarGerenciadorDocumentosDados"
                       f"?d=1&s=0&l={quantidade}"
                       "&o%5B0%5D%5BdataReferencia%5D=desc"
                       "&idCategoriaDocumento=0&idTipoDocumento=0"
                       "&idEspecieDocumento=0&isSession=true"
        )

        r = s.get(
            url,
            headers={"Accept":"application/json, text/javascript, */*; q=0.01",
                     "User-Agent":UA,"Referer":pagina,
                     "X-Requested-With":"XMLHttpRequest"},
            timeout=15
        )

        if not r.ok:
            return {"ticker":ticker,"cnpj":cnpj,"http":r.status_code,"erro":"Falha ao consultar FNET"}

        dados = r.json()
        lista = []

        for x in dados.get("data",[]):
            if not x.get("id"):
                continue

            i = int(x["id"])
            lista.append({
                "id":i,
                "dataReferencia":x.get("dataReferencia",""),
                "dataEntrega":x.get("dataEntrega",""),
                "categoriaDocumento":x.get("categoriaDocumento",""),
                "tipoDocumento":x.get("tipoDocumento",""),
                "descricaoFundo":x.get("descricaoFundo",""),
                "nomePregao":x.get("nomePregao",""),
                "status":x.get("status",""),
                "situacaoDocumento":x.get("situacaoDocumento",""),
                "linkDocumento":FNET + f"exibirDocumento?id={i}&cvm=true"
            })

        return {
            "ticker":ticker,
            "cnpj":cnpj,
            "recordsTotal":dados.get("recordsTotal",0),
            "documentos":lista
        }

    except Exception as e:
        return {"ticker":ticker,"cnpj":cnpj,"erro":str(e)}

# ============================================================
# FNET - LEITURA DE DOCUMENTO
# ============================================================

def fnet_extrair_documento(sessao, documento_id):
    url = FNET + f"exibirDocumento?id={documento_id}&cvm=true"

    try:
        r = sessao.get(
            url,
            headers={"User-Agent":UA,
                     "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                     "Referer":FNET},
            timeout=15
        )

        return {
            "id":documento_id,
            "url":url,
            "http":r.status_code,
            "html_tamanho":len(r.text),
            "texto":limpar_html(r.text) if r.ok else ""
        }
    except Exception as e:
        return {"id":documento_id,"url":url,"erro":str(e)}

def fnet_dados_provento(texto, documento_id):
    t = re.sub(r"\s+"," ",texto)

    def busca(padrao):
        m = re.search(padrao,t,re.I)
        return m.group(1) if m else None

    valor = busca(r"Valor do provento.*?(\d+,\d+)")
    return {
        "documentoId":documento_id,
        "dataBase":busca(r"Data-base.*?(\d{2}/\d{2}/\d{4})"),
        "valorProvento":valor_br(valor) if valor else None,
        "dataPagamento":busca(r"Data do pagamento.*?(\d{2}/\d{2}/\d{4})"),
        "periodo":busca(r"Período de referência\s*:?\s*([A-Za-zÀ-ÿ]+)"),
        "isentoIR":(
            busca(r"Rendimento isento de IR\*?\s*(Sim|Não)").lower()=="sim"
            if busca(r"Rendimento isento de IR\*?\s*(Sim|Não)") else None
        )
    }

# ============================================================
# PROVENTOS
# ============================================================

def buscar_todos_proventos(ticker):
    print(f"[PROVENTOS] {ticker}: B3 oficial")
    return buscar_proventos_b3(ticker)

@app.route("/api/proventos-lote",methods=["GET"])
def proventos_lote():
    p = request.args.get("tickers","")

    if not p:
        return jsonify({
            "error":"Nenhum ticker fornecido. Use ?tickers=ALZR,XPML,...",
            "status":"ERRO"
        }),400

    tickers = list(dict.fromkeys(
        x.strip().upper() for x in p.split(",") if x.strip()
    ))

    print(f"[LOTE] B3: {len(tickers)} ativos")

    resultado = []

    with concurrent.futures.ThreadPoolExecutor(
            max_workers=min(15,len(tickers))
    ) as executor:

        tarefas = {
            executor.submit(buscar_proventos_b3,t):t
            for t in tickers
        }

        for tarefa in concurrent.futures.as_completed(tarefas):
            t = tarefas[tarefa]
            try:
                resultado.extend(tarefa.result())
            except Exception as e:
                print(f"[LOTE ERRO] {t}: {e}")

    resultado.sort(
        key=lambda x:(x.get("ticker",""),x.get("dataPagamento",""),x.get("dataCom",""))
    )

    print(f"[LOTE] Finalizado: {len(resultado)} proventos")

    return jsonify({"dividends":resultado,"status":"OK"})

# ============================================================
# FNET PROVENTO / DOCUMENTO
# ============================================================

@app.route("/api/fnet/provento",methods=["GET"])
def api_fnet_provento():
    ticker = request.args.get("ticker","").upper().strip()

    if not ticker:
        return jsonify({"status":"ERRO","error":"Ticker nao informado"}),400

    try:
        cnpj = fnet_cnpj(ticker)

        if not cnpj:
            return jsonify({
                "status":"ERRO",
                "ticker":ticker,
                "error":"CNPJ nao encontrado"
            }),404

        cnpj_num = re.sub(r"\D","",cnpj)
        s = requests.Session()

        pagina = FNET + f"abrirGerenciadorDocumentosCVM?cnpjFundo={cnpj_num}"

        r = s.get(
            pagina,
            headers={"User-Agent":UA},
            timeout=15
        )

        if not r.ok:
            return jsonify({
                "status":"ERRO",
                "ticker":ticker,
                "http":r.status_code
            }),502

        url = (
                FNET + "pesquisarGerenciadorDocumentosDados"
                       "?d=1&s=0&l=100"
                       "&o%5B0%5D%5BdataReferencia%5D=desc"
                       "&idCategoriaDocumento=0&idTipoDocumento=0"
                       "&idEspecieDocumento=0&isSession=true"
        )

        r = s.get(
            url,
            headers={
                "Accept":"application/json, text/javascript, */*; q=0.01",
                "User-Agent":UA,
                "Referer":pagina,
                "X-Requested-With":"XMLHttpRequest"
            },
            timeout=15
        )

        if not r.ok:
            return jsonify({
                "status":"ERRO",
                "ticker":ticker,
                "http":r.status_code
            }),502

        dados = r.json()
        alvo = None

        for x in dados.get("data",[]):
            tipo = str(x.get("tipoDocumento",""))

            if "Rendimentos" in tipo and x.get("id"):
                alvo = int(x["id"])
                break

        if not alvo:
            return jsonify({
                "status":"ERRO",
                "ticker":ticker,
                "error":"Documento de Rendimentos nao encontrado"
            }),404

        documento = fnet_extrair_documento(s,alvo)

        if not documento.get("texto"):
            return jsonify({
                "status":"ERRO",
                "ticker":ticker,
                "error":"Documento FNET sem texto"
            }),502

        return jsonify({
            "status":"OK",
            "ticker":ticker,
            "cnpj":cnpj,
            "provento":fnet_dados_provento(
                documento["texto"],alvo
            )
        })

    except Exception as e:
        return jsonify({
            "status":"ERRO",
            "ticker":ticker,
            "error":str(e)
        }),500

# ============================================================
# PROVENTO INDIVIDUAL
# ============================================================

@app.route("/api/proventos",methods=["GET"])
def proventos():
    ticker = request.args.get("ticker","").upper().strip()

    if not ticker:
        return jsonify({"error":"Ticker nao informado"}),400

    try:
        return jsonify({
            "dividends":buscar_proventos_b3(ticker),
            "status":"OK"
        })
    except Exception as e:
        return jsonify({"error":str(e)}),500

# ============================================================
# COTAÇÃO
# ============================================================

@app.route("/api/cotacao/<ticker>",methods=["GET"])
def cotacao(ticker):
    ticker = ticker.upper().strip()

    try:
        simbolo = ticker if "." in ticker else ticker + ".SA"
        ativo = yf.Ticker(simbolo)
        preco = None

        try:
            preco = ativo.fast_info.get("lastPrice")
        except:
            pass

        if preco is None:
            try:
                preco = ativo.info.get("regularMarketPrice")
            except:
                pass

        if preco is None:
            return jsonify({
                "ticker":ticker,
                "price":None,
                "status":"ERRO",
                "message":"Cotacao nao encontrada"
            }),404

        return jsonify({
            "ticker":ticker,
            "price":float(preco),
            "status":"OK"
        })

    except Exception as e:
        return jsonify({
            "ticker":ticker,
            "price":None,
            "status":"ERRO",
            "message":str(e)
        }),500

# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():
    return (
        "<h1>Servidor FII Guard Ativo</h1>"
        "<p>Proventos: B3 oficial</p>"
        "<p>Eventos/Documentos: FNET</p>"
        "<p>Cotacoes: yfinance</p>"
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0",port=5000,debug=True)