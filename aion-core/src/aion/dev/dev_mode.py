import os
import json
import logging
import datetime
import uuid
import asyncio
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from aion.dev.safety_guard import (
    validate_project_path,
    is_sensitive_path,
    check_for_secrets,
    block_dangerous_command
)
from aion.dev.project_reader import (
    read_project_structure,
    detect_stack,
    find_key_files,
    read_package_scripts,
    detect_git_status
)
from aion.dev.opencode_task import build_opencode_prompt

logger = logging.getLogger("aion.dev.dev_mode")

# ---------------------------------------------------------------------------
# Modelos Pydantic
# ---------------------------------------------------------------------------

class DevAnalysis(BaseModel):
    app_id: str
    project_path: str
    project_name: str
    stack: Dict[str, Any]
    key_files: List[str]
    architecture_summary: str
    available_scripts: Dict[str, Any]
    git_status: Dict[str, Any]
    risks: List[str]
    suggested_next_steps: List[str]
    created_at: str

class DevPlan(BaseModel):
    app_id: str
    goal: str
    project_path: str
    summary: str
    steps: List[str]
    files_to_inspect: List[str]
    files_to_modify: List[str]
    tests_to_run: List[str]
    risks: str
    opencode_prompt: str
    created_at: str

class CodeReviewReport(BaseModel):
    app_id: str
    project_path: str
    changed_files: List[str]
    risk_level: str
    findings: List[str]
    suggested_fixes: List[str]
    tests_recommended: List[str]
    created_at: str

class ValidationReport(BaseModel):
    project_path: str
    commands_run: List[str]
    passed: bool
    failed: List[str]
    logs_summary: str
    next_fix: Optional[str] = None
    created_at: str

class TechnicalLesson(BaseModel):
    app_id: str
    title: str
    summary: str
    content: str
    tags: List[str] = Field(default_factory=list)
    confidence: float
    source: str = "dev_mode"
    created_at: str

# ---------------------------------------------------------------------------
# Funcoes Auxiliares de Git e Execucao
# ---------------------------------------------------------------------------

async def _run_git_diff(project_path: str) -> str:
    """Executa 'git diff HEAD' com segurança para obter as modificações."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "diff", "HEAD",
            cwd=project_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        return stdout.decode().strip()
    except Exception:
        return ""

# ---------------------------------------------------------------------------
# Orquestrador do Developer Mode
# ---------------------------------------------------------------------------

async def analyze_repository(app_id: str, project_path: str) -> DevAnalysis:
    """
    Analisa o repositório, identifica a stack, verifica a integridade do git
    e usa IA para estruturar um resumo de arquitetura, riscos e próximos passos.
    """
    if not validate_project_path(project_path):
        raise ValueError(f"Invalid or unsafe project path: {project_path}")
        
    abs_path = os.path.abspath(project_path)
    proj_name = os.path.basename(abs_path) or "unnamed_project"
    
    stack = await detect_stack(abs_path)
    key_files = await find_key_files(abs_path)
    scripts = await read_package_scripts(abs_path)
    git_status = await detect_git_status(abs_path)
    
    # Prompt IA para Resumo Arquitetural
    review_prompt = (
        "Você é o AION Core, o arquiteto técnico central.\n"
        f"Analise o projeto '{proj_name}' no diretório '{project_path}'.\n"
        f"Stack tecnológica: {stack}\n"
        f"Arquivos chave: {key_files}\n"
        f"Scripts configurados: {scripts}\n"
        f"Git Status: {git_status}\n\n"
        "Gere uma análise técnica resumida em formato JSON contendo o seguinte esquema exato:\n"
        "{\n"
        '  "architecture_summary": "Resumo detalhado da arquitetura e estrutura...",\n'
        '  "risks": ["lista de riscos técnicos ou gargalos..."],\n'
        '  "suggested_next_steps": ["passos práticos a seguir..."]\n'
        "}\n"
        "Retorne APENAS o JSON estruturado acima. Não inclua blocos ```json ou explicações externas."
    )
    
    arch_summary = "Análise arquitetural padrão baseada na estrutura física do projeto."
    risks = []
    next_steps = ["Revisar estrutura básica do projeto."]
    
    try:
        from aion.llm.factory import complete
        resp = await complete([{"role": "user", "content": review_prompt}])
        clean_text = resp.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()
        
        data = json.loads(clean_text)
        arch_summary = data.get("architecture_summary", arch_summary)
        risks = data.get("risks", risks)
        next_steps = data.get("suggested_next_steps", next_steps)
    except Exception as e:
        logger.warning("IA analysis failed, using fallback values: %s", e)
        # fallback inteligente baseado na stack
        if stack["language"] == "python":
            arch_summary = "Projeto baseado em Python com FastAPi/Pip."
            risks = ["Dependências locais não testadas."]
            next_steps = ["Configurar e rodar testes com pytest."]
            
    return DevAnalysis(
        app_id=app_id,
        project_path=abs_path,
        project_name=proj_name,
        stack=stack,
        key_files=key_files,
        architecture_summary=arch_summary,
        available_scripts=scripts,
        git_status=git_status,
        risks=risks,
        suggested_next_steps=next_steps,
        created_at=datetime.datetime.utcnow().isoformat()
    )

async def create_dev_plan(app_id: str, goal: str, project_path: str) -> DevPlan:
    """
    Cria um plano de desenvolvimento estruturado (arquivos a mexer, ler, testar)
    e compila um prompt rico em regras de segurança para o OpenCode seguir.
    """
    if not validate_project_path(project_path):
        raise ValueError(f"Invalid or unsafe project path: {project_path}")
        
    abs_path = os.path.abspath(project_path)
    stack = await detect_stack(abs_path)
    key_files = await find_key_files(abs_path)
    
    plan_prompt = (
        "Você é o AION Core, arquiteto de desenvolvimento técnico.\n"
        f"Elabore um plano técnico para atingir o objetivo: '{goal}'\n"
        f"Stack tecnológica: {stack}\n"
        f"Arquivos importantes: {key_files}\n\n"
        "Gere a resposta no formato JSON a seguir:\n"
        "{\n"
        '  "summary": "Breve sumário conceitual do plano...",\n'
        '  "steps": ["Passo 1...", "Passo 2..."],\n'
        '  "files_to_inspect": ["caminhos de arquivos para ler..."],\n'
        '  "files_to_modify": ["caminhos de arquivos que podem ser alterados..."],\n'
        '  "tests_to_run": ["comandos de teste sugeridos..."],\n'
        '  "risks": "riscos associados a esta alteração..."\n'
        "}\n"
        "Retorne APENAS o JSON limpo, sem marcações markdown."
    )
    
    p_summary = "Plano técnico para atingir o objetivo do usuário."
    p_steps = ["Inspecionar código existente.", "Codificar novos componentes.", "Executar suíte de validação."]
    p_inspect = key_files[:3] if key_files else []
    p_modify = []
    p_tests = ["pytest" if stack["language"] == "python" else "npm test"]
    p_risks = "Risco padrão de regressão em alterações de código."
    
    try:
        from aion.llm.factory import complete
        resp = await complete([{"role": "user", "content": plan_prompt}])
        clean_text = resp.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()
        
        data = json.loads(clean_text)
        p_summary = data.get("summary", p_summary)
        p_steps = data.get("steps", p_steps)
        p_inspect = data.get("files_to_inspect", p_inspect)
        p_modify = data.get("files_to_modify", p_modify)
        p_tests = data.get("tests_to_run", p_tests)
        p_risks = data.get("risks", p_risks)
    except Exception as e:
        logger.warning("IA plan generation failed, using defaults: %s", e)
        
    # Instanciar o plano temporário
    plan = DevPlan(
        app_id=app_id,
        goal=goal,
        project_path=abs_path,
        summary=p_summary,
        steps=p_steps,
        files_to_inspect=p_inspect,
        files_to_modify=p_modify,
        tests_to_run=p_tests,
        risks=p_risks,
        opencode_prompt="",
        created_at=datetime.datetime.utcnow().isoformat()
    )
    
    # Gerar o prompt específico para o OpenCode
    plan.opencode_prompt = build_opencode_prompt(plan)
    return plan

async def generate_opencode_task(plan: DevPlan) -> str:
    """Invoca o gerador de prompt para compilar a tarefa para o OpenCode."""
    return build_opencode_prompt(plan)

async def review_code_changes(app_id: str, project_path: str) -> CodeReviewReport:
    """
    Varre os arquivos modificados e o git diff do repositório,
    identificando falhas, riscos de segurança e bugs sugerindo correções.
    """
    if not validate_project_path(project_path):
        raise ValueError(f"Invalid or unsafe project path: {project_path}")
        
    abs_path = os.path.abspath(project_path)
    git_status = await detect_git_status(abs_path)
    changed_files = git_status.get("modified", []) + git_status.get("untracked", [])
    
    diff_text = await _run_git_diff(abs_path)
    
    review_prompt = (
        "Você é o AION Core, arquiteto sênior especialista em code review.\n"
        f"Revise as alterações do git no projeto: '{project_path}'\n"
        f"Arquivos alterados: {changed_files}\n"
        f"Diff técnico:\n{diff_text or 'Sem alterações comitadas para revisão.'}\n\n"
        "Analise possíveis bugs, brechas de segurança (secrets expostos, etc.) e refatorações.\n"
        "Retorne a resposta EXATAMENTE no formato JSON:\n"
        "{\n"
        '  "risk_level": "low/medium/high",\n'
        '  "findings": ["problema encontrado 1", "problema encontrado 2"],\n'
        '  "suggested_fixes": ["correção recomendada 1", "correção recomendada 2"],\n'
        '  "tests_recommended": ["comando de teste 1", "comando de teste 2"]\n'
        "}\n"
        "Retorne apenas o JSON limpo, sem marcações de markdown ou explicações."
    )
    
    risk_level = "low"
    findings = ["Nenhuma alteração pendente detectada."] if not changed_files else []
    fixes = []
    tests_recommended = ["pytest"]
    
    try:
        from aion.llm.factory import complete
        resp = await complete([{"role": "user", "content": review_prompt}])
        clean_text = resp.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()
        
        data = json.loads(clean_text)
        risk_level = data.get("risk_level", risk_level)
        findings = data.get("findings", findings)
        fixes = data.get("suggested_fixes", fixes)
        tests_recommended = data.get("tests_recommended", tests_recommended)
    except Exception as e:
        logger.warning("IA Code Review failed, returning standard report: %s", e)
        
    return CodeReviewReport(
        app_id=app_id,
        project_path=abs_path,
        changed_files=changed_files,
        risk_level=risk_level,
        findings=findings,
        suggested_fixes=fixes,
        tests_recommended=tests_recommended,
        created_at=datetime.datetime.utcnow().isoformat()
    )

async def run_validation_commands(project_path: str, commands: List[str]) -> ValidationReport:
    """
    Executa comandos de teste e build pré-autorizados.
    Bloqueia ativamente qualquer comando classificado como inseguro.
    """
    if not validate_project_path(project_path):
        raise ValueError(f"Invalid or unsafe project path: {project_path}")
        
    abs_path = os.path.abspath(project_path)
    commands_run = []
    failed = []
    logs = []
    
    is_passed = True
    next_fix_advice = None
    
    for cmd in commands:
        cmd_strip = cmd.strip()
        if not cmd_strip:
            continue
            
        if block_dangerous_command(cmd_strip):
            is_passed = False
            failed.append(cmd_strip)
            commands_run.append(cmd_strip)
            logs.append(f"Command '{cmd_strip}' BLOCKED by Safety Guard.")
            continue
            
        # Executar comando de forma segura
        commands_run.append(cmd_strip)
        try:
            # Dividir comando de forma segura ou rodar no shell
            proc = await asyncio.create_subprocess_shell(
                cmd_strip,
                cwd=abs_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Timeout de no máximo 30s
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
            
            stdout_text = stdout.decode().strip()
            stderr_text = stderr.decode().strip()
            
            logs.append(f"--- Command: {cmd_strip} ---\nSTDOUT:\n{stdout_text}\nSTDERR:\n{stderr_text}")
            
            if proc.returncode != 0:
                is_passed = False
                failed.append(cmd_strip)
        except asyncio.TimeoutError:
            is_passed = False
            failed.append(cmd_strip)
            logs.append(f"Command '{cmd_strip}' TIMED OUT after 30s.")
        except Exception as e:
            is_passed = False
            failed.append(cmd_strip)
            logs.append(f"Execution error on command '{cmd_strip}': {str(e)}")
            
    if not is_passed:
        #IA para sugerir fix
        fix_prompt = (
            "Você é o AION Core, assistente sênior de suporte a desenvolvimento.\n"
            f"O comando a seguir falhou com os seguintes logs:\n"
            f"Falhas: {failed}\n"
            f"Logs:\n{chr(10).join(logs)[:2000]}\n\n"
            "Sugerir uma instrução concisa e direta para corrigir a falha.\n"
            "Retorne apenas o conselho final em um parágrafo amigável."
        )
        try:
            from aion.llm.factory import complete
            next_fix_advice = await complete([{"role": "user", "content": fix_prompt}])
            next_fix_advice = next_fix_advice.strip()
        except Exception:
            next_fix_advice = "Verificar os logs de erro acima e ajustar arquivos de configuração."
            
    return ValidationReport(
        project_path=abs_path,
        commands_run=commands_run,
        passed=is_passed,
        failed=failed,
        logs_summary="\n\n".join(logs),
        next_fix=next_fix_advice,
        created_at=datetime.datetime.utcnow().isoformat()
    )

async def save_technical_lesson(app_id: str, lesson: Dict[str, Any]) -> Optional[str]:
    """
    Fluxo de cérebro AION completo para persistência de lições de código:
    1. Valida integridade básica.
    2. Sanitiza vazamento de segredos.
    3. Persiste local SQLite ('knowledge').
    4. Indexa em ChromaDB Vector Store com tags apropriadas.
    5. Grava arquivo no Obsidian Vault ('dev_lesson').
    6. Enfileira sincronização Supabase com record_type='dev_lesson'.
    """
    from aion.memory import sqlite_store, vector_store, embeddings
    from aion.obsidian import writer
    from aion.sync.sync_queue import enqueue_sync
    
    title = lesson.get("title", "").strip()
    content = lesson.get("content", "").strip()
    summary = lesson.get("summary", "").strip()
    tags = lesson.get("tags", [])
    confidence = float(lesson.get("confidence", 0.90))
    
    if not title or not content:
        logger.warning("Empty technical lesson title or content. Skipping save.")
        return None
        
    full_text = f"{title}\n{summary}\n{content}"
    if check_for_secrets(full_text):
        logger.warning("Sensitive data detected in technical lesson. Persistent save blocked.")
        return None
        
    combined_tags = list(set(["dev", "technical"] + tags))
    
    # 3. SQLite
    knowledge_content = (
        f"Lição Técnica: {title}\n"
        f"Resumo: {summary}\n"
        f"Detalhes Técnicos:\n{content}"
    )
    
    knowledge_id = await sqlite_store.save_knowledge(
        app_id=app_id,
        content=knowledge_content,
        tags=combined_tags,
        confidence=confidence
    )
    
    # 4. ChromaDB
    try:
        emb = embeddings.embed(knowledge_content)
        if emb:
            await vector_store.add_knowledge(
                app_id=app_id,
                knowledge_id=knowledge_id,
                content=knowledge_content,
                embedding=emb,
                metadata={
                    "title": title,
                    "type": "dev_lesson"
                }
            )
    except Exception as e:
        logger.error("Failed to generate embedding for dev lesson: %s", e)
        
    # 5. Obsidian Vault
    try:
        lesson_obj = TechnicalLesson(
            app_id=app_id,
            title=title,
            summary=summary,
            content=content,
            tags=combined_tags,
            confidence=confidence,
            source="dev_mode",
            created_at=datetime.datetime.utcnow().isoformat()
        )
        await writer.write_dev_lesson(app_id, lesson_obj)
    except Exception as e:
        logger.error("Failed to save dev lesson to Obsidian: %s", e)
        
    # 6. Sync Queue
    try:
        payload = {
            "title": title,
            "summary": summary,
            "content": content,
            "tags": combined_tags,
            "confidence": confidence,
            "source": "dev_mode",
            "created_at": datetime.datetime.utcnow().isoformat()
        }
        await enqueue_sync(
            app_id=app_id,
            record_type="dev_lesson",
            record_id=knowledge_id,
            payload=payload
        )
    except Exception as e:
        logger.error("Failed to enqueue dev lesson in sync queue: %s", e)
        
    return knowledge_id

async def create_commit_summary(project_path: str) -> str:
    """
    Roda 'git diff HEAD' e gera uma mensagem de commit de git concisa e limpa
    respeitando o padrão de Conventional Commits.
    """
    if not validate_project_path(project_path):
        raise ValueError(f"Invalid or unsafe project path: {project_path}")
        
    abs_path = os.path.abspath(project_path)
    diff = await _run_git_diff(abs_path)
    if not diff:
        return "docs: update development progress files"
        
    prompt = (
        "Escreva uma mensagem de commit Git concisa e profissional baseada no seguinte diff:\n\n"
        f"{diff[:3000]}\n\n"
        "Use a convenção do Conventional Commits (ex: feat: add security guard endpoints). "
        "Retorne APENAS a mensagem de commit final (uma única linha), sem aspas adicionais, sem explicações externas."
    )
    
    try:
        from aion.llm.factory import complete
        res = await complete([{"role": "user", "content": prompt}])
        return res.strip().replace('"', '').replace("'", "")
    except Exception:
        return "feat: develop technical modifications via Dev Mode"
