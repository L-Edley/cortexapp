import sys
import json
import re
import asyncio
import logging
from typing import List, Dict, Optional

logger = logging.getLogger("aion.research.web_search")

from aion.config import settings


def _detect_lang(query: str) -> str:
    """Detect language for Wikipedia search."""
    portuguese_chars = set("áâãàéêíóôõúçÁÂÃÀÉÊÍÓÔÕÚÇ")
    spanish_chars = set("áéíóúñÑ¿¡ÁÉÍÓÚ")
    if any(c in portuguese_chars for c in query):
        return "pt"
    if any(c in spanish_chars for c in query):
        return "es"
    return "en"


async def _search_duckduckgo(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """Free fallback via DuckDuckGo HTML (accepts 200 or 202)."""
    try:
        import httpx
        import re
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                },
            )
            # DuckDuckGo may return 200 or 202; try to parse both
            if resp.status_code not in (200, 202):
                return []

            html = resp.text
            title_matches = re.findall(
                r'class="result__a"[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>',
                html, re.DOTALL,
            )
            snippet_matches = re.findall(
                r'class="result__snippet"[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>',
                html, re.DOTALL,
            )
            snippet_by_url = {url: text for url, text in snippet_matches}

            results = []
            for url, title_html in title_matches[:max_results]:
                title = re.sub(r'<[^>]+>', '', title_html).strip()
                snippet = re.sub(r'<[^>]+>', '', snippet_by_url.get(url, "")).strip()
                if url and title:
                    results.append({"title": title, "snippet": snippet, "url": url})

            return results
    except Exception as e:
        logger.warning("DuckDuckGo search failed: %s", e)
        return []


async def _search_wikipedia(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """Free, reliable, no API key needed."""
    try:
        import httpx
        lang = _detect_lang(query)
        api_url = f"https://{lang}.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": max_results,
            "format": "json",
        }
        headers = {
            "User-Agent": (
                "AION-IntelligenceCore/1.0 "
                "(AI assistant; https://github.com/aion; aion@local)"
            ),
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(api_url, params=params, headers=headers)
            if resp.status_code != 200:
                return []

            data = resp.json()
            search_results = data.get("query", {}).get("search", [])
            results = []
            for sr in search_results[:max_results]:
                title = sr.get("title", "")
                snippet = sr.get("snippet", "")
                # Clean HTML tags from snippet
                snippet = re.sub(r'<[^>]+>', '', snippet).strip()
                url = f"https://{lang}.wikipedia.org/wiki/{sr.get('title', '').replace(' ', '_')}"
                if title:
                    results.append({"title": title, "snippet": snippet, "url": url})
            return results
    except Exception as e:
        logger.warning("Wikipedia search failed: %s", e)
        return []


async def search_web(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    api_key = settings.TAVILY_API_KEY

    # 1) Tavily (if configured)
    if api_key:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": api_key,
                        "query": query,
                        "max_results": max_results,
                        "search_depth": "basic",
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    return [
                        {
                            "title": r.get("title", ""),
                            "snippet": r.get("content", ""),
                            "url": r.get("url", ""),
                        }
                        for r in results
                    ]
                logger.warning(
                    "Tavily API returned status %d: %s",
                    resp.status_code, resp.text[:200],
                )
        except ImportError:
            logger.warning("httpx not installed — cannot search web via Tavily")
        except asyncio.TimeoutError:
            logger.warning("Tavily API timed out")
        except Exception as e:
            logger.warning("Tavily API error: %s", e)

    # 2) DuckDuckGo fallback
    logger.info("Falling back to DuckDuckGo for: %s", query[:60])
    ddg = await _search_duckduckgo(query, max_results)
    if ddg:
        return ddg

    # 3) Wikipedia fallback
    logger.info("Falling back to Wikipedia for: %s", query[:60])
    wiki = await _search_wikipedia(query, max_results)
    if wiki:
        return wiki

    logger.warning("All web search methods failed for: %s", query[:60])
    return []


def _mask_api_key(key: str) -> str:
    if not key:
        return ""
    if len(key) > 8:
        return key[:4] + "****" + key[-4:]
    return "****"
