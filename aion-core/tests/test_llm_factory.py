import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from aion.llm import factory
from aion.llm.providers import groq, gemini, openai_p, ollama, mock


@pytest.fixture(autouse=True)
def clear_env_keys(monkeypatch):
    for k in ("GROQ_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(k, raising=False)


class TestProviderAvailability:

    @pytest.mark.asyncio
    async def test_factory_returns_mock_when_no_keys(self):
        with patch("aion.llm.providers.ollama.is_available", new_callable=AsyncMock, return_value=False):
            provider = await factory.get_llm_provider()
            result = await provider([{"role": "user", "content": "test"}])
            assert "Mock Response" in result

    @pytest.mark.asyncio
    async def test_factory_returns_groq_when_key_set(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
        with patch("aion.llm.providers.groq.complete", new_callable=AsyncMock, return_value="Groq reply"):
            provider = await factory.get_llm_provider()
            result = await provider([{"role": "user", "content": "Hi"}])
            assert result == "Groq reply"

    @pytest.mark.asyncio
    async def test_factory_returns_gemini_when_groq_missing(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "ai_test")
        with patch("aion.llm.providers.gemini.complete", new_callable=AsyncMock, return_value="Gemini reply"):
            provider = await factory.get_llm_provider()
            result = await provider([{"role": "user", "content": "Hi"}])
            assert result == "Gemini reply"

    @pytest.mark.asyncio
    async def test_factory_returns_openai_when_previous_missing(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk_test")
        with patch("aion.llm.providers.openai_p.complete", new_callable=AsyncMock, return_value="OpenAI reply"):
            provider = await factory.get_llm_provider()
            result = await provider([{"role": "user", "content": "Hi"}])
            assert result == "OpenAI reply"

    @pytest.mark.asyncio
    async def test_factory_ollama_fallback(self, monkeypatch):
        with (
            patch("aion.llm.providers.ollama.is_available", new_callable=AsyncMock, return_value=True),
            patch("aion.llm.providers.ollama.complete", new_callable=AsyncMock, return_value="Ollama reply"),
        ):
            provider = await factory.get_llm_provider()
            result = await provider([{"role": "user", "content": "Hi"}])
            assert result == "Ollama reply"


class TestFactoryComplete:

    @pytest.mark.asyncio
    async def test_complete_falls_through_to_mock(self):
        with patch("aion.llm.providers.ollama.is_available", new_callable=AsyncMock, return_value=False):
            result = await factory.complete([{"role": "user", "content": "Hello"}])
            assert result.startswith("[Mock Response]")

    @pytest.mark.asyncio
    async def test_complete_uses_groq_when_available(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
        with patch("aion.llm.providers.groq.complete", new_callable=AsyncMock, return_value="Groq reply"):
            result = await factory.complete([{"role": "user", "content": "Hi"}])
            assert result == "Groq reply"

    @pytest.mark.asyncio
    async def test_complete_fallback_on_failure(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk_test")
        with (
            patch("aion.llm.providers.groq.complete", side_effect=Exception("Groq down")),
            patch("aion.llm.providers.gemini.complete", side_effect=Exception("Gemini down")),
            patch("aion.llm.providers.openai_p.complete", new_callable=AsyncMock, return_value="OpenAI reply"),
        ):
            result = await factory.complete([{"role": "user", "content": "Hi"}])
            assert result == "OpenAI reply"

    @pytest.mark.asyncio
    async def test_complete_all_providers_fail_raises(self):
        with (
            patch("aion.llm.providers.groq.complete", side_effect=Exception("fail")),
            patch("aion.llm.providers.gemini.complete", side_effect=Exception("fail")),
            patch("aion.llm.providers.openai_p.complete", side_effect=Exception("fail")),
            patch("aion.llm.providers.ollama.is_available", new_callable=AsyncMock, return_value=True),
            patch("aion.llm.providers.ollama.complete", side_effect=Exception("fail")),
            patch("aion.llm.providers.mock.complete", side_effect=Exception("mock fail")),
        ):
            with pytest.raises(RuntimeError, match="All LLM providers failed"):
                await factory.complete([{"role": "user", "content": "Hi"}])


class TestIndividualProviders:

    @pytest.mark.asyncio
    async def test_mock_always_returns(self):
        result = await mock.complete([{"role": "user", "content": "test"}])
        assert isinstance(result, str)
        assert "Mock Response" in result

    @pytest.mark.asyncio
    async def test_groq_not_available_without_key(self):
        assert await groq.is_available() is False
        with pytest.raises(RuntimeError, match="GROQ_API_KEY not set"):
            await groq.complete([{"role": "user", "content": "test"}])

    @pytest.mark.asyncio
    async def test_gemini_not_available_without_key(self):
        assert await gemini.is_available() is False
        with pytest.raises(RuntimeError, match="GEMINI_API_KEY not set"):
            await gemini.complete([{"role": "user", "content": "test"}])

    @pytest.mark.asyncio
    async def test_openai_not_available_without_key(self):
        assert await openai_p.is_available() is False
        with pytest.raises(RuntimeError, match="OPENAI_API_KEY not set"):
            await openai_p.complete([{"role": "user", "content": "test"}])

    @pytest.mark.asyncio
    async def test_ollama_not_available_when_offline(self):
        with patch("aion.llm.providers.ollama.is_available", new_callable=AsyncMock, return_value=False):
            assert await ollama.is_available() is False

    @pytest.mark.asyncio
    async def test_ollama_complete_raises_when_offline(self):
        with patch("aion.llm.providers.ollama.is_available", new_callable=AsyncMock, return_value=False):
            with pytest.raises(RuntimeError, match="Ollama not available"):
                await ollama.complete([{"role": "user", "content": "test"}])

    @pytest.mark.asyncio
    async def test_groq_calls_openai_sdk(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "gsk_test")

        mock_response = AsyncMock()
        mock_choice = MagicMock()
        mock_choice.message = MagicMock(content="groq answer")
        mock_response.choices = [mock_choice]

        mock_completions = MagicMock()
        mock_completions.create = AsyncMock(return_value=mock_response)

        mock_chat = MagicMock()
        mock_chat.completions = mock_completions

        mock_client_instance = MagicMock()
        mock_client_instance.chat = mock_chat

        with patch("aion.llm.providers.groq.AsyncOpenAI") as MockClient:
            MockClient.return_value = mock_client_instance
            result = await groq.complete([{"role": "user", "content": "Hello"}])
            assert result == "groq answer"

    @pytest.mark.asyncio
    async def test_openai_calls_sdk(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk_test")

        mock_response = AsyncMock()
        mock_choice = MagicMock()
        mock_choice.message = MagicMock(content="openai answer")
        mock_response.choices = [mock_choice]

        mock_completions = MagicMock()
        mock_completions.create = AsyncMock(return_value=mock_response)

        mock_chat = MagicMock()
        mock_chat.completions = mock_completions

        mock_client_instance = MagicMock()
        mock_client_instance.chat = mock_chat

        with patch("aion.llm.providers.openai_p.AsyncOpenAI") as MockClient:
            MockClient.return_value = mock_client_instance
            result = await openai_p.complete([{"role": "user", "content": "Hi"}])
            assert result == "openai answer"

    @pytest.mark.asyncio
    async def test_gemini_calls_sdk(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "ai_test")
        mock_response = AsyncMock()
        mock_response.text = "gemini answer"
        with (
            patch("aion.llm.providers.gemini.genai.configure"),
            patch("aion.llm.providers.gemini.genai.GenerativeModel") as MockModel,
        ):
            instance = MockModel.return_value
            instance.generate_content_async = AsyncMock(return_value=mock_response)
            result = await gemini.complete([{"role": "user", "content": "Hi"}])
            assert result == "gemini answer"

    @pytest.mark.asyncio
    async def test_gemini_respects_system_message(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "ai_test")
        mock_response = AsyncMock()
        mock_response.text = "ok"
        with (
            patch("aion.llm.providers.gemini.genai.configure"),
            patch("aion.llm.providers.gemini.genai.GenerativeModel") as MockModel,
        ):
            instance = MockModel.return_value
            instance.generate_content_async = AsyncMock(return_value=mock_response)
            await gemini.complete([
                {"role": "system", "content": "You are a bot"},
                {"role": "user", "content": "Hi"},
            ])
            call_kwargs = MockModel.call_args.kwargs
            assert call_kwargs.get("system_instruction") == "You are a bot"

    @pytest.mark.asyncio
    async def test_provider_order_is_respected(self):
        assert factory.PROVIDER_ORDER == ["groq", "gemini", "openai", "ollama", "mock"]
