# PhotoSpy // Painel de Monitoramento de Imagens e Direitos (RSS)

Este é um painel moderno e interativo em tempo real para monitorar imagens publicadas no site do jornal O Globo, analisando legendas e **créditos fotográficos** de forma inteligente para alertar sobre direitos de imagem (como fotos Getty Images, AFP ou fotos comerciais de Divulgação).

O projeto é **100% estático (Client-Side)**. Você não precisa rodar nenhum backend, servidor Python, Node.js ou banco de dados! Ele lê e analisa o RSS diretamente no seu navegador, contornando a política de **CORS** por meio de um proxy público.

---

## 🚀 Como Iniciar

1. Vá até a pasta `public`.
2. Dê um duplo-clique no arquivo **`index.html`** no seu Explorador de Arquivos do Windows.
3. Pronto! O painel será aberto no seu navegador padrão e começará a monitorar as fotos em tempo real.

---

## 🛠️ Como Funciona a Tecnologia

- **Bypass de CORS**: O feed RSS padrão do O Globo (`https://oglobo.globo.com/rss/oglobo`) possui restrições de cross-origin (CORS) que impedem o navegador de lê-lo diretamente. Usamos o proxy seguro e gratuito `https://corsproxy.io/?` para contornar essa barreira no frontend.
- **Parsing XML Nativo**: O JavaScript utiliza o objeto padrão do navegador `DOMParser` para decodificar o feed XML retornado, extraindo as tags `<item>`, as URLs das fotos (`media:content` ou tags `<img>` internas), as legendas e os créditos autorais.
- **Auto-Atualização Circular**: O painel possui um temporizador gráfico em anel no canto superior direito que faz a contagem regressiva de 5 minutos (configurável no código). Ao zerar, ele realiza uma nova busca em background e insere as fotos novas com animações suaves de fade-in e um alerta sonoro opcional.
- **Filtros e Busca**: Permite buscar qualquer palavra-chave instantaneamente em títulos, legendas ou fotógrafos, além de botões rápidos para isolar imagens de agências de risco.

---

## 🔍 Regras de Inteligência de Auditoria (Pontos de Atenção)

O painel inspeciona os créditos das fotos e as classifica dinamicamente em 6 categorias de direitos, aplicando avisos visuais e recomendações no **Modal de Detalhes** ao clicar em qualquer imagem:

1. 🔴 **Getty / Agência Externa (Alto Risco)**: Identifica termos como *Getty, AFP, Reuters, AP Photo, Associated Press, EFE, Bloomberg*.
   - *Aviso*: Licenciamento pago internacional. Não reutilizar em redes sociais ou canais próprios sem contrato ativo.
2. 🟣 **Divulgação / Comercial (Médio Risco)**: Identifica termos como *Divulgação, Acervo Pessoal, Assessoria, Dino, ChatGPT*.
   - *Aviso*: Material promocional corporativo. Livre para fins jornalísticos básicos, mas atente para o viés comercial da fonte.
3. 🔵 **Interno O Globo (Baixo Risco)**: Identifica termos como *O Globo, Agência O Globo, Editora Globo, Valor*.
   - *Aviso*: Produção interna do grupo Globo. Propriedade intelectual do veículo.
4. 🟢 **Institucional / Público (Livre)**: Identifica termos como *Senado, Câmara, BNDES, Governo, Prefeitura, Agência Brasil*.
   - *Aviso*: Uso livre com fins informativos/jornalísticos citando a devida fonte governamental.
5. 🟡 **Sem Crédito Declarado (Perigo)**: Quando a tag de crédito está vazia ou ausente no XML.
   - *Aviso*: Origem da foto desconhecida. Risco máximo de direitos autorais para reuso.
6. ⚪ **Outros / Freelancers (Neutro)**: Qualquer outro autor independente.
   - *Aviso*: Verificar regimes contratuais antes de reutilizar.

---

## 📁 Estrutura de Arquivos Criada

- `public/index.html`: Layout estrutural do dashboard (Dark mode, KPIs, Galeria e Modal de Detalhes).
- `public/style.css`: Folha de estilos premium utilizando HSL Tailored, Glassmorphism, glows flutuantes e animações fluidas.
- `public/app.js`: Script principal de orquestração (busca XML via proxy CORS, parsing, animações dos KPIs, temporizador circular e modais).
