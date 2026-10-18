import { FII_CNPJ } from "./cnpj";

export type FnetEvent = {
  id: number;
  origem?: "fnet" | "brfiis" | "b3";
  idBrfiis?: number;
  pdfTimestamp?: string;
  url?: string;
  ticker?: string;
  dataReferencia: string;
  dataEntrega: string;
  categoriaDocumento: string;
  tipoDocumento: string;
  descricaoFundo: string;
  nomePregao: string;
  status: string;
  situacaoDocumento: string;
};

type FnetResponse = {
  data?: Array<{
    id?: number;
    dataReferencia?: string;
    dataEntrega?: string;
    categoriaDocumento?: string;
    tipoDocumento?: string;
    descricaoFundo?: string;
    nomePregao?: string;
    status?: string;
    situacaoDocumento?: string;
  }>;
  recordsTotal?: number;
};

function normalizarCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function obterCnpj(ticker: string): string | undefined {
  return FII_CNPJ[ticker.trim().toUpperCase()];
}

/**
 * CNPJ correto do BODB11.
 */
const BODB11_CNPJ = "28090655000117";

/**
 * CNPJ da classe BODI11 que está aparecendo
 * indevidamente em alguns resultados do BRFIIS.
 */
const BODI11_CNPJ = "64026723000142";

/**
 * Verifica se o bloco ou a URL do documento pertence
 * ao BODI11 (ou a outro fundo) em vez do BODB11.
 *
 * O BRFIIS pode retornar documentos da classe BODI11 ou de outros
 * fundos na página do BODB11 devido ao compartilhamento de gestora (BTG Pactual)
 * ou indexação cruzada no BRFIIS.
 *
 * Função 100% dinâmica e genérica para qualquer mês ou ano:
 * 1. Verifica o CNPJ do BODI11 (64.026.723/0001-42).
 * 2. Verifica menções ao ticker BODI11 na URL, no HTML ou no texto.
 * 3. Verifica rotas de outros fundos no BRFIIS (/fundos/{ticker}/) que não sejam BODB11 nem FI-INFRA.
 */
function documentoBrfiisEhBodi11(
  blocoTexto: string,
  blocoHtml?: string,
  documentoUrl?: string
): boolean {
  const textoCompleto = `${blocoTexto} ${blocoHtml ?? ""} ${documentoUrl ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  // 1. Validação dinâmica por CNPJ do BODI11
  const cnpjBodi = normalizarCnpj(BODI11_CNPJ);
  if (normalizarCnpj(textoCompleto).includes(cnpjBodi)) {
    return true;
  }

  // 2. Validação dinâmica por ticker do BODI11
  if (
    /\bBODI11\b/i.test(textoCompleto) ||
    /\/BODI11\//i.test(textoCompleto) ||
    /\/FUNDOS\/BODI11/i.test(textoCompleto) ||
    /BODI11/i.test(textoCompleto)
  ) {
    return true;
  }

  // 3. Validação dinâmica genérica para qualquer outro fundo no BRFIIS:
  // Se os links HTML ou a URL do documento apontarem para /fundos/{outro_ticker}/
  // e esse outro_ticker for diferente de BODB11 e de FI-INFRA, descartamos.
  const fundosNoHtmlEUrl = textoCompleto.match(/\/FUNDOS\/([A-Z0-9_-]+)/g);
  if (fundosNoHtmlEUrl) {
    for (const match of fundosNoHtmlEUrl) {
      const fundoEncontrado = match.replace(/\/FUNDOS\//i, "").trim();
      if (
        fundoEncontrado &&
        fundoEncontrado !== "BODB11" &&
        fundoEncontrado !== "FI-INFRA" &&
        fundoEncontrado !== "FI_INFRA"
      ) {
        return true;
      }
    }
  }

  return false;
}

const MAPA_MESES: Record<string, string> = {
  janeiro: "01",
  jan: "01",
  fevereiro: "02",
  fev: "02",
  marco: "03",
  março: "03",
  mar: "03",
  abril: "04",
  abr: "04",
  maio: "05",
  mai: "05",
  junho: "06",
  jun: "06",
  julho: "07",
  jul: "07",
  agosto: "08",
  ago: "08",
  setembro: "09",
  set: "09",
  outubro: "10",
  out: "10",
  novembro: "11",
  nov: "11",
  dezembro: "12",
  dez: "12",
};

/**
 * Tenta extrair a data de referência real do texto do documento do BRFIIS.
 *
 * Relatórios Gerenciais, Informes Mensais e outros documentos periódicos
 * são entregues no mês seguinte ao mês de referência.
 * Exemplo: Relatório Gerencial de Julho é entregue em Agosto (18/08/2026).
 */
function extrairDataReferenciaBrfiis(
  blocoTexto: string,
  dataEntrega: string,
  datasEncontradas: string[],
  tipoDocumento: string
): string {
  // Se houver uma segunda data no HTML que seja diferente da data de entrega, usamos ela
  if (datasEncontradas.length >= 2 && datasEncontradas[1]) {
    const dataSegunda = datasEncontradas[1].trim().split(" ")[0];
    const dataEntregaSoData = dataEntrega.trim().split(" ")[0];
    if (dataSegunda && dataSegunda !== dataEntregaSoData) {
      return datasEncontradas[1];
    }
  }

  const texto = blocoTexto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // 1. Procura por nome de mês no texto (ex: "Julho/2026", "Julho de 2026", "Julho 2026")
  const regexMesExtenso =
    /(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de|\s*[\/\-]?\s*)(\d{4}|\d{2})/i;
  const matchMesExtenso = texto.match(regexMesExtenso);

  if (matchMesExtenso) {
    const nomeMes = matchMesExtenso[1].toLowerCase();
    let ano = matchMesExtenso[2];
    if (ano.length === 2) {
      ano = `20${ano}`;
    }
    const mesNum = MAPA_MESES[nomeMes];
    if (mesNum && ano) {
      return `01/${mesNum}/${ano}`;
    }
  }

  // 2. Procura por formato de mês numérico e ano (ex: "07/2026" ou "07-2026")
  const regexMesNum = /\b(0[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})\b/;
  const matchMesNum = texto.match(regexMesNum);

  if (matchMesNum) {
    const mesNum = matchMesNum[1];
    let ano = matchMesNum[2];
    if (ano.length === 2) {
      ano = `20${ano}`;
    }
    return `01/${mesNum}/${ano}`;
  }

  // 3. Se for um relatório periódico (Relatório Gerencial, Informe Mensal, etc)
  // e não encontrou mês explícito no texto, infere que a referência é o mês anterior à entrega.
  const ehRelatorioPeriodico =
    /Relat[oó]rio Gerencial/i.test(tipoDocumento) ||
    /Informe Mensal/i.test(tipoDocumento) ||
    /Informe Trimestral/i.test(tipoDocumento) ||
    /Rendimentos/i.test(tipoDocumento);

  if (ehRelatorioPeriodico && dataEntrega) {
    const parteData = dataEntrega.trim().split(" ")[0];
    const partes = parteData.split("/");
    if (partes.length === 3) {
      let mes = parseInt(partes[1], 10);
      let ano = parseInt(partes[2], 10);

      if (!isNaN(mes) && !isNaN(ano) && mes >= 1 && mes <= 12) {
        mes -= 1;
        if (mes === 0) {
          mes = 12;
          ano -= 1;
        }
        const mesStr = String(mes).padStart(2, "0");
        return `01/${mesStr}/${ano}`;
      }
    }
  }

  return dataEntrega;
}

/**
 * Verifica se o bloco possui identificação
 * positiva do BODB11.
 */
function documentoBrfiisEhBodb11(
  bloco: string
): boolean {
  const texto = bloco
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const cnpjBodb =
    normalizarCnpj(BODB11_CNPJ);

  if (
    normalizarCnpj(texto).includes(
      cnpjBodb
    )
  ) {
    return true;
  }

  if (
    /\bBODB11\b/i.test(
      texto
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Busca documentos públicos do BRFIIS.
 *
 * Usado somente para o BODB11.
 * O BRFIIS possui seu próprio ID de documento em
 * `/documentos/fi-infra/{idBrfiis}`.
 *
 * A URL do PDF utiliza o pdfTimestamp, que é
 * diferente do ID do documento.
 */
async function buscarDocumentosBrfiis(
  ticker: string,
  quantidade = 10
): Promise<FnetEvent[]> {
  try {
    const cleanTicker =
      ticker.trim().toUpperCase();

    if (cleanTicker !== "BODB11") {
      return [];
    }

    const url =
      `https://brfiis.com.br/fundos/${cleanTicker}`;

    console.log(
      `[BRFIIS] ${cleanTicker}: iniciando consulta`
    );

    const resposta =
      await fetch(
        url,
        {
          method: "GET",
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0",
          },
        }
      );

    if (!resposta.ok) {
      console.warn(
        `[BRFIIS] ${cleanTicker}: HTTP ${resposta.status}`
      );

      return [];
    }

    const html =
      await resposta.text();

    const regex =
      /href=["']([^"']*\/fundos\/[^"']*\/pdf\/[^"']+|\/fundos\/fi-infra\/pdf\/[^"']+)["']/gi;

    const encontrados: FnetEvent[] = [];

    const urlsVistas =
      new Set<string>();

    let match: RegExpExecArray | null;

    while (
      (match = regex.exec(html)) !== null
    ) {
      let documentoUrl =
        match[1];

      if (!documentoUrl) {
        continue;
      }

      if (
        documentoUrl.startsWith("/")
      ) {
        documentoUrl =
          `https://brfiis.com.br${documentoUrl}`;
      } else if (
        documentoUrl.startsWith(
          "http://"
        )
      ) {
        documentoUrl =
          documentoUrl.replace(
            "http://",
            "https://"
          );
      }

      if (
        !documentoUrl.includes(
          "brfiis.com.br"
        )
      ) {
        continue;
      }

      if (
        urlsVistas.has(
          documentoUrl
        )
      ) {
        continue;
      }

      urlsVistas.add(
        documentoUrl
      );

      const posicao =
        match.index;

      /*
       * O PDF e o documento BRFIIS pertencem
       * ao mesmo registro.
       *
       * Primeiro isolamos a linha <tr> que
       * contém o link do PDF.
       */
      const inicioLinha =
        html.lastIndexOf(
          "<tr",
          posicao
        );

      const fimLinha =
        html.indexOf(
          "</tr>",
          posicao
        );

      const blocoDocumento =
        inicioLinha >= 0 &&
        fimLinha >= 0
          ? html.slice(
              inicioLinha,
              fimLinha + 5
            )
          : "";

      /*
       * Converte o HTML do registro para texto
       * antes de validar o fundo.
       */
      const bloco =
        blocoDocumento
          .replace(
            /<script[\s\S]*?<\/script>/gi,
            " "
          )
          .replace(
            /<style[\s\S]*?<\/style>/gi,
            " "
          )
          .replace(
            /<[^>]+>/g,
            " "
          )
          .replace(
            /\u00a0/gi,
            " "
          )
          .replace(
            /&amp;/gi,
            "&"
          )
          .replace(
            /&#39;/gi,
            "'"
          )
          .replace(
            /&quot;/gi,
            '"'
          )
          .replace(
            /&nbsp;/gi,
            " "
          )
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      /*
       * Busca o ID REAL do documento BRFIIS
       * dentro da mesma linha do PDF.
       */
      const idBrfiisMatch =
        blocoDocumento.match(
          /\/fundos\/[^"'<>\/]+\/documentos\/[^"'<>\/]+\/(\d+)/i
        );

      const idBrfiis =
        idBrfiisMatch
          ? Number(
              idBrfiisMatch[1]
            )
          : undefined;

      if (
        idBrfiis === undefined ||
        !Number.isFinite(idBrfiis) ||
        idBrfiis <= 0
      ) {
        console.warn(
          `[BRFIIS] ${cleanTicker}: ID real do documento não encontrado para ${documentoUrl}`
        );

        continue;
      }

      /*
       * IMPORTANTE:
       *
       * Alguns documentos retornados pela página
       * do BODB11 pertencem na verdade ao BODI11.
       *
       * Se o registro trouxer BODI11, o CNPJ 64.026.723/0001-42
       * ou rotas de outros fundos (/fundos/{outro_ticker}/), descartamos dinamicamente.
       */
      if (
        documentoBrfiisEhBodi11(
          bloco,
          blocoDocumento,
          documentoUrl
        )
      ) {
        console.log(
          `[BRFIIS] ${cleanTicker}: documento descartado por pertencer ao BODI11 ou outro fundo | id=${idBrfiis}`
        );

        console.log(
          `[BRFIIS] Documento rejeitado: ${documentoUrl}`
        );

        continue;
      }

      /*
       * Extrai o pdfTimestamp diretamente da URL.
       *
       * Exemplo:
       * 2026-09-14T14:44:35
       */
      const pdfTimestampMatch =
        documentoUrl.match(
          /\/pdf\/[^/]+\/([^/?#]+)$/i
        );

      const pdfTimestamp =
        pdfTimestampMatch
          ? decodeURIComponent(
              pdfTimestampMatch[1]
            )
          : undefined;

      let tipoDocumento =
        "";

      if (
        /Relat[oó]rio Gerencial/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Relatório Gerencial";
      } else if (
        /Fato Relevante/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Fato Relevante";
      } else if (
        /Rendimentos e Amortiza[cç][oõ]es/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Aviso aos Cotistas - Rendimentos e Amortizações";
      } else if (
        /Distribui[cç][aã]o de Rendimentos/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Comunicado ao Mercado - Distribuição de Rendimentos";
      } else if (
        /Informe Mensal/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Informe Mensal";
      } else if (
        /Informe Anual/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Informe Anual";
      } else if (
        /Informe Trimestral/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Informe Trimestral";
      } else if (
        /Demonstra[cç][oõ]es Financeiras/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Demonstrações Financeiras";
      } else if (
        /Comunicado ao Mercado/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Comunicado ao Mercado";
      } else if (
        /Assembleia/i.test(
          bloco
        )
      ) {
        tipoDocumento =
          "Assembleia";
      } else {
        tipoDocumento =
          "Documento";
      }

      const datas =
        bloco.match(
          /\b\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\b/g
        ) || [];

      const dataEntrega =
        datas[0] ?? "";

      const dataReferencia =
        extrairDataReferenciaBrfiis(
          bloco,
          dataEntrega,
          datas,
          tipoDocumento
        );

      encontrados.push({
        /*
         * Para BRFIIS, o ID principal é o
         * ID REAL do próprio documento BRFIIS.
         */
        id: idBrfiis,

        origem:
          "brfiis",

        idBrfiis,

        pdfTimestamp,

        url:
          documentoUrl,

        ticker:
          cleanTicker,

        dataReferencia,

        dataEntrega,

        categoriaDocumento:
          "BRFIIS",

        tipoDocumento,

        descricaoFundo:
          bloco.slice(
            0,
            500
          ),

        nomePregao:
          cleanTicker,

        status:
          "PUBLICADO",

        situacaoDocumento:
          "Disponível",
      });

      console.log(
        `[BRFIIS] ${cleanTicker}: documento encontrado` +
          ` | id=${idBrfiis}` +
          ` | idBrfiis=${idBrfiis}` +
          ` | pdfTimestamp=${pdfTimestamp ?? "não encontrado"}`
      );

      if (
        encontrados.length >=
        quantidade
      ) {
        break;
      }
    }

    console.log(
      `[BRFIIS] ${cleanTicker}: ${encontrados.length} documentos encontrados`
    );

    return encontrados;
  } catch (error) {
    console.warn(
      `[BRFIIS] ${ticker}: erro na consulta`,
      error
    );

    return [];
  }
}

/**
 * Extrai o idFundo da página aberta pelo CNPJ.
 */
function obterIdFundoDaPagina(
  html: string
): number | undefined {
  try {
    const regex =
      /<[^>]*class=["'][^"']*fundoItemInicial[^"']*["'][^>]*>/gi;

    const elementos =
      html.match(regex) || [];

    for (
      const elemento of elementos
    ) {
      const idMatch =
        elemento.match(
          /data-id=["'](\d+)["']/i
        );

      if (!idMatch) {
        continue;
      }

      const id =
        Number(
          idMatch[1]
        );

      if (
        Number.isFinite(id) &&
        id > 0
      ) {
        return id;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export async function buscarEventosFnet(
  ticker: string,
  quantidade = 10
): Promise<FnetEvent[]> {
  const cleanTicker =
    ticker.trim().toUpperCase();

  /**
   * BRFIIS é utilizado somente pelo BODB11.
   */
  const buscarBrfiis =
    cleanTicker === "BODB11"
      ? buscarDocumentosBrfiis(
          cleanTicker,
          quantidade
        )
      : Promise.resolve([]);

  const cnpj =
    obterCnpj(cleanTicker);

  if (!cnpj) {
    console.warn(
      `[FNET] ${cleanTicker}: CNPJ não encontrado, consultando BRFIIS...`
    );

    return await buscarBrfiis;
  }

  const cnpjNormalizado =
    normalizarCnpj(cnpj);

  try {
    console.log(
      `[FNET] ${cleanTicker}: iniciando consulta com CNPJ ${cnpjNormalizado}`
    );

    const paginaUrl =
      `https://fnet.bmfbovespa.com.br/fnet/publico/` +
      `abrirGerenciadorDocumentosCVM?cnpjFundo=${cnpjNormalizado}`;

    const pagina =
      await fetch(
        paginaUrl,
        {
          method: "GET",
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0",
          },
        }
      );

    if (!pagina.ok) {
      console.warn(
        `[FNET] ${cleanTicker}: sessão HTTP ${pagina.status}`
      );

      const brfiis =
        await buscarBrfiis;

      return brfiis;
    }

    const htmlPagina =
      await pagina.text();

    const idFundo =
      obterIdFundoDaPagina(
        htmlPagina
      );

    if (!idFundo) {
      console.warn(
        `[FNET] ${cleanTicker}: idFundo não encontrado na CVM 472. Consultando BRFIIS...`
      );

      const brfiis =
        await buscarBrfiis;

      return brfiis;
    }

    console.log(
      `[FNET] ${cleanTicker}: idFundo utilizado = ${idFundo}`
    );

    const documentosUrl =
      `https://fnet.bmfbovespa.com.br/fnet/publico/` +
      `pesquisarGerenciadorDocumentosDados` +
      `?d=1` +
      `&s=0` +
      `&l=${quantidade}` +
      `&o%5B0%5D%5BdataReferencia%5D=desc` +
      `&idCategoriaDocumento=0` +
      `&idTipoDocumento=0` +
      `&idEspecieDocumento=0` +
      `&idFundo=${idFundo}` +
      `&isSession=false`;

    const resposta =
      await fetch(
        documentosUrl,
        {
          method: "GET",
          headers: {
            Accept:
              "application/json, text/javascript, */*; q=0.01",
            "User-Agent":
              "Mozilla/5.0",
            Referer:
              paginaUrl,
          },
        }
      );

    if (!resposta.ok) {
      const brfiis =
        await buscarBrfiis;

      return brfiis;
    }

    const json =
      (await resposta.json()) as FnetResponse;

    const documentos =
      Array.isArray(json.data)
        ? json.data
        : [];

    const eventosFnet =
      documentos
        .filter(
          (item) => item.id
        )
        .map(
          (item) => ({
            id:
              Number(item.id),
            origem:
              "fnet" as const,
            ticker:
              cleanTicker,
            dataReferencia:
              item.dataReferencia ??
              "",
            dataEntrega:
              item.dataEntrega ??
              "",
            categoriaDocumento:
              item.categoriaDocumento ??
              "",
            tipoDocumento:
              item.tipoDocumento ??
              "",
            descricaoFundo:
              item.descricaoFundo ??
              "",
            nomePregao:
              item.nomePregao ??
              "",
            status:
              item.status ??
              "",
            situacaoDocumento:
              item.situacaoDocumento ??
              "",
          })
        );

    const brfiis =
      await buscarBrfiis;

    return [
      ...eventosFnet,
      ...brfiis,
    ];
  } catch (error) {
    console.warn(
      `[FNET] ${cleanTicker}: erro na consulta, tentando BRFIIS...`,
      error
    );

    const brfiis =
      await buscarBrfiis;

    return brfiis;
  }
}

export function obterLinkDocumentoFnet(
  id: number,
  ticker?: string
): string {
  if (id < 0) {
    return "";
  }

  return (
    `https://fnet.bmfbovespa.com.br/fnet/publico/` +
    `exibirDocumento?id=${id}`
  );
}

