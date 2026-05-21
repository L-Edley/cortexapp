import pytest
import sys
from unittest.mock import patch, AsyncMock
from scripts.aion_teach import main

def test_cli_help(capsys):
    with patch("sys.argv", ["scripts/aion_teach.py", "--help"]):
        with pytest.raises(SystemExit):
            main()
        captured = capsys.readouterr()
        assert "CLI" in captured.out or "help" in captured.out

def test_cli_ask_no_save():
    with patch("scripts.aion_teach.run_ask", new_callable=AsyncMock) as mock_run_ask:
        with patch("sys.argv", ["scripts/aion_teach.py", "ask", "--teacher", "ollama", "--topic", "pgvector"]):
            main()
            mock_run_ask.assert_called_once()
            args = mock_run_ask.call_args[0][0]
            assert args.teacher == "ollama"
            assert args.topic == "pgvector"
            assert args.save is False

def test_cli_ask_with_save():
    with patch("scripts.aion_teach.run_ask", new_callable=AsyncMock) as mock_run_ask:
        with patch("sys.argv", ["scripts/aion_teach.py", "ask", "--teacher", "ollama", "--topic", "pgvector", "--app-id", "cortex", "--save", "--tags", "a", "b"]):
            main()
            mock_run_ask.assert_called_once()
            args = mock_run_ask.call_args[0][0]
            assert args.teacher == "ollama"
            assert args.topic == "pgvector"
            assert args.app_id == "cortex"
            assert args.save is True
            assert args.tags == ["a", "b"]

def test_cli_import_md():
    with patch("scripts.aion_teach.run_import", new_callable=AsyncMock) as mock_run_import:
        with patch("sys.argv", ["scripts/aion_teach.py", "import", "--app-id", "cortex", "--file", "./docs/lesson.md", "--save"]):
            main()
            mock_run_import.assert_called_once()
            args = mock_run_import.call_args[0][0]
            assert args.app_id == "cortex"
            assert args.file == "./docs/lesson.md"
            assert args.save is True
