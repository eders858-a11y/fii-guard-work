export async function fetchLiveQuotes(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {};

  const quotes: Record<string, number> = {};

  await Promise.all(
    tickers.map(async (ticker) => {
      const tk = ticker.trim().toUpperCase();

      if (!tk) return;

      // 1º: tenta a API própria da Render
      try {
        const response = await fetch(
          `https://fii-guard-work.onrender.com/api/cotacao/${encodeURIComponent(tk)}`
        );

        if (response.ok) {
          const data = await response.json();

          if (
            data &&
            data.status === "OK" &&
            typeof data.price === "number"
          ) {
            quotes[tk] = data.price;
            return;
          }
        }

        console.warn(
          `API Render não retornou cotação para ${tk}. Tentando BRAPI...`
        );
      } catch (error) {
        console.warn(
          `API Render indisponível para ${tk}. Tentando BRAPI...`
        );
      }

      // 2º: se a Render falhar, tenta a BRAPI
      try {
        const response = await fetch(
          `https://brapi.dev/api/quote/${encodeURIComponent(tk)}?range=1d&interval=1d`
        );

        if (response.ok) {
          const data = await response.json();

          if (
            data &&
            data.results &&
            data.results.length > 0
          ) {
            const item = data.results[0];

            if (
              item &&
              typeof item.regularMarketPrice === "number"
            ) {
              quotes[tk] = item.regularMarketPrice;
              return;
            }
          }
        }

        console.warn(`BRAPI também não retornou cotação para ${tk}.`);
      } catch (error) {
        console.error(
          `Erro ao buscar cotação de ${tk} na BRAPI:`,
          error
        );
      }
    })
  );

  return quotes;
}