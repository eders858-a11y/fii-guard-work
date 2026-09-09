const BRAPI_TOKEN = 'fZh138TebUi2JYGBJG75C6';

async function testarBrapi() {
  const url = `https://brapi.dev/api/quote/PETR4?dividends=true&token=${BRAPI_TOKEN}`;
  console.log('Buscando dados na Brapi...');

  try {
    const response = await fetch(url);
    const data = await response.json();
    const dividendos = data?.results?.[0]?.dividendsData?.cashDividends || [];

    console.log(`Sucesso! Total de proventos encontrados: ${dividendos.length}`);
    console.log('Exemplo do primeiro provento:', dividendos[0]);
  } catch (error) {
    console.error('Erro ao consultar a API:', error);
  }
}

testarBrapi();const BRAPI_TOKEN = 'fZh138TebUi2JYGBJG75C6';

              async function testarBrapi() {
                const url = `https://brapi.dev/api/quote/PETR4?dividends=true&token=${BRAPI_TOKEN}`;
                console.log('Buscando dados na Brapi...');

                try {
                  const response = await fetch(url);
                  const data = await response.json();
                  const dividendos = data?.results?.[0]?.dividendsData?.cashDividends || [];

                  console.log(`Sucesso! Total de proventos encontrados: ${dividendos.length}`);
                  console.log('Exemplo do primeiro provento:', dividendos[0]);
                } catch (error) {
                  console.error('Erro ao consultar a API:', error);
                }
              }

              testarBrapi();