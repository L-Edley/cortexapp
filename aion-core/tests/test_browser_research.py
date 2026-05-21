import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import TimeoutException, Response

from aion.research.browser_research import (
    search_public_web,
    open_public_page,
    extract_readable_content,
    summarize_source,
    PublicPageContent,
    PublicSearchResult,
    SourceSummary
)

# ---------------------------------------------------------------------------
# Testes de Limpeza e Extração HTML
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_extract_readable_content_scrubbing():
    html = """
    <html>
        <head>
            <title>Ignorar Head</title>
            <style>body { background: #fff; }</style>
        </head>
        <body>
            <script>
                console.log("XSS block");
            </script>
            <noscript>Bloco noscript</noscript>
            <h1>Título Principal</h1>
            <p>Este é o primeiro parágrafo &amp; tem entidades.</p>
            <div>Este é outro texto no div.</div>
            <!-- Comentário que deve sumir -->
        </body>
    </html>
    """
    clean_text = await extract_readable_content(html)
    
    # Valida remoção de scripts, styles, noscript e comentários
    assert "console.log" not in clean_text
    assert "background" not in clean_text
    assert "Ignorar Head" not in clean_text
    assert "Comentário que deve sumir" not in clean_text
    assert "Bloco noscript" not in clean_text
    
    # Valida preservação de textos úteis
    assert "Título Principal" in clean_text
    assert "Este é o primeiro parágrafo & tem entidades." in clean_text
    assert "Este é outro texto no div." in clean_text


# ---------------------------------------------------------------------------
# Testes de Conectividade e Segurança (open_public_page)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_open_public_page_success(monkeypatch):
    url = "https://example.com/artigo-seguro"
    html_content = "<html><head><title>Artigo Teste</title></head><body><p>Conteúdo relevante do artigo.</p></body></html>"
    
    # Mock httpx.AsyncClient
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = html_content
    
    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    
    monkeypatch.setattr("httpx.AsyncClient", lambda *args, **kwargs: mock_client)
    
    page = await open_public_page(url)
    assert page.success is True
    assert page.title == "Artigo Teste"
    assert "Conteúdo relevante do artigo." in page.text
    assert page.error is None


@pytest.mark.asyncio
async def test_open_public_page_timeout(monkeypatch):
    url = "https://example.com/site-lento"
    
    # Mock httpx.AsyncClient raises TimeoutException
    mock_client = MagicMock()
    mock_client.get = AsyncMock(side_effect=TimeoutException("Timeout!"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    
    monkeypatch.setattr("httpx.AsyncClient", lambda *args, **kwargs: mock_client)
    
    page = await open_public_page(url)
    assert page.success is False
    assert page.text == ""
    assert "Timeout" in page.error


@pytest.mark.asyncio
async def test_open_public_page_captcha_security(monkeypatch):
    url = "https://example.com/site-com-captcha"
    html_with_captcha = "<html><body><form id='recaptcha-form'>Por favor complete o captcha</form></body></html>"
    
    # Mock httpx.AsyncClient
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = html_with_captcha
    
    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    
    monkeypatch.setattr("httpx.AsyncClient", lambda *args, **kwargs: mock_client)
    
    page = await open_public_page(url)
    assert page.success is False
    assert page.text == ""
    assert "Captcha" in page.error


@pytest.mark.asyncio
async def test_open_public_page_errors(monkeypatch):
    url_403 = "https://example.com/paywall"
    url_429 = "https://example.com/rate-limit"
    
    # Mock para 403
    mock_resp_403 = MagicMock()
    mock_resp_403.status_code = 403
    mock_resp_403.text = "Acesso Negado"
    
    mock_client_403 = MagicMock()
    mock_client_403.get = AsyncMock(return_value=mock_resp_403)
    mock_client_403.__aenter__ = AsyncMock(return_value=mock_client_403)
    mock_client_403.__aexit__ = AsyncMock(return_value=None)
    
    monkeypatch.setattr("httpx.AsyncClient", lambda *args, **kwargs: mock_client_403)
    
    page_403 = await open_public_page(url_403)
    assert page_403.success is False
    assert "403" in page_403.error or "negado" in page_403.error.lower()
    
    # Mock para 429
    mock_resp_429 = MagicMock()
    mock_resp_429.status_code = 429
    mock_resp_429.text = "Too Many Requests"
    
    mock_client_429 = MagicMock()
    mock_client_429.get = AsyncMock(return_value=mock_resp_429)
    mock_client_429.__aenter__ = AsyncMock(return_value=mock_client_429)
    mock_client_429.__aexit__ = AsyncMock(return_value=None)
    
    monkeypatch.setattr("httpx.AsyncClient", lambda *args, **kwargs: mock_client_429)
    
    page_429 = await open_public_page(url_429)
    assert page_429.success is False
    assert "429" in page_429.error or "excedido" in page_429.error.lower()


# ---------------------------------------------------------------------------
# Testes do summarize_source e search_public_web
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_public_web_mapping(monkeypatch):
    # Mock do search_web original do AION Core
    async def mock_search_web(query, max_results=5):
        return [
            {"title": "Artigo AION", "snippet": "AION OS de Inteligência", "url": "https://aion.org/docs"},
            {"title": "Supabase Wiki", "snippet": "Tabelas no Supabase", "url": "https://pt.wikipedia.org/wiki/Supabase"}
        ]
        
    monkeypatch.setattr("aion.research.browser_research.search_web", mock_search_web)
    
    results = await search_public_web("AION", max_results=2)
    assert len(results) == 2
    assert isinstance(results[0], PublicSearchResult)
    assert results[0].title == "Artigo AION"
    assert results[0].source == "public_web"
    assert results[1].title == "Supabase Wiki"
    assert results[1].source == "wikipedia"


@pytest.mark.asyncio
async def test_summarize_source_llm_mock(monkeypatch):
    page = PublicPageContent(
        url="https://example.com/aion",
        title="Manual AION",
        text="O AION Intelligence Core roda localmente e sincroniza com o Supabase.",
        success=True
    )
    
    async def mock_provider(messages):
        return '{"summary": "AION Core local first", "key_points": ["Roda local", "Sincroniza Supabase"], "confidence": 0.95}'
        
    async def mock_get_llm_provider():
        return mock_provider
        
    monkeypatch.setattr("aion.llm.factory.get_llm_provider", mock_get_llm_provider)
    
    summary = await summarize_source(page, "AION local-first")
    assert isinstance(summary, SourceSummary)
    assert summary.url == page.url
    assert summary.summary == "AION Core local first"
    assert "Roda local" in summary.key_points
    assert summary.confidence == 0.95
