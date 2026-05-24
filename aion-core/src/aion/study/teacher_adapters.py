import os
import re
import uuid
import logging
import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.study.teacher_adapters")

# ---------------------------------------------------------------------------
# Modelos Pydantic
# ---------------------------------------------------------------------------

class TeacherAnswer(BaseModel):
    id: str
    provider: str
    question: str
    answer: str
    summary: str
    confidence: float
    sources: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    should_save: bool = True
    created_at: str
    warnings: List[str] = Field(default_factory=list)

class TeacherLessonImport(BaseModel):
    app_id: str
    file_path: str
    title: str
    content: str
    source: str = "opencode"
    detected_topics: List[str] = Field(default_factory=list)
    summary: str
    confidence: float

# ---------------------------------------------------------------------------
# Seguranca e Path Validation
# ---------------------------------------------------------------------------

def _is_safe_path(file_path: str) -> bool:
    """
    Valida se o caminho de arquivo é seguro para evitar Path Traversal e vazamento de segredos.
    Permite apenas caminhos contidos na árvore do diretório atual.
    """
    try:
        abs_path = os.path.abspath(file_path)
        cwd = os.path.abspath(os.getcwd())
        
        # O caminho precisa estar dentro do CWD (não pode sair com ..)
        if not abs_path.startswith(cwd + os.sep) and abs_path != cwd:
            return False
            
        # Bloquear arquivos confidenciais explícitos
        filename = os.path.basename(abs_path).lower()
        if filename.startswith(".") or filename == "env" or ".env" in filename:
            return False
            
        if filename.endswith((".sqlite", ".db", ".config", ".json_key", "credentials")):
            return False
            
        # Bloquear componentes ".." ou "." que tentam contornar restrições
        parts = abs_path.split(os.sep)
        for p in parts:
            if p in ("..", "."):
                return False
                
        return True
    except Exception:
        return False

# ---------------------------------------------------------------------------
# Funcoes de Acesso aos Professores
# ---------------------------------------------------------------------------

async def ask_ollama(
    question: str,
    context: Optional[Dict[str, Any]] = None,
) -> TeacherAnswer:
    """
    Efetua requisição direta ao Ollama local para obter respostas.
    Se estiver offline ou falhar, retorna com gracefully degradation.
    """
    import httpx
    from aion.config import settings
    
    ans_id = f"teacher_ollama_{uuid.uuid4()}"
    now_str = datetime.datetime.utcnow().isoformat()
    
    url = f"{settings.OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "messages": [
            {
                "role": "system", 
                "content": "Você é o Professor Ollama. Explique o tópico de forma didática, técnica e detalhada para o cérebro central AION."
            },
            {
                "role": "user", 
                "content": f"Contexto: {context or {}}\n\nPergunta: {question}"
            }
        ],
        "stream": False
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload)
            if r.status_code != 200:
                raise RuntimeError(f"Ollama returned status {r.status_code}")
            
            data = r.json()
            answer_content = data["message"]["content"]
            
            # Extrai primeiro parágrafo como resumo
            lines = [l.strip() for l in answer_content.split("\n") if l.strip()]
            summary = lines[0] if lines else "Sem resumo disponível."
            if len(summary) > 200:
                summary = summary[:200] + "..."
                
            return TeacherAnswer(
                id=ans_id,
                provider="ollama",
                question=question,
                answer=answer_content,
                summary=summary,
                confidence=0.85,
                sources=["ollama_local"],
                tags=["ollama", "local"],
                should_save=True,
                created_at=now_str,
                warnings=[]
            )
    except Exception as e:
        logger.warning("Ollama connection failed or timed out: %s", e)
        return TeacherAnswer(
            id=ans_id,
            provider="ollama",
            question=question,
            answer="Professor Ollama local indisponível no momento.",
            summary="Erro de conexão com o Ollama local.",
            confidence=0.0,
            sources=[],
            tags=["ollama", "local", "failed"],
            should_save=False,
            created_at=now_str,
            warnings=[f"Ollama offline: {str(e)}"]
        )

async def ask_external_provider(
    provider: str,
    question: str,
    context: Optional[Dict[str, Any]] = None,
) -> TeacherAnswer:
    """
    Consulta um provedor externo (Groq, Gemini, OpenAI) cadastrado na LLM Factory.
    Se falhar, retorna resposta com warning seguro sem quebrar o sistema.
    """
    from aion.llm.providers import groq, gemini, openai_p, mock
    
    ans_id = f"teacher_ext_{uuid.uuid4()}"
    now_str = datetime.datetime.utcnow().isoformat()
    
    providers_map = {
        "groq": groq,
        "gemini": gemini,
        "openai": openai_p,
        "mock": mock,
    }
    
    selected = provider.lower().strip()
    mod = providers_map.get(selected, mock)
    
    messages = [
        {
            "role": "system", 
            "content": f"Você é o Professor {selected.upper()}. Explique o tópico de forma didática, técnica e detalhada para o cérebro central AION."
        },
        {
            "role": "user", 
            "content": f"Contexto: {context or {}}\n\nPergunta: {question}"
        }
    ]
    
    try:
        # Verifica se está disponível (chaves de API configuradas no .env)
        if hasattr(mod, "is_available"):
            if callable(mod.is_available):
                available = await mod.is_available()
            else:
                available = bool(mod.is_available)
            if not available:
                raise RuntimeError(f"Provider {selected} is not configured/available.")
                
        answer_content = await mod.complete(messages)
        
        lines = [l.strip() for l in answer_content.split("\n") if l.strip()]
        summary = lines[0] if lines else "Sem resumo disponível."
        if len(summary) > 200:
            summary = summary[:200] + "..."
            
        return TeacherAnswer(
            id=ans_id,
            provider=selected,
            question=question,
            answer=answer_content,
            summary=summary,
            confidence=0.92 if selected != "mock" else 0.50,
            sources=[f"provider_{selected}"],
            tags=[selected, "external"],
            should_save=True,
            created_at=now_str,
            warnings=[]
        )
    except Exception as e:
        logger.warning("Provider %s call failed: %s", selected, e)
        return TeacherAnswer(
            id=ans_id,
            provider=selected,
            question=question,
            answer=f"Chamada ao provider {selected} falhou.",
            summary=f"Erro de conexão com o provider {selected}.",
            confidence=0.0,
            sources=[],
            tags=[selected, "external", "failed"],
            should_save=False,
            created_at=now_str,
            warnings=[f"Provider failed: {str(e)}"]
        )

async def ask_teacher(
    provider: str,
    question: str,
    context: Optional[Dict[str, Any]] = None,
) -> TeacherAnswer:
    """
    Roteador inteligente. Se 'auto', busca Ollama se estiver disponível,
    senão recorre ao provedor oficial da LLM Factory ou Mock.
    """
    prov_clean = provider.lower().strip()
    
    if prov_clean == "auto":
        from aion.llm.providers import ollama
        ollama_available = False
        try:
            ollama_available = await ollama.is_available()
        except Exception:
            pass
            
        if ollama_available:
            return await ask_ollama(question, context)
        else:
            from aion.config import settings
            default_prov = settings.AI_PROVIDER
            if not default_prov:
                default_prov = "mock"
            return await ask_external_provider(default_prov, question, context)
            
    elif prov_clean == "ollama":
        return await ask_ollama(question, context)
    else:
        return await ask_external_provider(prov_clean, question, context)

# ---------------------------------------------------------------------------
# Importacao do OpenCode (Lessons)
# ---------------------------------------------------------------------------

async def import_opencode_lesson(
    app_id: str,
    file_path: str,
) -> TeacherAnswer:
    """
    Lê uma lição estruturada do OpenCode (MD, JSON ou TXT) e gera um TeacherAnswer.
    Aplica controles rígidos de segurança e validação de caminhos.
    """
    import json
    from aion.config import settings
    
    if not settings.TEACHER_ENABLE_OPENCODE_IMPORT:
        raise PermissionError("OpenCode import is disabled in settings.")
        
    if not _is_safe_path(file_path):
        raise PermissionError(f"Access denied to file path: {file_path}. Path traversal or sensitive file detected.")
        
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Lesson file not found: {file_path}")
        
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in (".md", ".json", ".txt"):
        raise ValueError("Unsupported lesson format. Supported: .md, .json, .txt")
        
    with open(file_path, "r", encoding="utf-8") as f:
        raw_content = f.read()
        
    ans_id = f"teacher_opencode_{uuid.uuid4()}"
    now_str = datetime.datetime.utcnow().isoformat()
    
    title = ""
    content = ""
    summary = ""
    confidence = 0.85
    topics = []
    
    if ext == ".json":
        try:
            data = json.loads(raw_content)
            title = data.get("title", "Lição Técnica OpenCode")
            content = data.get("content", raw_content)
            summary = data.get("summary", "")
            confidence = float(data.get("confidence", 0.85))
            topics = data.get("detected_topics", [])
        except Exception as e:
            raise ValueError(f"Failed to parse JSON lesson: {e}")
    else:
        # Markdown / TXT Parser básico
        content = raw_content
        lines = [line.strip() for line in raw_content.split("\n") if line.strip()]
        if lines:
            if lines[0].startswith("#"):
                title = lines[0].lstrip("#").strip()
            else:
                title = lines[0]
                
            non_headers = [l for l in lines if not l.startswith("#")]
            if non_headers:
                summary = non_headers[0]
                if len(summary) > 200:
                    summary = summary[:200] + "..."
            else:
                summary = "Resumo extraído da lição técnica."
        else:
            title = "Lição OpenCode"
            summary = "Sem conteúdo legível."
            
        topics = ["opencode", "technical"]
        confidence = 0.90
        
    return TeacherAnswer(
        id=ans_id,
        provider="opencode_file",
        question=f"OpenCode Lesson: {title}",
        answer=content,
        summary=summary,
        confidence=confidence,
        sources=[file_path],
        tags=list(set(["opencode", "import"] + topics)),
        should_save=True,
        created_at=now_str,
        warnings=[]
    )

# ---------------------------------------------------------------------------
# Validacao e Persistencia (Cerebro do AION)
# ---------------------------------------------------------------------------

def validate_teacher_answer(answer: TeacherAnswer) -> bool:
    """Verifica se o modelo TeacherAnswer possui dados mínimos e consistentes."""
    if not answer.id or not answer.provider or not answer.question:
        return False
    if not answer.answer or not answer.summary:
        return False
    if not (0.0 <= answer.confidence <= 1.0):
        return False
    return True

async def save_teacher_answer(
    app_id: str,
    answer: TeacherAnswer,
    tags: Optional[List[str]] = None,
) -> Optional[str]:
    """
    Centraliza a consolidação no cérebro do AION:
    1. Valida integridade e conteúdo.
    2. Filtra chaves, secrets e dados sensíveis via Regex.
    3. Avalia usando o cérebro (LLM) para validar, resumir e reavaliar a confiança.
    4. Salva no SQLite ('knowledge') local.
    5. Insere embeddings no Chroma Vector Store.
    6. Salva arquivo formatado no Obsidian.
    7. Enfileira o item no Sync Queue para a nuvem.
    """
    from aion.study.study_mode import _contains_sensitive
    from aion.memory import sqlite_store, vector_store, embeddings
    from aion.obsidian import writer
    from aion.sync.sync_queue import enqueue_sync
    import json
    
    # 1. Validação básica
    if not validate_teacher_answer(answer):
        logger.warning("Invalid TeacherAnswer metadata. Skipping save.")
        return None
        
    # 2. Sanitização de chaves e dados privados
    full_text = f"{answer.question}\n{answer.answer}\n{answer.summary}"
    if _contains_sensitive(full_text):
        answer.should_save = False
        warning_msg = "Sensitive data (keys, passwords, CPF or secrets) detected. Save blocked."
        if warning_msg not in answer.warnings:
            answer.warnings.append(warning_msg)
        logger.warning("Sensitive data detected in teacher answer. Persistence aborted.")
        return None
        
    if not answer.should_save:
        logger.info("TeacherAnswer is marked should_save=False. Skipping.")
        return None
        
    combined_tags = list(set((tags or []) + answer.tags))
    
    # 3. AION Valida, resume e classifica a confiança via LLM
    review_prompt = (
        "Você é o AION Core, o cérebro centralizador de inteligência.\n"
        "Analise a resposta técnica de um professor externo para determinar a integridade e precisão.\n"
        "Seu papel é:\n"
        "1. Validar se a resposta faz sentido ('valid': true/false).\n"
        "2. Resumir sucintamente em 1 a 2 parágrafos ('summary': 'string').\n"
        "3. Estipular sua própria nota de confiança técnica ('confidence': float de 0.0 a 1.0).\n\n"
        f"Professor: {answer.provider}\n"
        f"Pergunta: {answer.question}\n"
        f"Resposta:\n{answer.answer}\n\n"
        "Retorne a resposta EXATAMENTE no formato JSON a seguir:\n"
        "{\n"
        '  "valid": true,\n'
        '  "summary": "Resumo...",\n'
        '  "confidence": 0.85\n'
        "}\n"
        "NÃO adicione nenhuma outra informação, explicação ou tags markdown de código que não sejam JSON estruturado."
    )
    
    validated = True
    aion_summary = answer.summary
    aion_confidence = answer.confidence
    
    try:
        from aion.llm.factory import complete
        resp = await complete([{"role": "user", "content": review_prompt}])
        json_text = resp.strip()
        if json_text.startswith("```json"):
            json_text = json_text[7:]
        if json_text.endswith("```"):
            json_text = json_text[:-3]
        json_text = json_text.strip()
        
        data = json.loads(json_text)
        validated = bool(data.get("valid", True))
        aion_summary = data.get("summary", aion_summary)
        aion_confidence = float(data.get("confidence", aion_confidence))
    except Exception as e:
        logger.warning("AION brain evaluation failed, reverting to defaults: %s", e)
        
    if not validated:
        logger.warning("AION brain marked this lesson/answer as invalid or untrustworthy. Skipping save.")
        return None
        
    # Atualiza modelo com as conclusões do AION
    answer.summary = aion_summary
    answer.confidence = aion_confidence
    answer.tags = combined_tags
    
    # 4. Grava no SQLite ('knowledge')
    knowledge_content = (
        f"Professor: {answer.provider}\n"
        f"Pergunta: {answer.question}\n"
        f"Resumo: {answer.summary}\n"
        f"Resposta Completa:\n{answer.answer}"
    )
    
    knowledge_id = await sqlite_store.save_knowledge(
        app_id=app_id,
        content=knowledge_content,
        tags=answer.tags,
        confidence=answer.confidence,
        source_mode="teacher",
    )
    
    # 5. Gera embeddings e salva no ChromaDB (Vector Store)
    try:
        emb = embeddings.embed(knowledge_content)
        if emb:
            await vector_store.add_knowledge(
                app_id=app_id,
                knowledge_id=knowledge_id,
                content=knowledge_content,
                embedding=emb,
                metadata={
                    "provider": answer.provider,
                    "question": answer.question,
                    "type": "teacher_knowledge"
                },
                source_mode="teacher",
            )
    except Exception as e:
        logger.error("Failed to generate embedding for teacher lesson: %s", e)
        
    # 6. Grava no Obsidian
    try:
        await writer.write_teacher_lesson(app_id, answer)
    except Exception as e:
        logger.error("Failed to save teacher lesson to Obsidian: %s", e)
        
    # 7. Enfileira sincronização Supabase
    try:
        sync_payload = {
            "provider": answer.provider,
            "question": answer.question,
            "answer": answer.answer,
            "summary": answer.summary,
            "confidence": answer.confidence,
            "tags": answer.tags,
            "sources": answer.sources,
            "created_at": answer.created_at
        }
        await enqueue_sync(
            app_id=app_id,
            record_type="teacher_knowledge",
            record_id=knowledge_id,
            payload=sync_payload
        )
    except Exception as e:
        logger.error("Failed to enqueue teacher knowledge in sync queue: %s", e)
        
    return knowledge_id
