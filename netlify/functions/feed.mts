import { XMLParser } from "fast-xml-parser";

const RSS_URL = "https://oglobo.globo.com/rss/oglobo";

type FeedItem = {
  title: string;
  link: string;
  description: string;
  image_url: string;
  caption: string;
  credit: string;
  category: string;
  risk_level: string;
  alert_desc: string;
  news_category: string;
  pub_date: string;
  timestamp: string;
};

function cleanHtml(rawHtml: string): string {
  if (!rawHtml) return "";
  return rawHtml.replace(/<[^>]+>/g, "").trim();
}

function extractImageFromDesc(descHtml: string): string | null {
  if (!descHtml) return null;
  const match = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function inferEditoriaFromLink(link: string, fallbackCategory = "Geral"): string {
  if (!link) return fallbackCategory || "Geral";
  try {
    const url = new URL(link);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return fallbackCategory || "Geral";

    let first = (parts[0] || "").toLowerCase().trim();
    const ignore = new Set(["noticia", "blog", "blogs", "ultimas-noticias"]);
    if (ignore.has(first) && parts[1]) first = parts[1].toLowerCase().trim();

    const aliases: Record<string, string> = {
      politica: "Política",
      rio: "Rio",
      saude: "Saúde",
      mundo: "Mundo",
      economia: "Economia",
      esportes: "Esportes",
      cultura: "Cultura",
      brasil: "Brasil",
      tecnologia: "Tecnologia",
      blog: "Blog",
      blogs: "Blog",
    };

    if (aliases[first]) return aliases[first];
    if (first) return first.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    // silent fallback
  }
  return fallbackCategory || "Geral";
}

function classifyCredit(creditText: string) {
  const credit = (creditText || "").trim().toLowerCase();

  if (!credit) {
    return {
      category: "Sem Crédito",
      riskLevel: "alerta",
      alertDesc:
        "Aviso Crítico: Esta imagem não possui créditos de autoria definidos no RSS. O uso externo acarreta alto risco de infração de copyright.",
    };
  }

  // Regra específica: créditos da Agência Brasil são fonte pública
  if (credit.includes("agência brasil") || credit.includes("agencia brasil")) {
    return {
      category: "Institucional / Público",
      riskLevel: "baixo_risco",
      alertDesc: `Fonte Pública: Imagem de órgão público ou governamental (${creditText}). O uso jornalístico é permitido livremente mediante crédito.`,
    };
  }

  const assinaturaKeywords = ["afp", "bloomberg", "nyt", "new york times"];
  for (const kw of assinaturaKeywords) {
    if (credit.includes(kw)) {
      return {
        category: "Assinatura",
        riskLevel: "assinatura",
        alertDesc: `Cobertura via Assinatura: (${creditText}). Disponível através de contrato institucional.`,
      };
    }
  }

  const gettyKeywords = [
    "getty", "reuters", "ap photo", "associated press", "efe", "shutterstock", "istock",
    "agência enquadrar", "agencia enquadrar", "arion marinho", "atopress", "brazil photo press",
    "código19", "codigo19", "cris faga", "diaesportivo", "flávio hopp", "flavio hopp", "fotorua",
    "fotoarena", "framephoto", "ishoot", "lc moreira", "mafalda press", "mdjphotos", "mochilapress",
    "ofotográfico", "ofotografico", "onzex press", "pera photo", "photo premium", "thenews2",
    "w9press", "wesley santos", "wpp", "zimel press"
  ];
  for (const kw of gettyKeywords) {
    if (credit.includes(kw)) {
      return {
        category: "Getty / Agência Externa",
        riskLevel: "alto",
        alertDesc: `Licenciamento Restrito: Foto pertencente a agência parceira internacional (${creditText}). O reuso necessita de licenciamento próprio ou contrato ativo.`,
      };
    }
  }

  if (credit.includes("parceiro") && credit.includes("agencia")) {
    return {
      category: "Getty / Agência Externa",
      riskLevel: "alto",
      alertDesc: `Material de Agência Parceira: (${creditText}). Material pago. Requer licenciamento.`,
    };
  }

  const promoKeywords = ["divulgação", "divulgacao", "acervo pessoal", "assessoria", "dino", "chatgpt", "midia", "anúncio", "publicidade", "patrocinado"];
  for (const kw of promoKeywords) {
    if (credit.includes(kw)) {
      return {
        category: "Divulgação / Comercial",
        riskLevel: "medio",
        alertDesc: `Conteúdo de Divulgação: Foto de assessoria de imprensa ou divulgação promocional (${creditText}). Uso editorial geralmente livre, mas atente para viés promocional.`,
      };
    }
  }

  const govKeywords = ["senado", "câmara", "camara", "bndes", "governo", "gov.br", "agência brasil", "agencia brasil", "prefeitura", "ministério", "ministerio", "palácio do planalto", "planalto"];
  for (const kw of govKeywords) {
    if (credit.includes(kw)) {
      return {
        category: "Institucional / Público",
        riskLevel: "baixo_risco",
        alertDesc: `Fonte Pública: Imagem de órgão público ou governamental (${creditText}). O uso jornalístico é permitido livremente mediante crédito.`,
      };
    }
  }

  const internalKeywords = [
    "o globo", "agência o globo", "agencia o globo", "editora globo", "valor econômico", "valor economico", "g1", "extra", "globo",
    "fabiano rocha", "márcia foletto", "marcia foletto", "custódio coimbra", "custodio coimbra",
    "gabriel de paiva", "guito moreto", "marcelo theobald", "ana branco", "leo martins",
    "alexandre cassiano", "marina calderon", "brenno carvalho", "cristiano mariz",
    "maria isabel oliveira", "edilson dantas", "domingos peixoto",
  ];
  for (const kw of internalKeywords) {
    if (credit.includes(kw)) {
      return {
        category: "Interno (O Globo)",
        riskLevel: "baixo",
        alertDesc: `Produção Interna: Foto própria dos jornalistas ou fotógrafos do jornal O Globo (${creditText}). Direitos inteiramente vinculados à empresa.`,
      };
    }
  }

  return {
    category: "Outros / Fontes não tabeladas",
    riskLevel: "neutro",
    alertDesc: `Auditar Direitos: Imagem creditada a terceiro ou fotógrafo independente (${creditText}). Recomenda-se conferir o regime de contratação antes de qualquer reuso.`,
  };
}

function formatPubDate(pubDateRaw: string): string {
  if (!pubDateRaw) return "Data Indisponível";
  const date = new Date(pubDateRaw);
  if (Number.isNaN(date.getTime())) return pubDateRaw;

  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const monthMap: Record<string, string> = {
    "jan.": "Jan",
    "fev.": "Fev",
    "mar.": "Mar",
    "abr.": "Abr",
    "mai.": "Mai",
    "jun.": "Jun",
    "jul.": "Jul",
    "ago.": "Ago",
    "set.": "Set",
    "out.": "Out",
    "nov.": "Nov",
    "dez.": "Dez",
  };
  const month = monthMap[(map.month || "").toLowerCase()] || map.month;
  return `${map.day} de ${month} de ${map.year} às ${map.hour}:${map.minute}`;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async () => {
  try {
    const response = await fetch(RSS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!response.ok) {
      return Response.json({ success: false, error: `Falha ao obter RSS: ${response.status}` }, { status: 502 });
    }

    const xmlText = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    const parsed = parser.parse(xmlText);
    const rssItems = toArray(parsed?.rss?.channel?.item);

    const data: FeedItem[] = [];
    for (const item of rssItems) {
      const title = item?.title || "Sem Título";
      const link = item?.link || "#";

      const descRaw = item?.description || "";
      const descClean = cleanHtml(descRaw);

      const mediaContent = item?.["media:content"] || item?.content;
      let imageUrl = mediaContent?.url || null;
      if (!imageUrl) imageUrl = extractImageFromDesc(descRaw);
      if (!imageUrl) continue;

      const mediaDesc = item?.["media:description"];
      const caption = (typeof mediaDesc === "string" ? mediaDesc : descClean.slice(0, 200)) || "Nenhuma legenda fornecida.";

      const mediaCredit = item?.["media:credit"] || item?.credit || "";
      const credit = (typeof mediaCredit === "string" ? mediaCredit : "").trim();

      const newsCategoryTag = item?.category || "Geral";
      const newsCategory = inferEditoriaFromLink(link, typeof newsCategoryTag === "string" ? newsCategoryTag : "Geral");

      const pubDateRaw = item?.pubDate || "";
      const formattedDate = formatPubDate(pubDateRaw);

      const { category, riskLevel, alertDesc } = classifyCredit(credit);

      data.push({
        title,
        link,
        description: descClean,
        image_url: imageUrl,
        caption: caption.trim(),
        credit: credit || "Sem Crédito",
        category,
        risk_level: riskLevel,
        alert_desc: alertDesc,
        news_category: newsCategory,
        pub_date: formattedDate,
        timestamp: pubDateRaw,
      });
    }

    return Response.json({ success: true, data, count: data.length }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
};

export const config = {
  path: "/.netlify/functions/feed",
};


