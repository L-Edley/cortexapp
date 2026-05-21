import os
import json
import asyncio
from typing import List, Dict, Any

async def read_project_structure(project_path: str, max_depth: int = 3) -> dict:
    """
    Varre a estrutura de pastas do projeto recursivamente até max_depth.
    Ignora pastas de build, dependências ou pastas sensíveis.
    """
    from aion.dev.safety_guard import is_sensitive_path
    
    abs_project_path = os.path.abspath(project_path)
    
    exclude_dirs = {
        "node_modules", ".next", ".venv", "dist", "build", "data", "obsidian", ".git",
        "__pycache__", ".pytest_cache", "env", ".expo", ".serverless", ".venv"
    }
    
    def _walk(current_path: str, depth: int) -> dict:
        if depth > max_depth:
            return {"_truncated": True}
            
        structure = {}
        try:
            for entry in os.scandir(current_path):
                name = entry.name
                if name in exclude_dirs:
                    continue
                if is_sensitive_path(entry.path):
                    continue
                    
                if entry.is_dir():
                    structure[name] = _walk(entry.path, depth + 1)
                else:
                    structure[name] = "file"
        except Exception:
            pass
        return structure
        
    return _walk(abs_project_path, 1)

async def detect_stack(project_path: str) -> dict:
    """
    Analisa os arquivos do projeto para identificar a stack tecnológica predominante.
    """
    abs_path = os.path.abspath(project_path)
    stack = {
        "language": "unknown",
        "framework": "unknown",
        "build_tool": "unknown",
        "detected": []
    }
    
    # 1. Identificar via arquivos existentes
    files = []
    try:
        files = os.listdir(abs_path)
    except Exception:
        return stack
        
    if "package.json" in files:
        stack["language"] = "javascript/typescript"
        stack["build_tool"] = "npm"
        stack["detected"].append("nodejs")
        
        # Verificar frameworks
        package_json_path = os.path.join(abs_path, "package.json")
        try:
            with open(package_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
                if "next" in deps:
                    stack["framework"] = "next.js"
                    stack["detected"].append("nextjs")
                elif "react" in deps:
                    stack["framework"] = "react"
                    stack["detected"].append("react")
                elif "vue" in deps:
                    stack["framework"] = "vue"
                    stack["detected"].append("vue")
                elif "express" in deps:
                    stack["framework"] = "express"
                    stack["detected"].append("express")
        except Exception:
            pass
            
    if "requirements.txt" in files or "pyproject.toml" in files or "poetry.lock" in files:
        stack["language"] = "python"
        stack["build_tool"] = "pip" if "requirements.txt" in files else "poetry"
        stack["detected"].append("python")
        
        # Buscar FastAPI, Django ou Flask
        requirements_path = os.path.join(abs_path, "requirements.txt")
        if os.path.exists(requirements_path):
            try:
                with open(requirements_path, "r", encoding="utf-8") as f:
                    req_content = f.read().lower()
                    if "fastapi" in req_content:
                        stack["framework"] = "fastapi"
                        stack["detected"].append("fastapi")
                    elif "django" in req_content:
                        stack["framework"] = "django"
                        stack["detected"].append("django")
                    elif "flask" in req_content:
                        stack["framework"] = "flask"
                        stack["detected"].append("flask")
            except Exception:
                pass
                
    if "go.mod" in files:
        stack["language"] = "go"
        stack["build_tool"] = "go modules"
        stack["detected"].append("go")
        
    if "Cargo.toml" in files:
        stack["language"] = "rust"
        stack["build_tool"] = "cargo"
        stack["detected"].append("rust")
        
    return stack

async def find_key_files(project_path: str) -> list[str]:
    """
    Retorna uma lista de caminhos de arquivos essenciais e de configuração do projeto.
    """
    from aion.dev.safety_guard import is_sensitive_path
    
    abs_path = os.path.abspath(project_path)
    key_files = []
    
    candidates = [
        "package.json", "requirements.txt", "pyproject.toml", "poetry.lock",
        "go.mod", "Cargo.toml", "tsconfig.json", "next.config.js", "next.config.mjs",
        "main.py", "app.py", "run_core.py", "index.js", "index.html", "src/main.py",
        "src/app.py", "src/aion/main.py"
    ]
    
    for cand in candidates:
        full_p = os.path.join(abs_path, cand)
        if os.path.exists(full_p) and os.path.isfile(full_p):
            # Nunca retornar caminhos sensíveis
            if not is_sensitive_path(full_p):
                # Retornar caminho relativo amigável
                key_files.append(cand)
                
    return key_files

async def read_package_scripts(project_path: str) -> dict:
    """
    Lê os scripts configurados no package.json (se for projeto Node.js).
    """
    abs_path = os.path.abspath(project_path)
    pkg_path = os.path.join(abs_path, "package.json")
    if not os.path.exists(pkg_path):
        return {}
        
    try:
        with open(pkg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("scripts", {})
    except Exception:
        return {}

async def detect_git_status(project_path: str) -> dict:
    """
    Retorna o branch atual e as modificações rastreadas e não rastreadas.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "status", "--porcelain",
            cwd=project_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        
        proc_branch = await asyncio.create_subprocess_exec(
            "git", "rev-parse", "--abbrev-ref", "HEAD",
            cwd=project_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout_br, _ = await proc_branch.communicate()
        
        branch_name = stdout_br.decode().strip() or "unknown"
        changes = stdout.decode().strip()
        
        modified_files = []
        untracked_files = []
        
        if changes:
            for line in changes.split("\n"):
                if not line.strip():
                    continue
                status_part = line[:2]
                file_part = line[2:].strip()
                if "??" in status_part:
                    untracked_files.append(file_part)
                else:
                    modified_files.append(file_part)
                    
        return {
            "branch": branch_name,
            "has_changes": len(modified_files) > 0 or len(untracked_files) > 0,
            "modified": modified_files,
            "untracked": untracked_files,
            "raw": changes
        }
    except Exception as e:
        return {
            "branch": "unknown",
            "has_changes": False,
            "modified": [],
            "untracked": [],
            "error": str(e)
        }
