import pytest
import os
import json
from unittest.mock import patch, AsyncMock
from aion.dev.project_reader import (
    read_project_structure,
    detect_stack,
    find_key_files,
    read_package_scripts,
    detect_git_status
)

@pytest.mark.asyncio
async def test_read_project_structure(tmp_path):
    # Setup folders
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "index.js").write_text("console.log('hello');")
    
    # Folders that should be ignored
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "some_pkg").mkdir()
    (tmp_path / ".next").mkdir()
    (tmp_path / ".venv").mkdir()
    
    # Sensitive files that should be ignored
    (tmp_path / ".env").write_text("SECRET=123")
    (tmp_path / "db.sqlite").write_text("sqlite")
    
    structure = await read_project_structure(str(tmp_path))
    
    # node_modules, .next, .venv, .env, db.sqlite must NOT be in the structure
    assert "node_modules" not in structure
    assert ".next" not in structure
    assert ".venv" not in structure
    assert ".env" not in structure
    assert "db.sqlite" not in structure
    
    # src should be in the structure
    assert "src" in structure
    assert structure["src"] == {"index.js": "file"}

@pytest.mark.asyncio
async def test_detect_stack_nextjs(tmp_path):
    package_json = {
        "dependencies": {
            "next": "^14.0.0",
            "react": "^18.2.0"
        }
    }
    (tmp_path / "package.json").write_text(json.dumps(package_json))
    
    stack = await detect_stack(str(tmp_path))
    assert stack["language"] == "javascript/typescript"
    assert stack["build_tool"] == "npm"
    assert "nodejs" in stack["detected"]
    assert "nextjs" in stack["detected"]
    assert stack["framework"] == "next.js"

@pytest.mark.asyncio
async def test_detect_stack_python_fastapi(tmp_path):
    (tmp_path / "requirements.txt").write_text("fastapi==0.110.0\nuvicorn\n")
    
    stack = await detect_stack(str(tmp_path))
    assert stack["language"] == "python"
    assert stack["build_tool"] == "pip"
    assert "python" in stack["detected"]
    assert "fastapi" in stack["detected"]
    assert stack["framework"] == "fastapi"

@pytest.mark.asyncio
async def test_find_files(tmp_path):
    # Setup some key files
    (tmp_path / "package.json").write_text("{}")
    (tmp_path / "requirements.txt").write_text("")
    (tmp_path / ".env").write_text("SECRET=123")  # Sensitive, must be ignored
    
    key_files = await find_key_files(str(tmp_path))
    assert "package.json" in key_files
    assert "requirements.txt" in key_files
    assert ".env" not in key_files

@pytest.mark.asyncio
async def test_read_package_scripts(tmp_path):
    package_json = {
        "scripts": {
            "build": "next build",
            "start": "next start"
        }
    }
    (tmp_path / "package.json").write_text(json.dumps(package_json))
    
    scripts = await read_package_scripts(str(tmp_path))
    assert scripts == {"build": "next build", "start": "next start"}

@pytest.mark.asyncio
async def test_detect_git_status(tmp_path):
    # Mocking subprocess behavior for git status and git rev-parse
    mock_status_proc = AsyncMock()
    mock_status_proc.communicate.return_value = (b" M src/main.py\n?? untracked.txt\n", b"")
    
    mock_branch_proc = AsyncMock()
    mock_branch_proc.communicate.return_value = (b"main\n", b"")
    
    async def mock_create_subprocess_exec(*args, **kwargs):
        if "status" in args:
            return mock_status_proc
        elif "rev-parse" in args:
            return mock_branch_proc
        return AsyncMock()
        
    with patch("asyncio.create_subprocess_exec", side_effect=mock_create_subprocess_exec):
        status = await detect_git_status(str(tmp_path))
        assert status["branch"] == "main"
        assert status["has_changes"] is True
        assert "src/main.py" in status["modified"]
        assert "untracked.txt" in status["untracked"]
