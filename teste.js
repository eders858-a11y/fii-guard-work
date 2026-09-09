const BRAPI_TOKEN = 'fZh138TebUi2JYGBJG75C6';
async function t() {
  const r = await fetch('https://brapi.dev/api/quote/PETR4?dividends=true&token=' + BRAPI_TOKEN);
  const j = await r.json();
  console.log('Total de proventos:', j?.results?.[0]?.dividendsData?.cashDividends?.length || 0);
}
-t();
