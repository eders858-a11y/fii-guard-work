export async function fetchLiveQuotes(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {};

  try {
    // Exemplo utilizando a brapi (substitua ou ajuste conforme sua preferência de API)
    const symbols = tickers.join(",");
    const response = await fetch(`https://brapi.dev/api/quote/${symbols}?range=1d&interval=1d`);
    const data = await response.json();

    const quotes: Record<string, number> = {};
    if (data && data.results) {
      data.results.forEach((item: any) => {
        if (item.symbol && typeof item.regularMarketPrice === "number") {
          quotes[item.symbol.toUpperCase()] = item.regularMarketPrice;
        }
      });
    }
    return quotes;
  } catch (error) {
    console.error("Erro ao buscar cotações online:", error);
    return {};
  }
}