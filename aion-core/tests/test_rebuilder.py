import os
import shutil
import json
import pytest
from aion.obsidian import writer, reader, rebuilder
from aion.memory import sqlite_store


_uid_counter = [0]


def _unique_id():
    _uid_counter[0] += 1
    return f"rebtest-{_uid_counter[0]}"


def _write_vault_file(vault_base, app_id, subdir, fname, frontmatter, body):
    """Helper to write a vault file at a precise path (bypassing writer)."""
    d = os.path.join(vault_base, app_id, subdir, "2026-01")
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, fname)
    lines = ["---"]
    for k, v in frontmatter.items():
        if isinstance(v, list):
            lines.append(f"{k}: [{', '.join(v)}]")
        elif isinstance(v, dict):
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        else:
            lines.append(f"{k}: {v}")
    lines.append("---")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n\n" + body)
    return path


@pytest.fixture(autouse=True)
def obsidian_env(monkeypatch):
    vault = "test_obsidian_vault"
    monkeypatch.setenv("OBSIDIAN_VAULT_PATH", vault)
    if os.path.exists(vault):
        shutil.rmtree(vault, ignore_errors=True)
    if os.path.exists("data"):
        shutil.rmtree("data", ignore_errors=True)
    yield
    if os.path.exists(vault):
        shutil.rmtree(vault, ignore_errors=True)
    if os.path.exists("data"):
        shutil.rmtree("data", ignore_errors=True)


# ── reader tests ──────────────────────────────────────────────


class TestParseFrontmatter:
    def test_valid_frontmatter(self, tmp_path):
        md = tmp_path / "test.md"
        md.write_text(
            "---\n"
            "id: mem_abc\n"
            "type: memory\n"
            "tenant: my-app\n"
            "confidence: 0.95\n"
            "tags: [tag1, tag2]\n"
            "created_at: 2026-01-01T00:00:00\n"
            "---\n"
            "# Hello\n\nWorld"
        )
        result = reader.parse_frontmatter(str(md))
        assert result is not None
        assert result["frontmatter"]["id"] == "mem_abc"
        assert result["frontmatter"]["type"] == "memory"
        assert result["frontmatter"]["confidence"] == 0.95
        assert result["frontmatter"]["tags"] == ["tag1", "tag2"]
        assert "World" in result["body"]

    def test_no_frontmatter(self, tmp_path):
        md = tmp_path / "plain.md"
        md.write_text("# Just a title\n\nSome content")
        assert reader.parse_frontmatter(str(md)) is None

    def test_empty_file(self, tmp_path):
        md = tmp_path / "empty.md"
        md.write_text("")
        assert reader.parse_frontmatter(str(md)) is None

    def test_invalid_yaml(self, tmp_path):
        md = tmp_path / "bad.md"
        md.write_text("---\ninvalid: [unclosed\n---\nbody")
        assert reader.parse_frontmatter(str(md)) is None

    def test_non_dict_frontmatter(self, tmp_path):
        md = tmp_path / "list.md"
        md.write_text("---\n- one\n- two\n---\nbody")
        assert reader.parse_frontmatter(str(md)) is None


class TestReadAll:
    @pytest.mark.asyncio
    async def test_reads_all_types(self):
        aid = _unique_id()
        await writer.write_memory(aid, "Memory content", {"key": "val"})
        await writer.write_knowledge(aid, "Knowledge content", ["tag"], 0.8)
        await writer.write_decision(aid, "Decision content", "Reasoning text")

        records = reader.read_all(aid)
        assert len(records) == 3

        types = {r.type for r in records}
        assert types == {"memory", "knowledge", "decision"}

    @pytest.mark.asyncio
    async def test_read_by_type_filters(self):
        """Escreve múltiplos registros com IDs diferentes para testar filtro."""
        aid = _unique_id()
        vault = os.environ["OBSIDIAN_VAULT_PATH"]
        _write_vault_file(vault, aid, "memory", "m1.md",
                          {"id": "mem_1", "type": "memory", "tenant": aid,
                           "created_at": "2026-01-01T00:00:00"},
                          "# M1\n\nContent A")
        _write_vault_file(vault, aid, "memory", "m2.md",
                          {"id": "mem_2", "type": "memory", "tenant": aid,
                           "created_at": "2026-01-01T00:01:00"},
                          "# M2\n\nContent B")
        _write_vault_file(vault, aid, "knowledge", "k1.md",
                          {"id": "know_1", "type": "knowledge", "tenant": aid,
                           "tags": ["t"], "created_at": "2026-01-01T00:00:00"},
                          "# K1\n\nKnow A")

        mems = reader.read_by_type(aid, "memory")
        assert len(mems) == 2
        assert all(r.type == "memory" for r in mems)

        knows = reader.read_by_type(aid, "knowledge")
        assert len(knows) == 1
        assert knows[0].type == "knowledge"

    @pytest.mark.asyncio
    async def test_ignores_action_logs(self):
        aid = _unique_id()
        await writer.write_memory(aid, "M", None)
        await writer.write_action_log(aid, {"a": 1}, {"b": 2})

        records = reader.read_all(aid)
        assert len(records) == 1
        assert records[0].type == "memory"

    def test_no_vault_path(self, monkeypatch):
        monkeypatch.delenv("OBSIDIAN_VAULT_PATH", raising=False)
        assert reader.read_all("any") == []

    def test_no_tenant_dir(self):
        aid = _unique_id()
        assert reader.read_all(aid) == []

    @pytest.mark.asyncio
    async def test_reads_metadata_from_memory(self):
        aid = _unique_id()
        await writer.write_memory(aid, "Content", {"source": "voice", "priority": "high"})

        records = reader.read_all(aid)
        assert len(records) == 1
        rec = records[0]
        assert rec.content == "Content"
        assert rec.metadata is not None

    @pytest.mark.asyncio
    async def test_reads_reasoning_from_decision(self):
        aid = _unique_id()
        await writer.write_decision(aid, "Decision text", "My reasoning here")

        records = reader.read_all(aid)
        assert len(records) == 1
        rec = records[0]
        assert rec.content == "Decision text"
        assert rec.reasoning == "My reasoning here"


# ── rebuilder tests ────────────────────────────────────────────


class TestRebuildFromVault:
    @pytest.mark.asyncio
    async def test_rebuild_memories(self):
        aid = _unique_id()
        vault = os.environ["OBSIDIAN_VAULT_PATH"]
        _write_vault_file(vault, aid, "memory", "m1.md",
                          {"id": "mem_1", "type": "memory", "tenant": aid,
                           "created_at": "2026-01-01T00:00:00"},
                          "# M1\n\nMemory A")
        _write_vault_file(vault, aid, "memory", "m2.md",
                          {"id": "mem_2", "type": "memory", "tenant": aid,
                           "created_at": "2026-01-01T00:01:00"},
                          "# M2\n\nMemory B")

        report = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert report.memories_restored == 2
        assert report.knowledge_restored == 0
        assert report.decisions_restored == 0
        assert report.errors_skipped == 0

        mems = await sqlite_store.get_memories(aid, 10)
        assert len(mems) == 2
        contents = {m["content"] for m in mems}
        assert contents == {"Memory A", "Memory B"}

    @pytest.mark.asyncio
    async def test_rebuild_knowledge(self):
        aid = _unique_id()
        vault = os.environ["OBSIDIAN_VAULT_PATH"]
        _write_vault_file(vault, aid, "knowledge", "k1.md",
                          {"id": "know_1", "type": "knowledge", "tenant": aid,
                           "tags": ["t1"], "confidence": 0.9, "created_at": "2026-01-01T00:00:00"},
                          "# Know A\n\nKnow A")
        _write_vault_file(vault, aid, "knowledge", "k2.md",
                          {"id": "know_2", "type": "knowledge", "tenant": aid,
                           "tags": ["t2"], "confidence": 0.5, "created_at": "2026-01-01T00:01:00"},
                          "# Know B\n\nKnow B")

        report = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert report.knowledge_restored == 2

        results = await sqlite_store.search_knowledge(aid, "Know")
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_rebuild_decisions(self):
        aid = _unique_id()
        vault = os.environ["OBSIDIAN_VAULT_PATH"]
        _write_vault_file(vault, aid, "decisions", "d1.md",
                          {"id": "dec_1", "type": "decision", "tenant": aid,
                           "created_at": "2026-01-01T00:00:00"},
                          "# Dec A\n\nDec A\n\n## Reasoning\n\nReason A")
        _write_vault_file(vault, aid, "decisions", "d2.md",
                          {"id": "dec_2", "type": "decision", "tenant": aid,
                           "created_at": "2026-01-01T00:01:00"},
                          "# Dec B\n\nDec B\n\n## Reasoning\n\nReason B")

        report = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert report.decisions_restored == 2

        async with sqlite_store.tenant_db_connection(aid) as conn:
            cursor = await conn.execute(
                "SELECT content, reasoning FROM decisions WHERE app_id = ? ORDER BY content",
                (aid,),
            )
            rows = await cursor.fetchall()
            assert len(rows) == 2
            assert rows[0]["content"] == "Dec A"
            assert rows[0]["reasoning"] == "Reason A"

    @pytest.mark.asyncio
    async def test_rebuild_full_report(self):
        aid = _unique_id()
        await writer.write_memory(aid, "M1", None)
        await writer.write_knowledge(aid, "K1", ["x"])
        await writer.write_decision(aid, "D1", "r")

        report = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert report.tenant == aid
        assert report.memories_restored == 1
        assert report.knowledge_restored == 1
        assert report.decisions_restored == 1
        assert report.errors_skipped == 0
        assert report.duration_seconds > 0

    @pytest.mark.asyncio
    async def test_idempotent_rebuild(self):
        aid = _unique_id()
        await writer.write_memory(aid, "Only one", None)

        r1 = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert r1.memories_restored == 1

        r2 = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert r2.memories_restored == 0  # already exists

        mems = await sqlite_store.get_memories(aid, 10)
        assert len(mems) == 1

    @pytest.mark.asyncio
    async def test_rebuild_without_chroma_succeeds(self):
        aid = _unique_id()
        await writer.write_memory(aid, "M", None)
        await writer.write_knowledge(aid, "K", ["t"])

        report = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert report.memories_restored == 1
        assert report.knowledge_restored == 1
        assert report.errors_skipped == 0

    @pytest.mark.asyncio
    async def test_rebuild_empty_vault(self):
        aid = _unique_id()
        report = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert report.memories_restored == 0
        assert report.knowledge_restored == 0
        assert report.decisions_restored == 0
        assert report.errors_skipped == 0

    @pytest.mark.asyncio
    async def test_rebuild_skips_corrupted_files(self):
        aid = _unique_id()
        await writer.write_memory(aid, "Good", None)

        vault = os.environ.get("OBSIDIAN_VAULT_PATH", "test_obsidian_vault")
        bad_file = os.path.join(vault, aid, "memory", "corrupt.md")
        os.makedirs(os.path.dirname(bad_file), exist_ok=True)
        with open(bad_file, "w", encoding="utf-8") as f:
            f.write("No frontmatter here")

        report = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        assert report.memories_restored == 1
        assert report.errors_skipped == 0

    @pytest.mark.asyncio
    async def test_bytes_in_rebuild_report(self):
        aid = _unique_id()
        await writer.write_memory(aid, "Mem", None)

        report = await rebuilder.rebuild_from_vault(aid, include_chroma=False)
        d = report.model_dump()
        assert "tenant" in d
        assert "memories_restored" in d
        assert "knowledge_restored" in d
        assert "decisions_restored" in d
        assert "errors_skipped" in d
        assert "duration_seconds" in d

    @pytest.mark.asyncio
    async def test_rebuild_with_chroma_fallback(self, monkeypatch):
        aid = _unique_id()
        await writer.write_memory(aid, "M1", None)

        async def _fail(*a, **kw):
            raise Exception("Chroma down")

        monkeypatch.setattr(rebuilder, "_rebuild_chroma", _fail)

        report = await rebuilder.rebuild_from_vault(aid, include_chroma=True)
        assert report.memories_restored == 1
