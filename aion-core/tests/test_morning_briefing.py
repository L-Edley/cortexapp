import os
import json
import asyncio
import datetime
import pytest
from unittest.mock import patch, AsyncMock, MagicMock, ANY

from aion.briefing.morning_briefing import (
    generate_briefing,
    get_today_briefing,
    should_generate_briefing,
    mark_briefing_shown,
    MorningBriefing,
    _cache,
)


@pytest.fixture(autouse=True)
def reset_cache():
    _cache.clear()


def _fake_llm_response_factory(data: dict):
    async def fake_llm(messages: list) -> str:
        return json.dumps(data)
    return fake_llm


class TestShouldGenerateBriefing:

    @pytest.mark.asyncio
    async def test_returns_true_when_no_briefing_today(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_should_true"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        result = await should_generate_briefing(app_id)
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_briefing_exists(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_should_false"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        fake_llm = _fake_llm_response_factory({
            "summary": "Resumo do dia.",
            "priorities": ["Prioridade 1"],
            "risks": ["Risco 1"],
            "opportunities": ["Oportunidade 1"],
            "strategic_note": "Nota estratégica.",
        })
        await generate_briefing(app_id, llm=fake_llm)
        result = await should_generate_briefing(app_id)
        assert result is False


class TestGenerateBriefing:

    @pytest.mark.asyncio
    async def test_generates_full_briefing(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_gen_full"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        fake_llm = _fake_llm_response_factory({
            "summary": "Ontem foram registradas 5 ações importantes.",
            "priorities": ["Revisar relatórios", "Atualizar dashboard", "Planejar sprint"],
            "risks": ["Tarefa atrasada", "Dados desatualizados"],
            "opportunities": ["Nova integração disponível"],
            "strategic_note": "Foco em automação reduzirá carga operacional.",
        })
        briefing = await generate_briefing(app_id, llm=fake_llm)
        assert briefing.app_id == app_id
        assert briefing.date == datetime.date.today().isoformat()
        assert "ações importantes" in briefing.summary
        assert len(briefing.priorities) == 3
        assert len(briefing.risks) == 2
        assert len(briefing.opportunities) == 1
        assert briefing.strategic_note != ""
        assert "actions_log" in briefing.sources_used
        assert briefing.generated_at != ""
        assert briefing.shown_at is None

    @pytest.mark.asyncio
    async def test_handles_unprovisioned_tenant(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_unprovisioned"
        briefing = await generate_briefing(app_id, llm=AsyncMock())
        assert briefing.summary == "Tenant ainda não possui base de conhecimento."

    @pytest.mark.asyncio
    async def test_falls_back_when_no_llm(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_no_llm"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        with patch("aion.briefing.morning_briefing.generate_briefing", wraps=generate_briefing) as sp:
            briefing = await generate_briefing(app_id, llm=None)
            assert briefing is not None

    @pytest.mark.asyncio
    async def test_uses_night_research_summary(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_nr"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        fake_llm = _fake_llm_response_factory({
            "summary": "Com base nas pesquisas da noite.",
            "priorities": ["Prioridade A"],
            "risks": [],
            "opportunities": [],
            "strategic_note": "Nota.",
        })
        with patch(
            "aion.research.night_research.get_last_report",
            new_callable=AsyncMock,
        ) as mock_nr:
            class FakeReport:
                date = datetime.date.today().isoformat()
                summary = "Pesquisa noturna identificou novas tendências."
            mock_nr.return_value = FakeReport()
            briefing = await generate_briefing(app_id, llm=fake_llm)
            assert "night_research" in briefing.sources_used

    @pytest.mark.asyncio
    async def test_parses_invalid_json_gracefully(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_bad_json"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        async def bad_llm(messages):
            return "resposta sem json algum"
        briefing = await generate_briefing(app_id, llm=bad_llm)
        assert briefing.summary != ""
        assert len(briefing.priorities) >= 1

    @pytest.mark.asyncio
    async def test_caches_briefing_in_memory(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_cache_mem"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        fake_llm = _fake_llm_response_factory({
            "summary": "Caching test.",
            "priorities": ["P1"],
            "risks": ["R1"],
            "opportunities": ["O1"],
            "strategic_note": "SN",
        })
        await generate_briefing(app_id, llm=fake_llm)
        assert app_id in _cache


class TestGetTodayBriefing:

    @pytest.mark.asyncio
    async def test_returns_none_when_no_briefing(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_get_none"
        result = await get_today_briefing(app_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_briefing_from_db(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_get_db"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        fake_llm = _fake_llm_response_factory({
            "summary": "Briefing do banco.",
            "priorities": ["P1"],
            "risks": [],
            "opportunities": [],
            "strategic_note": "Nota.",
        })
        await generate_briefing(app_id, llm=fake_llm)
        _cache.clear()
        result = await get_today_briefing(app_id)
        assert result is not None
        assert result.summary == "Briefing do banco."


class TestMarkBriefingShown:

    @pytest.mark.asyncio
    async def test_sets_shown_at(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_shown"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        fake_llm = _fake_llm_response_factory({
            "summary": "Shown test.",
            "priorities": ["P1"],
            "risks": [],
            "opportunities": [],
            "strategic_note": "SN",
        })
        await generate_briefing(app_id, llm=fake_llm)
        await mark_briefing_shown(app_id)
        briefing = await get_today_briefing(app_id)
        assert briefing.shown_at is not None

    @pytest.mark.asyncio
    async def test_updates_cache(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_shown_cache"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        fake_llm = _fake_llm_response_factory({
            "summary": "Shown cache test.",
            "priorities": ["P1"],
            "risks": [],
            "opportunities": [],
            "strategic_note": "SN",
        })
        await generate_briefing(app_id, llm=fake_llm)
        assert _cache[app_id].shown_at is None
        await mark_briefing_shown(app_id)
        assert _cache[app_id].shown_at is not None


class TestEndpoint:

    @pytest.mark.asyncio
    async def test_endpoint_returns_briefing(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AION_DB_PATH", str(tmp_path))
        app_id = "test_endpoint"
        from aion.memory.sqlite_store import provision_tenant
        await provision_tenant(app_id)
        fake_llm = _fake_llm_response_factory({
            "summary": "Endpoint briefing.",
            "priorities": ["P1"],
            "risks": ["R1"],
            "opportunities": ["O1"],
            "strategic_note": "SN",
        })
        briefing = await generate_briefing(app_id, llm=fake_llm)
        assert briefing.app_id == app_id
        assert briefing.summary == "Endpoint briefing."
        assert briefing.strategic_note == "SN"


class TestMorningBriefingModel:

    def test_default_values(self):
        b = MorningBriefing()
        assert b.app_id == ""
        assert b.date == ""
        assert b.summary == ""
        assert b.priorities == []
        assert b.risks == []
        assert b.opportunities == []
        assert b.strategic_note == ""
        assert b.sources_used == []
        assert b.generated_at == ""
        assert b.shown_at is None

    def test_full_construction(self):
        b = MorningBriefing(
            app_id="test",
            date="2025-01-01",
            summary="Sumário",
            priorities=["P1", "P2", "P3"],
            risks=["R1"],
            opportunities=["O1", "O2"],
            strategic_note="Nota",
            sources_used=["actions_log", "knowledge"],
            generated_at="2025-01-01T08:00:00",
            shown_at="2025-01-01T08:01:00",
        )
        assert b.app_id == "test"
        assert len(b.priorities) == 3
        assert b.shown_at is not None
