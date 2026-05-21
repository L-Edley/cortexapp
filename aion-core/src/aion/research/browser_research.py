"""
AION Browser Research Module — Pesquisa web segura e leitura de páginas públicas.
"""

import re
import datetime
import logging
from typing import List, Optional
import httpx
from pydantic import BaseModel, Field

from aion.research.web_search import search_web
from aion.llm import factory as llm_factory

logger = logging.getLogger("aion.research.browser")

# ---------------------------------------------------------------------------
# Tipos Pydantic
# ---------------------------------------------------------------------------

class PublicSearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    source: str


class PublicPageContent(BaseModel):
    url: str
    title: str
    text: str
    fetched_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    success: bool
    error: Optional[str] = None


class SourceSummary(BaseModel):
    url: str
    topic: str
    summary: str
    key_points: List[str]
    confidence: float


# ---------------------------------------------------------------------------
# Funções de Pesquisa e Leitura
# ---------------------------------------------------------------------------

async def search_public_web(query: str, max_results: int = 5) -> List[PublicSearchResult]:
    """
    Pesquisa na web usando o motor existente do AION Core e retorna resultados estruturados.
    """
    try:
        raw_results = await search_web(query, max_results=max_results)
        mapped = []
        for r in raw_results:
            url = r.get("url", "")
            source = "public_web"
            if "wikipedia.org" in url:
                source = "wikipedia"
            
            mapped.append(PublicSearchResult(
                title=r.get("title", "") or "Sem título",
                url=url,
                snippet=r.get("snippet", "") or "",
                source=source
            ))
        return mapped
    except Exception as e:
        logger.error("Erro na pesquisa pública web: %s", e)
        return []


async def open_public_page(url: str) -> PublicPageContent:
    """
    Abre uma página web pública usando httpx, aplicando regras de segurança e timeout estrito.
    """
    # Regras de segurança obrigatórias:
    # Não usar login automático, captchas ou cookies/sessões persistentes.
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    
    fetched_at = datetime.datetime.utcnow().isoformat()
    
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            
            # Detecção simples de bloqueios comuns / paywall / captcha
            if resp.status_code == 403:
                return PublicPageContent(
                    url=url,
                    title="",
                    text="",
                    fetched_at=fetched_at,
                    success=False,
                    error="Acesso negado (HTTP 403). Possível paywall ou bloqueio Cloudflare."
                )
            elif resp.status_code == 429:
                return PublicPageContent(
                    url=url,
                    title="",
                    text="",
                    fetched_at=fetched_at,
                    success=False,
                    error="Limite de requisições excedido na origem (HTTP 429)."
                )
            elif resp.status_code != 200:
                return PublicPageContent(
                    url=url,
                    title="",
                    text="",
                    fetched_at=fetched_at,
                    success=False,
                    error=f"Erro HTTP {resp.status_code} ao buscar página."
                )
            
            html = resp.text
            
            # Verifica se contém indicação de captcha no HTML
            if "captcha" in html.lower() or "recaptcha" in html.lower() or "hcaptcha" in html.lower():
                return PublicPageContent(
                    url=url,
                    title="",
                    text="",
                    fetched_at=fetched_at,
                    success=False,
                    error="Página protegida por Captcha detectada. Acesso abortado por segurança."
                )
            
            # Extração de Título
            title_match = re.search(r"<title\b[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
            title = title_match.group(1).strip() if title_match else "Sem título"
            # Limpa tags dentro do título se houver
            title = re.sub(r"<[^>]+>", "", title).strip()
            
            # Extração do conteúdo de texto limpo
            text_content = await extract_readable_content(html)
            
            return PublicPageContent(
                url=url,
                title=title,
                text=text_content,
                fetched_at=fetched_at,
                success=True
            )
            
    except httpx.TimeoutException:
        logger.warning("Timeout excedido ao ler URL: %s", url)
        return PublicPageContent(
            url=url,
            title="",
            text="",
            fetched_at=fetched_at,
            success=False,
            error="Timeout de 8 segundos excedido ao conectar ao site."
        )
    except Exception as e:
        logger.error("Falha ao abrir página pública %s: %s", url, e)
        return PublicPageContent(
            url=url,
            title="",
            text="",
            fetched_at=fetched_at,
            success=False,
            error=str(e)
        )


async def extract_readable_content(html_or_url: str) -> str:
    """
    Remove tags HTML, scripts, CSS e espaços extras para extrair o conteúdo legível textual de uma página.
    Se for uma URL direta, primeiro chama open_public_page.
    """
    if html_or_url.startswith("http://") or html_or_url.startswith("https://"):
        page = await open_public_page(html_or_url)
        return page.text
    
    html = html_or_url
    
    # 1. Remove blocos de script, style, head, iframe, noscript
    html = re.sub(r"<script\b[^<]*(?:(?!</script>)<[^<]*)*</script\s*>", "", html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r"<style\b[^<]*(?:(?!</style>)<[^<]*)*</style\s*>", "", html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r"<head\b[^<]*(?:(?!</head>)<[^<]*)*</head\s*>", "", html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r"<noscript\b[^<]*(?:(?!</noscript>)<[^<]*)*</noscript\s*>", "", html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL) # Comentários HTML
    
    # 2. Substitui quebras estruturais por novas linhas
    html = re.sub(r"</?(?:p|div|h[1-6]|li|br|tr|p)\b[^>]*>", "\n", html, flags=re.IGNORECASE)
    
    # 3. Remove todas as tags restantes
    text = re.sub(r"<[^>]+>", "", html)
    
    # 4. Substitui entidades comuns de HTML
    entities = {
        "&nbsp;": " ",
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&rsquo;": "'",
        "&ldquo;": '"',
        "&rdquo;": '"',
        "&ndash;": "-",
        "&mdash;": "-",
    }
    for ent, char in entities.items():
        text = text.replace(ent, char)
        
    # 5. Normaliza quebras de linha e espaços
    lines = [line.strip() for line in text.splitlines()]
    clean_lines = [l for l in lines if l]
    
    return "\n".join(clean_lines)


async def summarize_source(content: PublicPageContent, topic: str) -> SourceSummary:
    """
    Resume o conteúdo da página recuperada relacionando com o tópico de estudo,
    utilizando o LLM oficial e configurado.
    """
    if not content.success or not content.text:
        return SourceSummary(
            url=content.url,
            topic=topic,
            summary=content.error or "Conteúdo indisponível ou vazio.",
            key_points=[],
            confidence=0.0
        )
        
    try:
        provider = await llm_factory.get_llm_provider()
        
        # Limita o texto enviado ao LLM para evitar estourar tokens de contexto (limite razoável de ~6000 palavras)
        truncated_text = content.text[:25000]
        
        prompt = f"""Você é um assistente de pesquisa científica de alto nível.
Estude o seguinte texto extraído de uma página web pública e extraia conhecimentos úteis diretamente relacionados ao tópico solicitado.

Tópico de Estudo: {topic}
Título da Página: {content.title}
URL de Origem: {content.url}

Conteúdo textual extraído:
---
{truncated_text}
---

Instruções:
1. Resuma as informações mais relevantes em até 150 palavras.
2. Identifique até 5 pontos chave (key points) cruciais.
3. Determine um grau de confiança (confidence) entre 0.0 e 1.0 (onde 1.0 representa alta confiabilidade acadêmica/factual e 0.0 baixa credibilidade).

Retorne APENAS um JSON válido no formato abaixo. Não adicione markdown ou blocos de código além do JSON:
{{
  "summary": "Resumo analítico...",
  "key_points": ["ponto 1", "ponto 2", "ponto 3"],
  "confidence": 0.85
}}"""

        messages = [
            {"role": "system", "content": "You are a precise JSON extractor. Output ONLY valid raw JSON."},
            {"role": "user", "content": prompt}
        ]
        
        raw = await provider(messages)
        
        # Extrai e limpa a resposta JSON
        clean = raw.replace("```json", "").replace("```", "").strip()
        import json
        data = json.loads(clean)
        
        summary = str(data.get("summary", ""))
        key_points = list(data.get("key_points", []))
        confidence = float(data.get("confidence", 0.5))
        
        return SourceSummary(
            url=content.url,
            topic=topic,
            summary=summary,
            key_points=key_points,
            confidence=confidence
        )
        
    except Exception as e:
        logger.error("Erro ao resumir fonte %s: %s", content.url, e)
        return SourceSummary(
            url=content.url,
            topic=topic,
            summary=f"Resumo parcial da fonte. LLM falhou: {str(e)}",
            key_points=[],
            confidence=0.3
        )
