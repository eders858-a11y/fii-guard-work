def buscar_todos_proventos(ticker):

    ticker = ticker.upper().strip()

    # ========================================================
    # BUSCA TODAS AS FONTES
    # ========================================================

    fundamentus_divs = buscar_proventos_fundamentus(ticker)
    yfinance_divs = buscar_proventos_yfinance(ticker)

    # ========================================================
    # CONSOLIDAÇÃO
    #
    # Para o mesmo ticker + data COM:
    # fica com o MAIOR valor encontrado entre as fontes.
    #
    # Exemplo:
    # Fundamentus = 0,080
    # yfinance    = 0,083
    #
    # Resultado   = 0,083
    # ========================================================

    consolidados = {}

    todas_fontes = (
            fundamentus_divs +
            yfinance_divs
    )

    for item in todas_fontes:

        ticker_item = item.get(
            "ticker",
            ticker
        )

        data_com = item.get(
            "dataCom"
        )

        valor = item.get(
            "valorUnitario"
        )

        if not data_com or valor is None:
            continue

        try:
            valor = float(valor)
        except Exception:
            continue

        chave = (
            ticker_item,
            data_com
        )

        # ----------------------------------------------------
        # PRIMEIRO VALOR ENCONTRADO
        # ----------------------------------------------------

        if chave not in consolidados:

            consolidados[chave] = item

            continue

        # ----------------------------------------------------
        # JÁ EXISTE OUTRA FONTE
        #
        # Fica sempre com o MAIOR valor.
        # ----------------------------------------------------

        valor_existente = consolidados[chave].get(
            "valorUnitario"
        )

        try:
            valor_existente = float(
                valor_existente
            )
        except Exception:
            valor_existente = 0

        if valor > valor_existente:

            consolidados[chave] = item

    resultado = list(
        consolidados.values()
    )

    resultado.sort(
        key=lambda x: x.get("dataCom") or ""
    )

    # ========================================================
    # INFORMAÇÃO NO LOG
    # ========================================================

    fontes = set(
        item.get("fonte", "")
        for item in resultado
    )

    print(
        f"[CONSOLIDADO] {ticker}: "
        f"{len(resultado)} proventos "
        f"comparando FUNDAMENTUS + YFINANCE "
        f"| fontes finais: {', '.join(fontes) or 'nenhuma'}"
    )

    return resultado