import pytest
import os
import json
from unittest.mock import patch, AsyncMock, MagicMock

from aion.dev.dev_mode import (
    analyze_repository,
    create_dev_plan,
    review_code_changes,
    run_validation_commands,
    save_technical_lesson,
    create_commit_summary,
    DevAnalysis,
    DevPlan,
    CodeReviewReport,
    ValidationReport
)

@pytest.fixture
def dummy_project(tmp_path):
    # Setup a basic project structure for testing
    (tmp_path / "package.json").write_text('{"name": "test"}')
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "index.js").write_text("console.log('hello');")
    return str(tmp_path)

@pytest.mark.asyncio
async def test_analyze_repository(dummy_project):
    mock_response = json.dumps({
        "architecture_summary": "Test arch",
        "risks": ["Test risk"],
        "suggested_next_steps": ["Step 1"]
    })
    
    with patch("aion.llm.factory.complete", new_callable=AsyncMock) as mock_complete:
        mock_complete.return_value = mock_response
        
        analysis = await analyze_repository("app1", dummy_project)
        
        assert isinstance(analysis, DevAnalysis)
        assert analysis.architecture_summary == "Test arch"
        assert "Test risk" in analysis.risks
        assert "Step 1" in analysis.suggested_next_steps
        assert analysis.stack["language"] == "javascript/typescript"

@pytest.mark.asyncio
async def test_analyze_repository_llm_failure(dummy_project):
    with patch("aion.llm.factory.complete", new_callable=AsyncMock) as mock_complete:
        mock_complete.side_effect = Exception("LLM Error")
        
        # O fallback deve funcionar e não quebrar a aplicação
        analysis = await analyze_repository("app1", dummy_project)
        
        assert isinstance(analysis, DevAnalysis)
        # Deve usar valores default do fallback
        assert "Análise arquitetural padrão" in analysis.architecture_summary

@pytest.mark.asyncio
async def test_create_dev_plan(dummy_project):
    mock_response = json.dumps({
        "summary": "Plan summary",
        "steps": ["Step 1"],
        "files_to_inspect": ["package.json"],
        "files_to_modify": ["src/index.js"],
        "tests_to_run": ["npm test"],
        "risks": "Low risk"
    })
    
    with patch("aion.llm.factory.complete", new_callable=AsyncMock) as mock_complete:
        mock_complete.return_value = mock_response
        
        plan = await create_dev_plan("app1", "add feature", dummy_project)
        
        assert isinstance(plan, DevPlan)
        assert plan.summary == "Plan summary"
        assert "Step 1" in plan.steps
        assert "package.json" in plan.files_to_inspect
        assert plan.opencode_prompt != ""
        assert "add feature" in plan.opencode_prompt

@pytest.mark.asyncio
async def test_review_code_changes(dummy_project):
    mock_response = json.dumps({
        "risk_level": "medium",
        "findings": ["Bug in index.js"],
        "suggested_fixes": ["Fix syntax"],
        "tests_recommended": ["npm test"]
    })
    
    mock_git_status = {
        "modified": ["src/index.js"],
        "untracked": []
    }
    
    with patch("aion.llm.factory.complete", new_callable=AsyncMock) as mock_complete, \
         patch("aion.dev.dev_mode.detect_git_status", new_callable=AsyncMock) as mock_status, \
         patch("aion.dev.dev_mode._run_git_diff", new_callable=AsyncMock) as mock_diff:
         
        mock_complete.return_value = mock_response
        mock_status.return_value = mock_git_status
        mock_diff.return_value = "+ console.log('bug');"
        
        report = await review_code_changes("app1", dummy_project)
        
        assert isinstance(report, CodeReviewReport)
        assert report.risk_level == "medium"
        assert "Bug in index.js" in report.findings
        assert "src/index.js" in report.changed_files

@pytest.mark.asyncio
async def test_run_validation_commands(dummy_project):
    # Testar se bloqueia comandos perigosos e tenta rodar comandos seguros
    
    # Vamos mockar o asyncio.create_subprocess_shell para comandos permitidos
    mock_proc = AsyncMock()
    mock_proc.communicate.return_value = (b"ok", b"")
    mock_proc.returncode = 0
    
    with patch("asyncio.create_subprocess_shell", return_value=mock_proc):
        report = await run_validation_commands(dummy_project, [
            "npm run build",     # Seguro
            "rm -rf /",          # Perigoso -> Bloqueado
            "git reset --hard"   # Perigoso -> Bloqueado
        ])
        
        assert isinstance(report, ValidationReport)
        assert "npm run build" in report.commands_run
        assert "rm -rf /" in report.commands_run  # Fica na lista de commands_run
        assert "rm -rf /" in report.failed       # Mas falha (bloqueado)
        assert "git reset --hard" in report.failed
        assert "BLOCKED by Safety Guard" in report.logs_summary
        
        # Since dangerous commands failed, passed is False
        assert report.passed is False

@pytest.mark.asyncio
async def test_save_technical_lesson():
    lesson = {
        "title": "Cors Fix",
        "summary": "How to fix cors",
        "content": "Add middleware",
        "tags": ["cors"]
    }
    
    with patch("aion.memory.sqlite_store.save_knowledge", new_callable=AsyncMock) as mock_save_knowledge, \
         patch("aion.memory.embeddings.embed", return_value=[0.1, 0.2]), \
         patch("aion.memory.vector_store.add_knowledge", new_callable=AsyncMock) as mock_add_knowledge, \
         patch("aion.obsidian.writer.write_dev_lesson", new_callable=AsyncMock) as mock_write_dev_lesson, \
         patch("aion.sync.sync_queue.enqueue_sync", new_callable=AsyncMock) as mock_enqueue_sync:
         
        mock_save_knowledge.return_value = "know_123"
        
        knowledge_id = await save_technical_lesson("app1", lesson)
        
        assert knowledge_id == "know_123"
        mock_save_knowledge.assert_called_once()
        mock_add_knowledge.assert_called_once()
        mock_write_dev_lesson.assert_called_once()
        mock_enqueue_sync.assert_called_once()
        
        # Verify sync queue arguments
        call_args = mock_enqueue_sync.call_args[1]
        assert call_args["record_type"] == "dev_lesson"
        assert call_args["app_id"] == "app1"
        assert "cors" in call_args["payload"]["tags"]
