import pytest
import sys
import os
from unittest.mock import patch, MagicMock, AsyncMock

# Adjust path to import the script correctly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scripts")))
import aion_dev

from aion.dev.dev_mode import DevAnalysis, DevPlan, CodeReviewReport, ValidationReport

@pytest.fixture
def mock_dev_mode():
    with patch("aion_dev.analyze_repository", new_callable=AsyncMock) as m_analyze, \
         patch("aion_dev.create_dev_plan", new_callable=AsyncMock) as m_plan, \
         patch("aion_dev.review_code_changes", new_callable=AsyncMock) as m_review, \
         patch("aion_dev.run_validation_commands", new_callable=AsyncMock) as m_validate, \
         patch("aion_dev.save_technical_lesson", new_callable=AsyncMock) as m_save:
         
        yield {
            "analyze": m_analyze,
            "plan": m_plan,
            "review": m_review,
            "validate": m_validate,
            "save": m_save
        }

def test_cli_analyze(mock_dev_mode, capsys):
    mock_dev_mode["analyze"].return_value = DevAnalysis(
        app_id="app1", project_path=".", project_name="test",
        stack={"language": "python", "framework": "fastapi"},
        key_files=[], architecture_summary="Test arch",
        available_scripts={}, git_status={"has_changes": False},
        risks=[], suggested_next_steps=[], created_at="now"
    )
    
    test_args = ["aion_dev.py", "analyze", "--app-id", "testapp", "--project-path", "."]
    with patch.object(sys, 'argv', test_args):
        with pytest.raises(SystemExit) as e:
            aion_dev.main()
            
        assert e.value.code == 0
        captured = capsys.readouterr()
        assert "Analyzing repository at:" in captured.out
        assert "Test arch" in captured.out
        mock_dev_mode["analyze"].assert_called_once_with("testapp", ".")

def test_cli_plan(mock_dev_mode, capsys):
    mock_dev_mode["plan"].return_value = DevPlan(
        app_id="app1", goal="test goal", project_path=".", summary="Test summary",
        steps=["Step 1"], files_to_inspect=[], files_to_modify=[],
        tests_to_run=[], risks="None", opencode_prompt="Prompt here", created_at="now"
    )
    
    test_args = ["aion_dev.py", "plan", "--goal", "test goal"]
    with patch.object(sys, 'argv', test_args):
        with pytest.raises(SystemExit) as e:
            aion_dev.main()
            
        assert e.value.code == 0
        captured = capsys.readouterr()
        assert "Creating plan for: 'test goal'" in captured.out
        assert "Test summary" in captured.out
        mock_dev_mode["plan"].assert_called_once_with("cortex", "test goal", ".")

def test_cli_review(mock_dev_mode, capsys):
    mock_dev_mode["review"].return_value = CodeReviewReport(
        app_id="app1", project_path=".", changed_files=["src/main.py"],
        risk_level="low", findings=["Looks good"], suggested_fixes=[],
        tests_recommended=[], created_at="now"
    )
    
    test_args = ["aion_dev.py", "review"]
    with patch.object(sys, 'argv', test_args):
        with pytest.raises(SystemExit) as e:
            aion_dev.main()
            
        assert e.value.code == 0
        captured = capsys.readouterr()
        assert "Code Review Report" in captured.out
        assert "Looks good" in captured.out

def test_cli_validate_safe(mock_dev_mode, capsys):
    mock_dev_mode["validate"].return_value = ValidationReport(
        project_path=".", commands_run=["npm test"], passed=True,
        failed=[], logs_summary="All tests passed", next_fix=None, created_at="now"
    )
    
    test_args = ["aion_dev.py", "validate", "--command", "npm test"]
    with patch.object(sys, 'argv', test_args):
        with pytest.raises(SystemExit) as e:
            aion_dev.main()
            
        assert e.value.code == 0
        captured = capsys.readouterr()
        assert "Validation Report" in captured.out
        assert "Passed: True" in captured.out
        mock_dev_mode["validate"].assert_called_once_with(".", ["npm test"])

def test_cli_validate_dangerous(mock_dev_mode, capsys):
    # O script usa block_dangerous_command internamente e intercepta comandos destrutivos.
    test_args = ["aion_dev.py", "validate", "--command", "rm -rf /"]
    with patch.object(sys, 'argv', test_args):
        with pytest.raises(SystemExit) as e:
            aion_dev.main()
            
        assert e.value.code == 1
        captured = capsys.readouterr()
        assert "is blocked by Safety Guard" in captured.err
        mock_dev_mode["validate"].assert_not_called()

def test_cli_save_lesson(mock_dev_mode, tmp_path, capsys):
    lesson_file = tmp_path / "lesson.md"
    lesson_file.write_text("Hello lesson")
    
    mock_dev_mode["save"].return_value = "id_123"
    
    test_args = ["aion_dev.py", "save-lesson", "--title", "Test Title", "--file", str(lesson_file)]
    with patch.object(sys, 'argv', test_args):
        with pytest.raises(SystemExit) as e:
            aion_dev.main()
            
        assert e.value.code == 0
        captured = capsys.readouterr()
        assert "Technical lesson saved successfully" in captured.out
        mock_dev_mode["save"].assert_called_once()
        args_passed = mock_dev_mode["save"].call_args[0]
        assert args_passed[1]["title"] == "Test Title"
        assert args_passed[1]["content"] == "Hello lesson"
