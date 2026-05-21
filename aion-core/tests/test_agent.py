import os
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from aion.tools.registry import ToolRegistry, ToolDefinition, ToolParameter, registry
from aion.agent.reasoner import (
    decide_response_source,
    compute_rag_confidence,
    build_rag_context,
    build_cache_reply,
    extract_reply,
    try_parse_tool_calls,
)
from aion.agent.agent import run, AionResponse


class TestReasoner:

    def test_decision_cache_when_high_confidence(self):
        assert decide_response_source(0.90) == "cache"
        assert decide_response_source(0.75) == "cache"

    def test_decision_enrich_when_medium_confidence(self):
        assert decide_response_source(0.60) == "enrich"
        assert decide_response_source(0.50) == "enrich"

    def test_decision_llm_when_low_confidence(self):
        assert decide_response_source(0.40) == "llm"
        assert decide_response_source(0.00) == "llm"

    def test_confidence_from_context(self):
        ctx = "[memory] (confidence: 0.80) some content\n[knowledge] (confidence: 0.60)"
        assert compute_rag_confidence(ctx) == 0.80

    def test_confidence_zero_when_empty(self):
        assert compute_rag_confidence("") == 0.0
        assert compute_rag_confidence("no numbers here") == 0.0

    def test_build_cache_reply(self):
        reply = build_cache_reply("some context", "user input")
        assert "Cached from RAG" in reply
        assert "some context" in reply

    @pytest.mark.asyncio
    async def test_build_rag_context_empty(self, monkeypatch):
        monkeypatch.delenv("GROQ_API_KEY", raising=False)
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        result = await build_rag_context("test-tenant", "hello")
        assert result == ""

    def test_extract_reply_plain_text(self):
        assert extract_reply("Hello world") == "Hello world"

    def test_extract_reply_json_with_content(self):
        reply = extract_reply('{"content": "real answer", "tool": "none"}')
        assert reply == "real answer"

    def test_extract_reply_json_no_content(self):
        reply = extract_reply('{"tool_calls": []}')
        assert reply == '{"tool_calls": []}'

    def test_try_parse_tool_calls_empty(self):
        assert try_parse_tool_calls("plain text") == []

    def test_try_parse_tool_calls_valid(self):
        calls = try_parse_tool_calls(
            '{"tool_calls": [{"name": "create_task", "arguments": {"title": "Test"}}]}'
        )
        assert len(calls) == 1
        assert calls[0]["name"] == "create_task"

    def test_try_parse_tool_calls_simple(self):
        calls = try_parse_tool_calls('{"tool": "save_memory", "params": {"content": "x"}}')
        assert len(calls) == 1
        assert calls[0]["name"] == "save_memory"


class TestToolRegistry:

    def setup_method(self):
        self.reg = ToolRegistry()
        async def handler(params, ctx):
            return {"result": f"hello {params['name']}"}
        self.reg.register(
            "test_tool",
            ToolDefinition(
                name="test_tool",
                description="A test tool",
                parameters={
                    "name": ToolParameter(type="string", description="A name"),
                },
            ),
            handler,
        )

    def test_validate_tool_call_valid(self):
        assert self.reg.validate_tool_call("test_tool", {"name": "world"}) is True

    def test_validate_tool_call_missing_param(self):
        assert self.reg.validate_tool_call("test_tool", {}) is False

    def test_validate_tool_call_unknown_tool(self):
        assert self.reg.validate_tool_call("nonexistent", {}) is False

    @pytest.mark.asyncio
    async def test_execute_tool_success(self):
        result = await self.reg.execute_tool("test_tool", {"name": "world"}, {})
        assert result["status"] == "success"
        assert result["result"]["result"] == "hello world"

    @pytest.mark.asyncio
    async def test_execute_tool_not_found(self):
        result = await self.reg.execute_tool("unknown", {}, {})
        assert result["status"] == "error"

    @pytest.mark.asyncio
    async def test_execute_tool_handler_error(self):
        reg = ToolRegistry()
        async def bad_handler(p, c):
            raise Exception("oops")
        reg.register("bad", ToolDefinition(name="bad", description="x", parameters={}), bad_handler)
        result = await reg.execute_tool("bad", {}, {})
        assert result["status"] == "error"
        assert "oops" in result["error"]

    def test_get_openai_tools(self):
        tools = self.reg.get_openai_tools()
        assert len(tools) == 1
        assert tools[0]["type"] == "function"
        assert tools[0]["function"]["name"] == "test_tool"

    def test_list_definitions(self):
        defs = self.reg.list_definitions()
        assert len(defs) == 1
        assert defs[0].name == "test_tool"


class TestMockTools:

    @pytest.mark.asyncio
    async def test_create_task(self):
        result = await registry.execute_tool("create_task", {"title": "Buy milk", "due_date": "2026-05-21"}, {})
        assert result["status"] == "success"
        assert result["result"]["title"] == "Buy milk"
        assert result["result"]["status"] == "created"

    @pytest.mark.asyncio
    async def test_web_search(self):
        result = await registry.execute_tool("web_search", {"query": "test"}, {})
        assert result["status"] == "success"
        assert len(result["result"]["results"]) > 0


class TestAgentRun:

    @pytest.mark.asyncio
    async def test_agent_returns_cache_source_for_high_confidence(self):
        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value="[memory] (confidence: 0.90) cached"),
            patch("aion.memory.sqlite_store", new_callable=AsyncMock, create=True),
            patch("aion.obsidian.writer", new_callable=AsyncMock, create=True),
        ):
            response = await run("tenant-x", "user-1", "hello", {})
            assert response.response_source == "cache"
            assert "Cached from RAG" in response.ui_reply
            assert response.confidence == 0.90

    @pytest.mark.asyncio
    async def test_agent_calls_llm_for_low_confidence(self):
        async def mock_complete(messages, tools=None):
            return "Hi there!"

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-1"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            response = await run("tenant-x", "user-1", "hello", {})
            assert response.response_source == "provider"
            assert response.ui_reply == "Hi there!"

    @pytest.mark.asyncio
    async def test_agent_executes_tool_when_llm_returns_tool_call(self):
        tool_response = json.dumps({
            "tool_calls": [{"name": "create_task", "arguments": {"title": "Buy bread", "due_date": "2026-05-22"}}],
            "content": "I'll create that task for you.",
        })

        async def mock_complete(messages, tools=None):
            return tool_response

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-2"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            response = await run("tenant-x", "user-1", "create a task", {})
            assert response.action_executed == "create_task"
            assert response.ui_reply == "I'll create that task for you."
            assert response.response_source == "provider"

    @pytest.mark.asyncio
    async def test_agent_rejects_invalid_tool_call(self):
        tool_response = json.dumps({
            "tool_calls": [{"name": "create_task", "arguments": {}}],
            "content": "Missing params.",
        })

        async def mock_complete(messages, tools=None):
            return tool_response

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-3"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            response = await run("tenant-x", "user-1", "create task", {})
            assert response.action_executed is None
            assert response.ui_reply == "Missing params."

    @pytest.mark.asyncio
    async def test_agent_enrich_source_includes_context(self):
        rag = "[memory] (confidence: 0.60) some memory"

        async def mock_complete(messages, tools=None):
            return "Enriched reply"

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=rag),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=rag),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-4"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock),
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            response = await run("tenant-x", "user-1", "hello", {})
            assert response.response_source == "provider"
            assert response.ui_reply == "Enriched reply"

    @pytest.mark.asyncio
    async def test_agent_logs_action_to_sqlite(self):
        async def mock_complete(messages, tools=None):
            return "ok"

        async def mock_get_provider():
            return mock_complete

        with (
            patch("aion.agent.reasoner.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine.build_rag_context", new_callable=AsyncMock, return_value=""),
            patch("aion.learning.learning_engine._check_recent_cache", new_callable=AsyncMock, return_value=None),
            patch("aion.llm.factory.get_llm_provider", side_effect=mock_get_provider),
            patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock, return_value="k-5"),
            patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock),
            patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2, 0.3]),
            patch("aion.memory.sqlite_store.log_action", new_callable=AsyncMock) as mock_log,
            patch("aion.obsidian.writer.write_memory", new_callable=AsyncMock),
        ):
            await run("tenant-x", "user-1", "hello", {})
            mock_log.assert_awaited_once()
