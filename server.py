import http.server
import socketserver
import urllib.request
import xml.etree.ElementTree as ET
import json
import re
import os
import sys
import html
from datetime import datetime
from urllib.parse import urlparse

PORT = 8001
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(WORKSPACE_DIR, 'public')

# Feed RSS do O Globo
RSS_URL = "https://oglobo.globo.com/rss/oglobo"

# Mapeamento de Namespaces do XML
NAMESPACES = {
    'media': 'http://search.yahoo.com/mrss/',
    'atom': 'http://www.w3.org/2005/Atom'
}

MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
}

def clean_html(raw_html):
    if not raw_html:
        return ""
    clean_text = re.sub(r'<[^>]+>', '', raw_html)
    clean_text = html.unescape(clean_text)
    return clean_text.strip()

def classify_credit(credit_text):
    credit = credit_text.strip().lower() if credit_text else ""
    
    if not credit:
        return ("Sem Credito", "alerta", "Atencao: Esta imagem nao possui creditos definidos. Risco de infracao de direitos autorais.")

    # 1. Parceiro Pago = Material Pago por Unidade (RISCO ALTO)
    if "parceiro" in credit:
        return ("Parceiro Pago / Unitario", "alto", f"Material Pago por Unidade: ({credit_text}). Foto licenciada individualmente. Alto risco de reuso.")
    
    # 2. Assinatura: AFP, Bloomberg, NYT (NAO CRITICO)
    assinatura_keywords = ["afp", "bloomberg", "nyt", "new york times"]
    for keyword in assinatura_keywords:
        if keyword in credit:
            return ("Assinatura ", "assinatura", f"Cobertura via Assinatura: ({credit_text}). Disponivel atraves de contrato institucional.")

    # 3. Getty / Agencias Internacionais (RISCO ALTO)
    getty_keywords = ["getty", "reuters", "ap photo", "associated press", "efe", "shutterstock", "istock"]
    for keyword in getty_keywords:
        if keyword in credit:
            return ("Getty / Agencia Externa", "alto", f"Alerta de Licenciamento: Foto de agencia internacional ({credit_text}). Requer licenca paga.")
            
    promo_keywords = ["divulgacao", "divulgaÃ§Ã£o", "acervo pessoal", "assessoria", "dino", "chatgpt", "publicidade", "patrocinado"]
    for keyword in promo_keywords:
        if keyword in credit:
            return ("Divulgacao / Comercial", "medio", f"Material Promocional: ({credit_text}). Uso editorial livre, mas atente para vies comercial.")
            
    gov_keywords = ["senado", "camara", "cÃ¢mara", "bndes", "governo", "gov.br", "agencia brasil", "prefeitura", "ministerio", "planalto"]
    for keyword in gov_keywords:
        if keyword in credit:
            return ("Institucional / Publico", "baixo_risco", f"Fonte Publica: ({credit_text}). Uso livre para imprensa.")
            
    internal_keywords = [
        "o globo", "agencia o globo", "editora globo", "valor economico", "g1", "extra", "globo",
        "fabiano rocha", "márcia foletto", "marcia foletto", "custódio coimbra", "custodio coimbra",
        "gabriel de paiva", "guito moreto", "marcelo theobald", "ana branco", "leo martins",
        "alexandre cassiano", "marina calderon", "brenno carvalho", "cristiano mariz",
        "maria isabel oliveira", "edilson dantas", "domingos peixoto"
    ]
    for keyword in internal_keywords:
        if keyword in credit:
            return ("Interno (O Globo)", "baixo", f"Producao Propria: ({credit_text}). Direitos do grupo Globo.")

    return ("Outros / Fontes nÃ£o tabeladas", "neutro", f"Verificar Direitos: ({credit_text}). Recomenda-se checar contrato.")

def extract_image_from_desc(desc_html):
    if not desc_html:
        return None
    match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc_html)
    if match:
        return match.group(1)
    return None

def infer_editoria_from_link(link, fallback_category="Geral"):
    if not link:
        return fallback_category or "Geral"
    try:
        parsed = urlparse(link)
        parts = [p for p in parsed.path.split('/') if p]
        if not parts:
            return fallback_category or "Geral"

        # Em links como /economia/noticia/... ou /rio/noticia/...
        # a editoria geralmente Ã© o primeiro segmento.
        first = parts[0].strip().lower()
        ignore = {"noticia", "blog", "blogs", "ultimas-noticias"}
        if first in ignore and len(parts) > 1:
            first = parts[1].strip().lower()

        aliases = {
            "politica": "PolÃ­tica",
            "rio": "Rio",
            "saude": "SaÃºde",
            "mundo": "Mundo",
            "economia": "Economia",
            "esportes": "Esportes",
            "cultura": "Cultura",
            "brasil": "Brasil",
            "tecnologia": "Tecnologia",
            "blog": "Blog",
            "blogs": "Blog",
        }
        if first in aliases:
            return aliases[first]
        if first:
            return first.replace("-", " ").title()
    except Exception:
        pass
    return fallback_category or "Geral"

def fetch_and_parse_rss():
    try:
        req = urllib.request.Request(
            RSS_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            xml_data = response.read()
            
        root = ET.fromstring(xml_data)
        items = []
        
        for item in root.findall('.//item'):
            title = item.find('title')
            title = title.text if title is not None else "Sem Titulo"
            
            link = item.find('link')
            link = link.text if link is not None else "#"
            
            desc_elem = item.find('description')
            desc_raw = desc_elem.text if desc_elem is not None else ""
            desc_clean = clean_html(desc_raw)
            
            image_url = None
            media_content = item.find('media:content', NAMESPACES)
            if media_content is not None:
                image_url = media_content.get('url')
            
            if not image_url:
                image_url = extract_image_from_desc(desc_raw)
            
            caption = ""
            media_desc = item.find('media:description', NAMESPACES)
            if media_desc is not None:
                caption = media_desc.text
            if not caption:
                caption = desc_clean[:200] + "..." if len(desc_clean) > 200 else desc_clean
                
            credit = ""
            media_credit = item.find('media:credit', NAMESPACES)
            if media_credit is not None:
                credit = media_credit.text
            
            category, risk_level, alert_desc = classify_credit(credit)
            
            news_category_tag = item.find('category')
            news_category_tag = news_category_tag.text if news_category_tag is not None else "Geral"
            news_category = infer_editoria_from_link(link, news_category_tag)
            
            pub_date = item.find('pubDate')
            pub_date = pub_date.text if pub_date is not None else ""
            
            formatted_date = pub_date
            try:
                date_clean = re.sub(r'\s[+-]\d+$', '', pub_date)
                dt = datetime.strptime(date_clean, "%a, %d %b %Y %H:%M:%S")
                months = {
                    "Jan": "Jan", "Feb": "Fev", "Mar": "Mar", "Apr": "Abr",
                    "May": "Mai", "Jun": "Jun", "Jul": "Jul", "Aug": "Ago",
                    "Sep": "Set", "Oct": "Out", "Nov": "Nov", "Dec": "Dez"
                }
                day = dt.strftime("%d")
                month_pt = months.get(dt.strftime("%b"), dt.strftime("%b"))
                year = dt.strftime("%Y")
                time_str = dt.strftime("%H:%M")
                formatted_date = f"{day} de {month_pt} de {year} as {time_str}"
            except Exception:
                pass
            
            if image_url:
                items.append({
                    "title": title,
                    "link": link,
                    "description": desc_clean,
                    "image_url": image_url,
                    "caption": caption.strip() if caption else "Nenhuma legenda fornecida.",
                    "credit": credit.strip() if credit else "Sem Credito",
                    "category": category,
                    "risk_level": risk_level,
                    "alert_desc": alert_desc,
                    "news_category": news_category,
                    "pub_date": formatted_date,
                    "timestamp": pub_date
                })
                
        return {"success": True, "data": items, "count": len(items)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


class DashboardHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Mapeia requisiÃ§Ãµes de arquivos estÃ¡ticos para a pasta public
        path = super().translate_path(path)
        rel_path = os.path.relpath(path, os.getcwd())
        
        # Redireciona a raiz para public/index.html
        if rel_path == '.' or rel_path == 'index.html':
            return os.path.join(PUBLIC_DIR, 'index.html')
            
        # Caso o arquivo exista em public, serve de lÃ¡
        public_file = os.path.join(PUBLIC_DIR, rel_path)
        if os.path.exists(public_file):
            return public_file
            
        return path

    def do_GET(self):
        # API de dados do feed RSS
        if self.path.startswith('/api/feed'):
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            feed_data = fetch_and_parse_rss()
            self.wfile.write(json.dumps(feed_data, ensure_ascii=False).encode('utf-8'))
        else:
            # Servidor estÃ¡tico padrÃ£o
            super().do_GET()


def run_server():
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DashboardHTTPRequestHandler) as httpd:
        print("\n=======================================================")
        print("  PHOTOSPY - Painel de Monitoramento de Imagens RSS")
        print(f"  Acesse no navegador: http://localhost:{PORT}")
        print("=======================================================\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado. Ate logo!")
            sys.exit(0)

if __name__ == '__main__':
    run_server()

