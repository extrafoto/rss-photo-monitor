/**
 * PhotoSpy // Painel de Monitoramento de Imagens e Direitos
 * Core Frontend Application Logic (Hybrid: Local API + Multi-Proxy Fallback)
 */

// Estado Global da Aplicação
const AppState = {
    allImages: [],        // Todas as imagens recebidas do RSS
    filteredImages: [],   // Imagens após pesquisa, filtro e ordenação
    previousUrls: new Set(), // URLs já vistas na requisição anterior para detectar novidades
    currentFilter: 'all', // Filtro de categoria ativo
    editoriaFilter: 'all', // Filtro de editoria (editoria mãe)
    riskFilter: 'all',    // Filtro de risco ativo (vindo dos KPIs)
    sortBy: 'newest',     // Método de ordenação: newest, oldest, agency
    autoRefreshInterval: 300, // Tempo de auto-refresh em segundos (5 minutos)
    secondsRemaining: 300,   // Segundos restantes até a próxima atualização
    timerId: null,        // ID do temporizador setInterval
    isInitialLoad: true   // Flag para evitar alarmes sonoros na primeira carga
};

const RSS_FEED_URL = "https://oglobo.globo.com/rss/oglobo";
const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:8001' : '';
const EDITORIAS = [
    "Economia",
    "Política",
    "Rio",
    "Esportes",
    "Cultura",
    "Brasil",
    "Mundo",
    "Saúde",
    "Blogs",
    "Opinião",
    "Ela",
    "RioShow",
    "Play",
    "Fato ou Fake"
];

// Elementos do DOM
const DOM = {
    photoGrid: document.getElementById('photoGrid'),
    btnRefresh: document.getElementById('btnRefresh'),
    timerText: document.getElementById('timerText'),
    timerRing: document.getElementById('timerRing'),
    editoriaSelect: document.getElementById('editoriaSelect'),
    sortSelect: document.getElementById('sortSelect'),
    galleryStatus: document.getElementById('galleryStatus'),
    toastUpdate: document.getElementById('toastUpdate'),
    toastMessage: document.getElementById('toastMessage'),
    apiStatus: document.getElementById('apiStatus'),
    notificationSound: document.getElementById('notificationSound'),
    
    // Stats / KPIs
    statTotal: document.getElementById('statTotal'),
    statGetty: document.getElementById('statGetty'),
    statAFP: document.getElementById('statAFP'),
    statPromo: document.getElementById('statPromo'),
    statNoCredit: document.getElementById('statNoCredit'),
    kpiCards: document.querySelectorAll('.kpi-card'),
    
    // Distribuição
    distBar: document.getElementById('distBar'),
    distLegend: document.getElementById('distLegend'),
    
    // Botões de filtro
    filterButtons: document.querySelectorAll('.filter-btn'),
    
    // Modal
    detailModal: document.getElementById('detailModal'),
    modalClose: document.getElementById('modalClose'),
    modalImg: document.getElementById('modalImg'),
    modalNewsCategory: document.getElementById('modalNewsCategory'),
    modalDate: document.getElementById('modalDate'),
    modalTitle: document.getElementById('modalTitle'),
    modalArticleLink: document.getElementById('modalArticleLink'),
    modalCopyLink: document.getElementById('modalCopyLink'),
    modalCredit: document.getElementById('modalCredit'),
    modalCategory: document.getElementById('modalCategory'),
    modalAuditCard: document.getElementById('modalAuditCard'),
    modalAuditIcon: document.getElementById('modalAuditIcon'),
    modalAuditTitle: document.getElementById('modalAuditTitle'),
    modalRiskBadge: document.getElementById('modalRiskBadge'),
    modalAuditDesc: document.getElementById('modalAuditDesc'),
    modalCaption: document.getElementById('modalCaption')
};

// Configurações do Temporizador Circular
const RING_RADIUS = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ==========================================================================
// 1. Inicialização e Configuração do Ciclo de Vida
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Configura o anel de contagem regressiva
    DOM.timerRing.style.strokeDasharray = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
    DOM.timerRing.style.strokeDashoffset = 0;
    
    // Carregar feed inicial
    fetchFeed();
    
    // Iniciar temporizador de contagem regressiva
    startCountdown();
    
    // Configurar Event Listeners
    populateEditoriaSelect();
    setupEventListeners();
});

function populateEditoriaSelect() {
    if (!DOM.editoriaSelect) return;
    const options = [
        `<option value="all">Todas as editorias</option>`,
        ...EDITORIAS.map(ed => `<option value="${ed.toLowerCase()}">${ed}</option>`)
    ];
    DOM.editoriaSelect.innerHTML = options.join('');
}

function setupEventListeners() {
    // Botão de Refresh manual
    DOM.btnRefresh.addEventListener('click', () => {
        const icon = DOM.btnRefresh.querySelector('i');
        icon.classList.add('spin');
        DOM.btnRefresh.disabled = true;
        
        fetchFeed().finally(() => {
            icon.classList.remove('spin');
            DOM.btnRefresh.disabled = false;
            resetTimer();
        });
    });
    
    // Evento de Ordenação
    DOM.sortSelect.addEventListener('change', (e) => {
        AppState.sortBy = e.target.value;
        applyFiltersAndRender();
    });

    // Evento de filtro por editoria (editoria mãe)
    DOM.editoriaSelect.addEventListener('change', (e) => {
        AppState.editoriaFilter = e.target.value;
        applyFiltersAndRender();
    });
    
    // Eventos de botões de filtro de categoria
    DOM.filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active de todos
            DOM.filterButtons.forEach(b => b.classList.remove('active'));
            // Adiciona no clicado
            btn.classList.add('active');
            
            AppState.currentFilter = btn.dataset.category;
            AppState.riskFilter = 'all'; // Reseta o filtro de risco dos KPIs
            
            // Remove active dos kpis
            DOM.kpiCards.forEach(c => c.classList.remove('active'));
            
            applyFiltersAndRender();
        });
    });
    
    // Eventos de clique nos KPIs para filtragem rápida por risco
    DOM.kpiCards.forEach(card => {
        card.addEventListener('click', () => {
            const isAlreadyActive = card.classList.contains('active');
            
            // Remove active de todos
            DOM.kpiCards.forEach(c => c.classList.remove('active'));
            
            if (isAlreadyActive) {
                AppState.riskFilter = 'all';
            } else {
                card.classList.add('active');
                AppState.riskFilter = card.dataset.filter;
            }
            
            // Reseta filtros de categoria do menu
            DOM.filterButtons.forEach(b => b.classList.remove('active'));
            DOM.filterButtons[0].classList.add('active'); // Seleciona "Todas"
            AppState.currentFilter = 'all';
            
            applyFiltersAndRender();
        });
    });
    
    // Fechamento de Modal
    DOM.modalClose.addEventListener('click', closeModal);
    DOM.detailModal.addEventListener('click', (e) => {
        if (e.target === DOM.detailModal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && DOM.detailModal.classList.contains('open')) {
            closeModal();
        }
    });

    // Copiar link da matéria em 1 clique
    DOM.modalCopyLink.addEventListener('click', async () => {
        const link = DOM.modalArticleLink.href;
        if (!link || link === '#') return;

        let copied = false;
        try {
            await navigator.clipboard.writeText(link);
            copied = true;
        } catch (e) {
            // Fallback para contextos sem permissão de clipboard
            const tempInput = document.createElement('input');
            tempInput.value = link;
            document.body.appendChild(tempInput);
            tempInput.select();
            tempInput.setSelectionRange(0, 99999);
            copied = document.execCommand('copy');
            document.body.removeChild(tempInput);
        }

        if (copied) {
            const oldHtml = DOM.modalCopyLink.innerHTML;
            DOM.modalCopyLink.innerHTML = '<i class="fa-solid fa-check"></i> Link copiado';
            setTimeout(() => {
                DOM.modalCopyLink.innerHTML = oldHtml;
            }, 1600);
        } else {
            showToast('Não foi possível copiar o link automaticamente.', 'error');
        }
    });

}

// ==========================================================================
// 2. Requisições e Processamento (Estratégia Híbrida de Conexão)
// ==========================================================================

async function fetchFeed() {
    // 1. Tenta primeiro a API do Servidor Python local (sem CORS, processado no backend)
    try {
        const localResponse = await fetch(`${API_BASE_URL}/api/feed`);
        if (localResponse.ok) {
            const result = await localResponse.json();
            if (result.success) {
                updateApiStatus(true, "Servidor Local (Sem CORS)");
                processFeedData(result.data);
                return;
            }
        }
    } catch (e) {
        console.log("Servidor local não detectado ou inativo. Iniciando bypass de CORS via Proxies de fallback...");
    }

    // 2. Fallbacks de Proxies de CORS (caso o HTML seja aberto diretamente via file://)
    const proxies = [
        {
            name: "AllOrigins",
            getUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        },
        {
            name: "CodeTabs",
            getUrl: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
        },
        {
            name: "CorsProxyIO",
            getUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
        }
    ];

    for (const proxy of proxies) {
        try {
            console.log(`Tentando obter o RSS usando o proxy: ${proxy.name}...`);
            const fetchUrl = proxy.getUrl(RSS_FEED_URL);
            
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Falha no proxy ${proxy.name}`);
            
            const xmlText = await response.text();
            
            // Decodifica e encerra a execução se der certo
            parseRSS(xmlText, `Proxy: ${proxy.name}`);
            return;
            
        } catch (proxyError) {
            console.warn(`Falha na obtenção via ${proxy.name}:`, proxyError);
        }
    }

    // Se todos falharem
    updateApiStatus(false, "Falha na Conexão");
    showToast("Erro crítico: Não foi possível obter o feed RSS. Verifique sua conexão.", "error");
}

function updateApiStatus(isOnline, sourceName = "") {
    if (isOnline) {
        DOM.apiStatus.textContent = sourceName || 'Online';
        DOM.apiStatus.className = 'status-online';
    } else {
        DOM.apiStatus.textContent = sourceName || 'Offline';
        DOM.apiStatus.className = 'status-offline';
    }
}

/**
 * Faz o parsing do XML no próprio navegador.
 */
function parseRSS(xmlText, sourceName) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Verifica se há erro de parsing
        const parserError = xmlDoc.querySelector("parsererror");
        if (parserError) {
            throw new Error("Erro ao analisar a estrutura XML do feed.");
        }
        
        const items = xmlDoc.querySelectorAll("item");
        const parsedItems = [];
        
        items.forEach(item => {
            // Extrai as tags considerando nomes diretos ou namespaces
            const title = item.querySelector("title")?.textContent || "Sem Título";
            const link = item.querySelector("link")?.textContent || "#";
            
            // Descrição crua (pode conter a imagem dentro do CDATA)
            const descRaw = item.querySelector("description")?.textContent || "";
            const descClean = cleanHtml(descRaw);
            
            // Imagem: tenta media:content e fallback na tag <img> dentro do description
            let imageUrl = null;
            const mediaContent = item.getElementsByTagName("media:content")[0] || item.getElementsByTagName("content")[0];
            if (mediaContent) {
                imageUrl = mediaContent.getAttribute("url");
            }
            
            if (!imageUrl) {
                imageUrl = extractImageFromDescription(descRaw);
            }
            
            // Legenda: tenta media:description e fallback no description limpo
            let caption = "";
            const mediaDesc = item.getElementsByTagName("media:description")[0] || item.getElementsByTagName("description")[0];
            if (mediaDesc && mediaDesc !== item.querySelector("description")) {
                caption = mediaDesc.textContent;
            }
            if (!caption) {
                caption = descClean.length > 200 ? descClean.substring(0, 200) + "..." : descClean;
            }
            
            // Crédito: tenta media:credit
            const mediaCredit = item.getElementsByTagName("media:credit")[0] || item.getElementsByTagName("credit")[0];
            const credit = mediaCredit ? mediaCredit.textContent.trim() : "";
            
            // Editoria: prioriza o caminho da URL da matéria e usa category como fallback
            const newsCategoryTag = item.querySelector("category")?.textContent || "Geral";
            const newsCategory = inferEditoriaFromLink(link, newsCategoryTag);
            
            // Data de Publicação
            const pubDateRaw = item.querySelector("pubDate")?.textContent || "";
            const formattedDate = formatPubDate(pubDateRaw);
            
            // Classifica de acordo com as regras de direitos autorais
            const { category, riskLevel, alertDesc } = classifyCredit(credit);
            
            // Adiciona na galeria apenas itens com imagem válida
            if (imageUrl) {
                parsedItems.push({
                    title: title,
                    link: link,
                    description: descClean,
                    image_url: imageUrl,
                    caption: caption.trim() || "Nenhuma legenda fornecida.",
                    credit: credit || "Sem Crédito",
                    category: category,
                    risk_level: riskLevel,
                    alert_desc: alertDesc,
                    news_category: newsCategory,
                    pub_date: formattedDate,
                    timestamp: pubDateRaw
                });
            }
        });
        
        updateApiStatus(true, sourceName);
        processFeedData(parsedItems);
        
    } catch (e) {
        console.error("Erro no Parser XML do Navegador:", e);
        updateApiStatus(false, "Erro no XML");
        showToast("Erro ao processar as tags XML do feed.", "error");
    }
}

// ==========================================================================
// 3. Utilitários de Parsing, Limpeza e Inteligência de Créditos
// ==========================================================================

function cleanHtml(rawHtml) {
    if (!rawHtml) return "";
    let clean = rawHtml.replace(/<[^>]+>/g, ''); // remove tags html
    
    // Decodifica entidades básicas de HTML
    const textarea = document.createElement("textarea");
    textarea.innerHTML = clean;
    return textarea.value.trim();
}

function extractImageFromDescription(descHtml) {
    if (!descHtml) return null;
    const match = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : null;
}

function inferEditoriaFromLink(link, fallbackCategory = "Geral") {
    if (!link) return fallbackCategory || "Geral";
    try {
        const url = new URL(link);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length === 0) return fallbackCategory || "Geral";

        let first = (parts[0] || "").toLowerCase().trim();
        const ignore = new Set(["noticia", "blog", "blogs", "ultimas-noticias"]);
        if (ignore.has(first) && parts[1]) {
            first = parts[1].toLowerCase().trim();
        }

        const aliases = {
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
            blogs: "Blog"
        };

        if (aliases[first]) return aliases[first];
        if (first) return first.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    } catch (e) {
        // fallback silencioso
    }
    return fallbackCategory || "Geral";
}

function formatPubDate(pubDateRaw) {
    if (!pubDateRaw) return "Data Indisponível";
    try {
        const date = new Date(pubDateRaw);
        if (isNaN(date.getTime())) return pubDateRaw;

        const parts = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(date);

        const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
        const monthMap = {
            "jan.": "Jan", "fev.": "Fev", "mar.": "Mar", "abr.": "Abr", "mai.": "Mai", "jun.": "Jun",
            "jul.": "Jul", "ago.": "Ago", "set.": "Set", "out.": "Out", "nov.": "Nov", "dez.": "Dez"
        };
        const month = monthMap[(map.month || "").toLowerCase()] || map.month;

        const day = map.day;
        const year = map.year;
        const hours = map.hour;
        const minutes = map.minute;

        return `${day} de ${month} de ${year} às ${hours}:${minutes}`;
    } catch (e) {
        return pubDateRaw;
    }
}

/**
 * Classifica a imagem com base no crédito textual.
 */
function classifyCredit(creditText) {
    const credit = creditText ? creditText.trim().toLowerCase() : "";
    
    if (!credit) {
        return {
            category: "Sem Crédito",
            riskLevel: "alerta",
            alertDesc: "Aviso Crítico: Esta imagem não possui créditos de autoria definidos no RSS. O uso externo acarreta alto risco de infração de copyright."
        };
    }

    // Regra específica: crédito conjunto de fonte pública deve prevalecer
    if ((credit.includes("agência brasil") || credit.includes("agencia brasil")) && credit.includes("prefeitura do rio")) {
        return {
            category: "Institucional / Público",
            riskLevel: "baixo_risco",
            alertDesc: `Fonte Pública: Imagem de órgão público ou governamental (${creditText}). O uso jornalístico é permitido livremente mediante crédito.`
        };
    }

    // Regra específica: créditos da Agência Brasil são fonte pública
    if (credit.includes("agência brasil") || credit.includes("agencia brasil")) {
        return {
            category: "Institucional / Público",
            riskLevel: "baixo_risco",
            alertDesc: `Fonte Pública: Imagem de órgão público ou governamental (${creditText}). O uso jornalístico é permitido livremente mediante crédito.`
        };
    }
    
    // 1. Assinatura: AFP, Bloomberg, NYT (Não Crítico)
    const assinaturaKeywords = ["afp", "bloomberg", "nyt", "new york times"];
    for (const kw of assinaturaKeywords) {
        if (credit.includes(kw)) {
            return {
                category: "Assinatura",
                riskLevel: "assinatura",
                alertDesc: `Cobertura via Assinatura: (${creditText}). Disponível através de contrato institucional.`
            };
        }
    }
    
    // 2. Getty / Agências Globais (Alto Risco)
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
                alertDesc: `Licenciamento Restrito: Foto pertencente a agência parceira internacional (${creditText}). O reuso necessita de licenciamento próprio ou contrato ativo.`
            };
        }
    }
    
    // 3. Parceiro + Agencia = Material Pago (RISCO ALTO)
    if (credit.includes("parceiro") && credit.includes("agencia")) {
        return {
            category: "Getty / Agência Externa",
            riskLevel: "alto",
            alertDesc: `Material de Agência Parceira: (${creditText}). Material pago. Requer licenciamento.`
        };
    }
    
    // 4. Divulgação (Médio Risco)
    const promoKeywords = ["divulgação", "acervo pessoal", "assessoria", "dino", "chatgpt", "midia", "anúncio", "publicidade"];
    for (const kw of promoKeywords) {
        if (credit.includes(kw)) {
            return {
                category: "Divulgação",
                riskLevel: "medio",
                alertDesc: `Conteúdo de Divulgação: Foto de assessoria de imprensa ou divulgação promocional (${creditText}). Uso editorial geralmente livre, mas atente para viés promocional.`
            };
        }
    }
    
    // 5. Governamental / Institucional (Baixo Risco)
    const govKeywords = ["senado", "câmara", "bndes", "governo", "gov.br", "agência brasil", "agencia brasil", "prefeitura", "ministério", "palácio do planalto"];
    for (const kw of govKeywords) {
        if (credit.includes(kw)) {
            return {
                category: "Institucional / Público",
                riskLevel: "baixo_risco",
                alertDesc: `Fonte Pública: Imagem de órgão público ou governamental (${creditText}). O uso jornalístico é permitido livremente mediante crédito.`
            };
        }
    }
    
    // 5. Interno (O Globo)
    const internalKeywords = [
        "o globo", "agência o globo", "editora globo", "valor econômico", "g1", "extra", "globo",
        "fabiano rocha", "márcia foletto", "marcia foletto", "custódio coimbra", "custodio coimbra",
        "gabriel de paiva", "guito moreto", "marcelo theobald", "ana branco", "leo martins",
        "alexandre cassiano", "marina calderon", "brenno carvalho", "cristiano mariz",
        "maria isabel oliveira", "edilson dantas", "domingos peixoto"
    ];
    for (const kw of internalKeywords) {
        if (credit.includes(kw)) {
            return {
                category: "Interno (O Globo)",
                riskLevel: "baixo",
                alertDesc: `Produção Interna: Foto própria dos jornalistas ou fotógrafos do jornal O Globo (${creditText}). Direitos inteiramente vinculados à empresa.`
            };
        }
    }
    
    // 6. Outros (fontes não tabeladas)
    return {
        category: "Outros / Fontes não tabeladas",
        riskLevel: "neutro",
        alertDesc: `Auditar Direitos: Imagem creditada a terceiro ou fotógrafo independente (${creditText}). Recomenda-se conferir o regime de contratação antes de qualquer reuso.`
    };
}

// ==========================================================================
// 4. Fluxo de Dados e Notificação de Novidades
// ==========================================================================

function processFeedData(data) {
    let newItemsCount = 0;
    const currentUrls = new Set(data.map(item => item.image_url));
    
    if (!AppState.isInitialLoad) {
        data.forEach(item => {
            if (!AppState.previousUrls.has(item.image_url)) {
                newItemsCount++;
                item.isNew = true;
            }
        });
    }
    
    // Atualiza o set de controle de URLs vistas
    AppState.previousUrls = currentUrls;
    AppState.allImages = data;
    
    // Calcular estatísticas agregadas antes de aplicar filtros
    calculateKPIs(data);
    
    // Renderizar
    applyFiltersAndRender();
    
    // Notificações de novos itens
    if (newItemsCount > 0 && !AppState.isInitialLoad) {
        showToast(`${newItemsCount} nova(s) imagem(ns) foram postadas no site!`, 'success');
        // Tenta tocar o som (navegadores podem bloquear se não houver interação)
        DOM.notificationSound.play().catch(e => console.log("Áudio bloqueado pelo navegador."));
    }
    
    AppState.isInitialLoad = false;
}

// ==========================================================================
// 5. Estatísticas, KPIs e Barra Gráfica
// ==========================================================================

function calculateKPIs(images) {
    const total = images.length;
    let kpiGetty = 0;
    let kpiAfp = 0;
    let kpiPromo = 0;
    let kpiNoCredit = 0;

    let getty = 0;
    let afp = 0;
    let promo = 0;
    let noCredit = 0;
    let internal = 0;
    let gov = 0;
    let others = 0;
    
    images.forEach(img => {
        // Estatísticas para os cards superiores
        if (img.risk_level === 'alto') kpiGetty++;
        if (img.risk_level === 'assinatura') kpiAfp++;
        if (img.risk_level === 'medio') kpiPromo++;
        if (img.risk_level === 'alerta') kpiNoCredit++;
        
        // Estatísticas para a barra de distribuição por agência
        if (img.category === 'Getty / Agência Externa') getty++;
        else if (img.category === 'Assinatura') afp++;
        else if (img.category === 'Divulgação') promo++;
        else if (img.category === 'Sem Crédito') noCredit++;
        else if (img.category === 'Interno (O Globo)') internal++;
        else if (img.category === 'Institucional / Público') gov++;
        else others++;
    });
    
    // Atualizar HTML dos KPIs
    animateCounter(DOM.statTotal, total);
    animateCounter(DOM.statGetty, kpiGetty);
    animateCounter(DOM.statAFP, kpiAfp);
    animateCounter(DOM.statPromo, kpiPromo);
    animateCounter(DOM.statNoCredit, kpiNoCredit);
    
    // Renderizar a Barra Segmentada de Distribuição
    renderDistributionBar({ total, internal, getty, afp, promo, gov, noCredit, others });
}

function animateCounter(element, targetValue) {
    let currentValue = parseInt(element.textContent) || 0;
    const duration = 800; // ms
    const stepTime = 20; // ms
    const steps = duration / stepTime;
    const increment = (targetValue - currentValue) / steps;
    let stepCount = 0;
    
    const timer = setInterval(() => {
        currentValue += increment;
        stepCount++;
        element.textContent = Math.round(currentValue).toString().padStart(2, '0');
        
        if (stepCount >= steps) {
            clearInterval(timer);
            element.textContent = targetValue.toString().padStart(2, '0');
        }
    }, stepTime);
}

function renderDistributionBar(stats) {
    const { total, internal, getty, afp, promo, gov, noCredit, others } = stats;
    
    if (total === 0) return;
    
    const pInternal = ((internal / total) * 100).toFixed(0);
    const pGetty = ((getty / total) * 100).toFixed(0);
    const pAFP = ((afp / total) * 100).toFixed(0);
    const pPromo = ((promo / total) * 100).toFixed(0);
    const pGov = ((gov / total) * 100).toFixed(0);
    const pNoCredit = ((noCredit / total) * 100).toFixed(0);
    const pOthers = ((others / total) * 100).toFixed(0);
    
    // Monta a barra segmentada dinamicamente
    DOM.distBar.innerHTML = `
        <div class="dist-segment seg-internal" style="width: ${pInternal}%" title="Interno: ${pInternal}%"></div>
        <div class="dist-segment seg-getty" style="width: ${pGetty}%" title="Getty: ${pGetty}%"></div>
        <div class="dist-segment seg-afp" style="width: ${pAFP}%" title="AFP: ${pAFP}%"></div>
        <div class="dist-segment seg-promo" style="width: ${pPromo}%" title="Divulgação: ${pPromo}%"></div>
        <div class="dist-segment seg-gov" style="width: ${pGov}%" title="Institucional: ${pGov}%"></div>
        <div class="dist-segment seg-nocredit" style="width: ${pNoCredit}%" title="Sem Crédito: ${pNoCredit}%"></div>
        <div class="dist-segment seg-others" style="width: ${pOthers}%" title="Outros: ${pOthers}%"></div>
    `;
    
    // Gera a legenda detalhada
    DOM.distLegend.innerHTML = `
        <div class="legend-item"><span class="legend-dot" style="background-color: var(--risk-low)"></span> Interno O Globo (${pInternal}%)</div>
        <div class="legend-item"><span class="legend-dot" style="background-color: var(--risk-high)"></span> Getty/Agências (${pGetty}%)</div>
        <div class="legend-item"><span class="legend-dot" style="background-color: var(--risk-signature)"></span> AFP (${pAFP}%)</div>
        <div class="legend-item"><span class="legend-dot" style="background-color: var(--risk-medium)"></span> Divulgação (${pPromo}%)</div>
        <div class="legend-item"><span class="legend-dot" style="background-color: var(--risk-low-risk)"></span> Institucional (${pGov}%)</div>
        <div class="legend-item"><span class="legend-dot" style="background-color: var(--risk-alert)"></span> Sem Crédito (${pNoCredit}%)</div>
        <div class="legend-item"><span class="legend-dot" style="background-color: var(--risk-neutral)"></span> Outros (${pOthers}%)</div>
    `;
}

// ==========================================================================
// 6. Filtragem, Ordenação e Renderização do Grid
// ==========================================================================

function applyFiltersAndRender() {
    let images = [...AppState.allImages];
    
    // A. Filtrar por Categoria Principal
    if (AppState.currentFilter !== 'all') {
        images = images.filter(img => img.category === AppState.currentFilter);
    }

    // A2. Filtrar por Editoria (mãe)
    if (AppState.editoriaFilter !== 'all') {
        const target = AppState.editoriaFilter;
        images = images.filter(img => {
            const normalized = (img.news_category || '').toLowerCase().trim();
            return normalized === target
                || normalized.startsWith(`${target} `)
                || normalized.startsWith(`${target}/`)
                || normalized.startsWith(`${target}-`);
        });
    }
    
    // B. Filtrar por Nível de Risco (KPIs)
    if (AppState.riskFilter !== 'all') {
        if (AppState.riskFilter === 'risk-high') {
            images = images.filter(img => img.risk_level === 'alto');
        } else if (AppState.riskFilter === 'risk-signature') {
            images = images.filter(img => img.risk_level === 'assinatura');
        } else if (AppState.riskFilter === 'risk-medium') {
            images = images.filter(img => img.risk_level === 'medio');
        } else if (AppState.riskFilter === 'risk-alert') {
            images = images.filter(img => img.risk_level === 'alerta');
        }
    }
    
    // C. Aplicar Ordenação
    if (AppState.sortBy === 'newest') {
        images.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (AppState.sortBy === 'oldest') {
        images.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else if (AppState.sortBy === 'agency') {
        images.sort((a, b) => a.category.localeCompare(b.category));
    }
    
    AppState.filteredImages = images;
    
    // Atualizar status
    DOM.galleryStatus.textContent = `Mostrando ${images.length} de ${AppState.allImages.length} imagens`;
    
    // Renderizar
    renderGrid(images);
}

function renderGrid(images) {
    // Limpar o Grid
    DOM.photoGrid.innerHTML = '';
    
    if (images.length === 0) {
        DOM.photoGrid.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <h3>Nenhuma imagem encontrada</h3>
                <p>Experimente mudar as categorias de filtro ou redefinir os filtros ativos.</p>
            </div>
        `;
        return;
    }
    
    // Criar fragmento de renderização para performance
    const fragment = document.createDocumentFragment();
    
    images.forEach((img, index) => {
        const card = document.createElement('div');
        
        // Classes com base no risco e novidade
        let attentionClass = '';
        if (img.risk_level === 'alto') attentionClass = 'attention-high';
        else if (img.risk_level === 'alerta') attentionClass = 'attention-warning';
        
        const newFlashClass = img.isNew ? 'new-item-flash' : '';
        card.className = `photo-card ${attentionClass} ${newFlashClass}`;
        
        // Mapeamento de badges de estilo
        const badgeClassMap = {
            'Getty / Agência Externa': 'badge-getty',
            'Divulgação': 'badge-promo',
            'Sem Crédito': 'badge-nocredit',
            'Interno (O Globo)': 'badge-internal',
            'Institucional / Público': 'badge-gov',
            'Outros / Fontes não tabeladas': 'badge-others'
        };
        
        const badgeClass = badgeClassMap[img.category] || 'badge-others';
        const warnIcon = img.risk_level === 'alto' || img.risk_level === 'alerta' 
            ? `<i class="fa-solid fa-triangle-exclamation warn-active" title="${img.alert_desc}"></i>` 
            : '<i class="fa-solid fa-camera"></i>';
            
        card.innerHTML = `
            <div class="card-image-wrapper">
                <img src="${img.image_url}" alt="${img.title}" loading="lazy">
                <div class="card-badges">
                    <span class="cat-badge">${img.news_category}</span>
                    <span class="agency-badge ${badgeClass}">${img.category}</span>
                </div>
            </div>
            <div class="card-body">
                <h4 class="card-title" title="${img.title}">${img.title}</h4>
                <p class="card-caption">${img.caption}</p>
                <div class="card-footer">
                    <div class="card-credit ${img.risk_level === 'alerta' ? 'warn-active' : ''}">
                        ${warnIcon}
                        <span title="${img.credit}">${img.credit}</span>
                    </div>
                    <div class="card-date">
                        <i class="fa-regular fa-clock"></i>
                        <span>${img.pub_date.split(' às ')[0]}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Limpar flag isNew após alguns segundos para não ficar repetindo animação
        if (img.isNew) {
            setTimeout(() => {
                card.classList.remove('new-item-flash');
                delete img.isNew;
            }, 3000);
        }
        
        // Clique para abrir modal
        card.addEventListener('click', () => openModal(img));
        
        // Suave efeito stagger na entrada
        card.style.animationDelay = `${Math.min(index * 0.04, 0.8)}s`;
        
        fragment.appendChild(card);
    });
    
    DOM.photoGrid.appendChild(fragment);
}

// ==========================================================================
// 7. Controle do Modal de Detalhes e Auditoria
// ==========================================================================

function openModal(img) {
    DOM.modalImg.src = img.image_url;
    DOM.modalNewsCategory.textContent = img.news_category;
    DOM.modalDate.innerHTML = `<i class="fa-solid fa-calendar-days"></i> ${img.pub_date}`;
    DOM.modalTitle.textContent = img.title;
    DOM.modalArticleLink.href = img.link;
    
    DOM.modalCredit.textContent = img.credit;
    DOM.modalCategory.textContent = img.category;
    DOM.modalCaption.textContent = img.description || img.caption;
    
    // Customizar cartão de auditoria e ponto de atenção
    const auditClassMap = {
        'alto': 'audit-high',
        'medio': 'audit-medium',
        'alerta': 'audit-alert',
        'baixo': 'audit-low',
        'baixo_risco': 'audit-low-risk',
        'neutro': 'audit-neutral'
    };
    
    const riskBadgeMap = {
        'alto': 'RISCO ALTO (AGÊNCIA)',
        'medio': 'DIVULGAÇÃO',
        'alerta': 'PERIGO (SEM CRÉDITO)',
        'baixo': 'BAIXO RISCO (INTERNO)',
        'baixo_risco': 'LIVRE (PÚBLICO)',
        'neutro': 'ATENÇÃO NEUTRA'
    };
    
    const auditIconMap = {
        'alto': '<i class="fa-solid fa-copyright"></i>',
        'medio': '<i class="fa-solid fa-bullhorn"></i>',
        'alerta': '<i class="fa-solid fa-triangle-exclamation"></i>',
        'baixo': '<i class="fa-solid fa-circle-check"></i>',
        'baixo_risco': '<i class="fa-solid fa-globe"></i>',
        'neutro': '<i class="fa-solid fa-user-pen"></i>'
    };
    
    // Limpar classes antigas de auditoria
    DOM.modalAuditCard.className = 'audit-card';
    const auditClass = auditClassMap[img.risk_level] || 'audit-neutral';
    DOM.modalAuditCard.classList.add(auditClass);
    
    // Configurar Textos e Ícones
    DOM.modalAuditIcon.innerHTML = auditIconMap[img.risk_level] || auditIconMap['neutro'];
    DOM.modalRiskBadge.textContent = riskBadgeMap[img.risk_level] || riskBadgeMap['neutro'];
    DOM.modalAuditDesc.textContent = img.alert_desc;
    
    // Título do Alerta
    let auditTitle = 'Análise de Direitos Autorais';
    if (img.risk_level === 'alto') auditTitle = 'Alerta: Licenciamento Exclusivo e Restrito';
    else if (img.risk_level === 'alerta') auditTitle = 'Alerta Crítico: Copyright Não Identificado';
    else if (img.risk_level === 'medio') auditTitle = 'Aviso: Material de Divulgação / Assessoria';
    else if (img.risk_level === 'baixo') auditTitle = 'Produção O Globo: Direitos Reservados';
    else if (img.risk_level === 'baixo_risco') auditTitle = 'Direitos Livres: Fonte Governamental';
    
    DOM.modalAuditTitle.textContent = auditTitle;
    
    // Abrir modal
    DOM.detailModal.classList.add('open');
    document.body.style.overflow = 'hidden'; // Impede scroll do body
}

function closeModal() {
    DOM.detailModal.classList.remove('open');
    document.body.style.overflow = '';
}

// ==========================================================================
// 8. Temporizador Circular e Contagem Regressiva (Auto-Refresh)
// ==========================================================================

function startCountdown() {
    AppState.secondsRemaining = AppState.autoRefreshInterval;
    
    if (AppState.timerId) clearInterval(AppState.timerId);
    
    AppState.timerId = setInterval(() => {
        AppState.secondsRemaining--;
        
        // Atualizar Anel e Texto do Timer
        updateTimerRing();
        
        if (AppState.secondsRemaining <= 0) {
            // Chegou a zero, atualizar feed
            DOM.btnRefresh.click(); // Simula clique no botão de atualizar
        }
    }, 1000);
}

function resetTimer() {
    AppState.secondsRemaining = AppState.autoRefreshInterval;
    updateTimerRing();
}

function updateTimerRing() {
    const elapsed = AppState.autoRefreshInterval - AppState.secondsRemaining;
    const progress = elapsed / AppState.autoRefreshInterval;
    const offset = RING_CIRCUMFERENCE - (progress * RING_CIRCUMFERENCE);
    
    DOM.timerRing.style.strokeDashoffset = offset;
    
    // Texto do timer
    const mins = Math.floor(AppState.secondsRemaining / 60);
    const secs = AppState.secondsRemaining % 60;
    
    if (mins > 0) {
        DOM.timerText.textContent = `${mins}m`;
    } else {
        DOM.timerText.textContent = `${secs}s`;
    }
}

// ==========================================================================
// 9. Componentes de UI Adicionais (Toasts)
// ==========================================================================

function showToast(message, type = 'success') {
    DOM.toastMessage.textContent = message;
    
    if (type === 'error') {
        DOM.toastUpdate.style.background = 'linear-gradient(135deg, var(--risk-high) 0%, hsl(354, 84%, 40%) 100%)';
        DOM.toastUpdate.querySelector('i').className = 'fa-solid fa-triangle-exclamation';
    } else {
        DOM.toastUpdate.style.background = 'linear-gradient(135deg, var(--risk-low-risk) 0%, hsl(142, 69%, 35%) 100%)';
        DOM.toastUpdate.querySelector('i').className = 'fa-solid fa-circle-check';
    }
    
    DOM.toastUpdate.classList.add('show');
    
    setTimeout(() => {
        DOM.toastUpdate.classList.remove('show');
    }, 4000);
}


