import os
import re
import json
import time
import shutil
import asyncio
import logging
import pytest
from aion.obsidian import writer
from aion.tools.registry import registry, ToolDefinition, ToolParameter, TOOL_TIMEOUT_SECONDS
from aion.middleware.auth import _RateLimiter
from aion.llm.providers import mask_api_key, safe_log_error


# ── Rate Limiter ──────────────────────────────────────────────


class TestRateLimiter:
    @pytest.mark.asyncio
    async def test_allows_within_limit(self):
        limiter = _RateLimiter(max_requests=5, window_seconds=60)
        for _ in range(5):
            assert await limiter.check("tenant-a") is True

    @pytest.mark.asyncio
    async def test_blocks_over_limit(self):
        limiter = _RateLimiter(max_requests=3, window_seconds=60)
        for _ in range(3):
            await limiter.check("tenant-b")
        assert await limiter.check("tenant-b") is False

    @pytest.mark.asyncio
    async def test_different_tenants_independent(self):
        limiter = _RateLimiter(max_requests=2, window_seconds=60)
        assert await limiter.check("t1") is True
        assert await limiter.check("t1") is True
        assert await limiter.check("t1") is False
        assert await limiter.check("t2") is True
        assert await limiter.check("t2") is True
        assert await limiter.check("t2") is False

    @pytest.mark.asyncio
    async def test_window_expires(self):
        limiter = _RateLimiter(max_requests=2, window_seconds=0.1)
        assert await limiter.check("t3") is True
        assert await limiter.check("t3") is True
        assert await limiter.check("t3") is False
        await asyncio.sleep(0.15)
        assert await limiter.check("t3") is True

    @pytest.mark.asyncio
    async def test_cleanup_reclaims_memory(self):
        limiter = _RateLimiter(max_requests=1, window_seconds=0.05)
        await limiter.check("old-tenant")
        await asyncio.sleep(0.1)
        await limiter.cleanup()
        assert "old-tenant" not in limiter._buckets


# ── Writer Path Traversal ──────────────────────────────────────


class TestWriterPathTraversal:
    @pytest.fixture(autouse=True)
    def env(self, monkeypatch):
        self.vault = os.path.realpath("test_obsidian_vault_sec")
        monkeypatch.setenv("OBSIDIAN_VAULT_PATH", self.vault)
        if os.path.exists(self.vault):
            shutil.rmtree(self.vault)
        yield
        if os.path.exists(self.vault):
            shutil.rmtree(self.vault)

    @pytest.mark.asyncio
    async def test_path_traversal_sanitized_to_safe_path(self):
        """app_id com ../ é sanitizado e o path final fica dentro do vault."""
        path = await writer.write_memory("../../etc/pwn", "test", None)
        assert path is not None
        assert path.startswith(self.vault)
        assert ".." not in path
        assert os.path.exists(path)
        assert os.path.realpath(path).startswith(os.path.realpath(self.vault))

    @pytest.mark.asyncio
    async def test_dotdot_is_sanitized(self):
        path = await writer.write_memory("../evil", "test", None)
        assert path is not None
        assert path.startswith(self.vault)

    @pytest.mark.asyncio
    async def test_absolute_path_app_id_sanitized(self):
        path = await writer.write_memory("/etc/passwd", "test", None)
        assert path is not None
        assert path.startswith(self.vault)

    @pytest.mark.asyncio
    async def test_backslash_paths_sanitized(self):
        path = await writer.write_memory("..\\..\\etc", "test", None)
        assert path is not None
        assert path.startswith(self.vault)

    @pytest.mark.asyncio
    async def test_legitimate_app_id_works(self):
        path = await writer.write_memory("cortex", "Safe content", None)
        assert path is not None
        assert os.path.exists(path)
        with open(path, encoding="utf-8") as f:
            assert "Safe content" in f.read()

    @pytest.mark.asyncio
    async def test_vault_isolation_tenant_a_not_in_b(self):
        await writer.write_memory("tenant-a", "Segredo A", None)
        b_dir = os.path.join(self.vault, "tenant-a", "memory")
        assert os.path.isdir(b_dir)
        c_dir = os.path.join(self.vault, "tenant-b")
        assert not os.path.isdir(c_dir)


# ── Writer Content Sanitization ────────────────────────────────


class TestWriterContentSanitization:
    @pytest.fixture(autouse=True)
    def env(self, monkeypatch):
        vault = os.path.realpath("test_obsidian_vault_san")
        monkeypatch.setenv("OBSIDIAN_VAULT_PATH", vault)
        if os.path.exists(vault):
            shutil.rmtree(vault)
        yield
        if os.path.exists(vault):
            shutil.rmtree(vault)

    @pytest.mark.asyncio
    async def test_removes_script_tags(self):
        path = await writer.write_memory("app", 'Normal <script>alert(1)</script> text', None)
        assert path
        with open(path, encoding="utf-8") as f:
            content = f.read()
        assert "alert(1)" not in content
        assert "Normal" in content
        assert "text" in content

    @pytest.mark.asyncio
    async def test_removes_event_handlers(self):
        path = await writer.write_memory("app", '<img src=x onerror=alert(1)>', None)
        assert path
        with open(path, encoding="utf-8") as f:
            content = f.read()
        assert "onerror" not in content
        assert "onerror=alert" not in content

    @pytest.mark.asyncio
    async def test_blocks_javascript_protocol(self):
        path = await writer.write_memory("app", '<a href="javascript:alert(1)">link</a>', None)
        assert path
        with open(path, encoding="utf-8") as f:
            content = f.read()
        assert "javascript:alert" not in content
        assert "blocked:" in content

    @pytest.mark.asyncio
    async def test_blocks_data_protocol(self):
        path = await writer.write_memory("app", '<iframe src="data:text/html,<script>alert(1)</script>">', None)
        assert path
        with open(path, encoding="utf-8") as f:
            content = f.read()
        assert "data:text/html" not in content
        assert "blocked:" in content

    @pytest.mark.asyncio
    async def test_normal_markdown_preserved(self):
        path = await writer.write_memory("app", "# Hello\n\n**bold** and `code`", None)
        assert path
        with open(path, encoding="utf-8") as f:
            content = f.read()
        assert "# Hello" in content
        assert "**bold**" in content
        assert "`code`" in content

    @pytest.mark.asyncio
    async def test_knowledge_content_sanitized(self):
        path = await writer.write_knowledge("app", '<script>bad()</script>Safe', ["t"])
        assert path
        with open(path, encoding="utf-8") as f:
            content = f.read()
        assert "bad()" not in content
        assert "Safe" in content

    @pytest.mark.asyncio
    async def test_decision_content_and_reasoning_sanitized(self):
        path = await writer.write_decision("app", '<script>x()</script>Dec', '<img onerror=alert(1)>')
        assert path
        with open(path, encoding="utf-8") as f:
            content = f.read()
        assert "x()" not in content
        assert "Dec" in content
        assert "onerror" not in content
        assert "alert" not in content


# ── Tool Registry Pydantic Validation ──────────────────────────


class TestToolRegistryValidation:
    def test_validates_string_params(self):
        assert registry.validate_tool_call("create_task", {"title": "Task", "due_date": "2026-01-01"}) is True

    def test_rejects_missing_params(self):
        assert registry.validate_tool_call("create_task", {"title": "Task"}) is False

    def test_rejects_wrong_type_for_string(self):
        assert registry.validate_tool_call("create_task", {"title": 123, "due_date": "x"}) is False

    def test_rejects_unknown_tool(self):
        assert registry.validate_tool_call("nonexistent", {}) is False

    def test_number_param_validation(self):
        td = ToolDefinition(
            name="calc", description="Calculator",
            parameters={"value": ToolParameter(type="number", description="Numeric value")},
        )
        local_reg = __import__("aion.tools.registry", fromlist=["ToolRegistry"]).ToolRegistry()
        local_reg.register("calc", td, lambda p, c: {"ok": True})
        assert local_reg.validate_tool_call("calc", {"value": 42}) is True
        assert local_reg.validate_tool_call("calc", {"value": "not-a-number"}) is False

    def test_boolean_param_validation(self):
        td = ToolDefinition(
            name="flag", description="Toggle flag",
            parameters={"enabled": ToolParameter(type="boolean", description="Enable or disable")},
        )
        local_reg = __import__("aion.tools.registry", fromlist=["ToolRegistry"]).ToolRegistry()
        local_reg.register("flag", td, lambda p, c: {"ok": True})
        assert local_reg.validate_tool_call("flag", {"enabled": True}) is True
        assert local_reg.validate_tool_call("flag", {"enabled": False}) is True
        assert local_reg.validate_tool_call("flag", {"enabled": 42}) is False


class TestToolRegistryTimeout:
    @pytest.mark.asyncio
    async def test_slow_tool_times_out(self):
        async def slow_handler(params, context):
            await asyncio.sleep(TOOL_TIMEOUT_SECONDS + 1)
            return {"done": True}

        td = ToolDefinition(
            name="slow", description="Slow tool",
            parameters={"x": ToolParameter(type="string", description="param")},
        )
        local_reg = __import__("aion.tools.registry", fromlist=["ToolRegistry"]).ToolRegistry()
        local_reg.register("slow", td, slow_handler)

        result = await local_reg.execute_tool("slow", {"x": "y"}, {})
        assert result["status"] == "error"
        assert "timed out" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_fast_tool_succeeds_within_timeout(self):
        async def fast_handler(params, context):
            await asyncio.sleep(0.01)
            return {"done": True}

        td = ToolDefinition(
            name="fast", description="Fast tool",
            parameters={"x": ToolParameter(type="string", description="param")},
        )
        local_reg = __import__("aion.tools.registry", fromlist=["ToolRegistry"]).ToolRegistry()
        local_reg.register("fast", td, fast_handler)

        result = await local_reg.execute_tool("fast", {"x": "y"}, {})
        assert result["status"] == "success"


class TestToolRegistryAuditLog:
    @pytest.mark.asyncio
    async def test_logs_successful_execution(self, caplog):
        caplog.set_level(logging.INFO)
        result = await registry.execute_tool("web_search", {"query": "segurança"}, {"app_id": "test-tenant"})
        assert result["status"] == "success"
        records = [r for r in caplog.records if "Audit" in r.getMessage()]
        assert len(records) == 1
        assert "tool_execution" in records[0].getMessage()

    @pytest.mark.asyncio
    async def test_logs_rejected_execution(self, caplog):
        caplog.set_level(logging.INFO)
        result = await registry.execute_tool("web_search", {}, {"app_id": "test"})
        assert result["status"] == "error"
        records = [r for r in caplog.records if "Audit" in r.getMessage()]
        assert len(records) == 1
        assert "rejected" in records[0].getMessage()

    @pytest.mark.asyncio
    async def test_logs_unknown_tool(self, caplog):
        caplog.set_level(logging.INFO)
        result = await registry.execute_tool("unknown_tool", {}, {})
        assert result["status"] == "error"
        records = [r for r in caplog.records if "Audit" in r.getMessage()]
        assert len(records) == 1
        assert "error" in records[0].getMessage()


# ── Provider API Key Masking ───────────────────────────────────


class TestProviderMasking:
    def test_masks_openai_api_key(self):
        key = "sk-" + "a" * 40
        masked = mask_api_key(key)
        assert masked != key
        assert masked.startswith("sk-")
        assert "..." in masked
        assert masked.endswith("aaaa")
        assert "a" * 40 not in masked

    def test_masks_gemini_api_key(self):
        key = "AIza" + "b" * 30
        masked = mask_api_key(key)
        assert masked != key
        assert "..." in masked

    def test_passes_normal_text_unmodified(self):
        text = "This is normal error text without keys"
        assert mask_api_key(text) == text

    def test_masks_multiple_keys_in_text(self):
        text = "First key: sk-abcdefghijklmnopqrstuvwxyz0123456789abcd, second: sk-0123456789abcdefghijklmnopqrstuvwxyzABCD"
        masked = mask_api_key(text)
        assert "sk-abcdefghijklmnopqrstuvwxyz0123456789abcd" not in masked
        assert "..." in masked
        assert masked.count("...") == 2

    def test_masks_in_error_log(self, caplog):
        caplog.set_level(logging.WARNING)
        safe_log_error(logging.getLogger("test"), "groq",
                       RuntimeError("API error: sk-abcdefghijklmnopqrstuvwxyz0123456789abcd"),
                       [{"role": "user", "content": "hi"}])
        assert "sk-abcdefghijklmnopqrstuvwxyz0123456789abcd" not in caplog.text
        assert "sk-" in caplog.text
        assert "..." in caplog.text

    def test_safe_log_error_no_messages(self, caplog):
        caplog.set_level(logging.WARNING)
        safe_log_error(logging.getLogger("test"), "mock", RuntimeError("Some error"))
        assert "Some error" in caplog.text
