"""
AION Study Desktop Agent — Estudo de longa duração com pesquisa, RAG local e persistência local-first.
"""

import asyncio
import datetime
import json
import logging
import uuid
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from aion.config import settings
from aion.memory import sqlite_store
from aion.research.browser_research import search_public_web, open_public_page, summarize_source, PublicPageContent
from aion.study.study_mode import detect_study_topics, StudyResult, save_study_result
from aion.obsidian.writer import write_desktop_study_report

logger = logging.getLogger("aion.study.desktop")

# Dicionário global para rastrear tasks ativas em execução por session_id
ACTIVE_DESKTOP_STUDY_TASKS: Dict[str, asyncio.Task] = {}

# ---------------------------------------------------------------------------
# Tipos Pydantic
# ---------------------------------------------------------------------------

class DesktopStudySession(BaseModel):
    id: str
    app_id: str
    topics: List[str]
    status: str  # "pending" | "running" | "stopping" | "completed" | "failed" | "cancelled"
    duration_minutes: int
    max_sources: int
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    created_at: str


class DesktopStudyStatus(BaseModel):
    session_id: str
    app_id: str
    status: str
    progress: float
    current_topic: Optional[str] = None
    sources_read: int
    knowledge_saved: int
    warnings: List[str] = Field(default_factory=list)
    updated_at: str


class DesktopStudyReport(BaseModel):
    id: str
    app_id: str
    session_id: str
    topics: List[str]
    sources_read: int
    teacher_calls: int
    knowledge_saved: int
    conclusions: List[str] = Field(default_factory=list)
    confidence: float
    pending_sync_count: int
    warnings: List[str] = Field(default_factory=list)
    duration_seconds: float
    created_at: str


# ---------------------------------------------------------------------------
# Gerenciamento de Sessão Stale
# ---------------------------------------------------------------------------

async def recover_stale_sessions(app_id: str) -> None:
    """
    Recupera sessões que ficaram presas em 'running' ou 'pending' após reinicialização do servidor.
    """
    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            cursor = await conn.execute(
                "SELECT id FROM desktop_study_sessions WHERE status IN ('pending', 'running')"
            )
            rows = await cursor.fetchall()
            session_ids = [r["id"] for r in rows]
            
            if session_ids:
                logger.info("Recuperando %d sessões stale para tenant '%s'", len(session_ids), app_id)
                now = datetime.datetime.utcnow().isoformat()
                for sid in session_ids:
                    await conn.execute(
                        """
                        UPDATE desktop_study_sessions 
                        SET status = 'failed', 
                            warnings = COALESCE(warnings, '') || '; Sessão interrompida por reinicialização do servidor',
                            finished_at = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (now, now, sid)
                    )
                await conn.commit()
    except Exception as e:
        logger.error("Falha ao recuperar sessões stale para '%s': %s", app_id, e)


# ---------------------------------------------------------------------------
# Funções de Controle da Sessão
# ---------------------------------------------------------------------------

async def start_desktop_study(
    app_id: str,
    topics: List[str] | None = None,
    duration_minutes: int = 60,
    max_sources: int = 20,
    depth: str = "normal",
) -> DesktopStudySession:
    """
    Inicia uma sessão de estudo desktop em background.
    """
    # Validações de limites obrigatórias
    if duration_minutes < 1 or duration_minutes > 480:
        raise ValueError("duration_minutes deve estar entre 1 e 480.")
    if max_sources < 1 or max_sources > 100:
        raise ValueError("max_sources deve estar entre 1 e 100.")
        
    # Detecta tópicos automaticamente se não informados
    if not topics:
        detected = await detect_study_topics(app_id, max_topics=5)
        topics = [t.topic for t in detected]
        
    # Fallback se nenhum tópico for detectado
    if not topics:
        topics = ["AION como sistema operacional de inteligência"]
        
    session_id = f"desktop_study_{uuid.uuid4().hex[:12]}"
    created_at = datetime.datetime.utcnow().isoformat()
    
    session = DesktopStudySession(
        id=session_id,
        app_id=app_id,
        topics=topics,
        status="pending",
        duration_minutes=duration_minutes,
        max_sources=max_sources,
        created_at=created_at
    )
    
    # Salva sessão pendente no SQLite
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            """
            INSERT INTO desktop_study_sessions 
            (id, app_id, topics, status, duration_minutes, max_sources, progress, current_topic, sources_read, knowledge_saved, warnings, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0.0, NULL, 0, 0, NULL, ?, ?)
            """,
            (
                session_id,
                app_id,
                json.dumps(topics),
                "pending",
                duration_minutes,
                max_sources,
                created_at,
                created_at
            )
        )
        await conn.commit()
        
    # Dispara a sessão assíncrona em background
    task = asyncio.create_task(
        run_desktop_study_session(
            app_id=app_id,
            session_id=session_id,
            topics=topics,
            duration_minutes=duration_minutes,
            max_sources=max_sources,
            depth=depth
        )
    )
    ACTIVE_DESKTOP_STUDY_TASKS[session_id] = task
    
    return session


async def stop_desktop_study(app_id: str, session_id: str) -> DesktopStudyStatus:
    """
    Para a sessão de estudo de forma segura cancelando a task ativa.
    """
    task = ACTIVE_DESKTOP_STUDY_TASKS.get(session_id)
    if task and not task.done():
        logger.info("Cancelando task de estudo ativa '%s'", session_id)
        task.cancel()
        # Aguarda brevemente para que a task capture CancelledError e finalize
        try:
            await asyncio.wait_for(task, timeout=1.0)
        except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
            pass
            
    # Garante status cancelado no banco caso a task já tenha finalizado ou não tenha tratado
    now = datetime.datetime.utcnow().isoformat()
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            """
            UPDATE desktop_study_sessions 
            SET status = 'cancelled', finished_at = ?, updated_at = ?
            WHERE id = ? AND status IN ('pending', 'running')
            """,
            (now, now, session_id)
        )
        await conn.commit()
        
    status = await get_desktop_study_status(app_id, session_id)
    return status


async def get_desktop_study_status(app_id: str, session_id: str) -> DesktopStudyStatus:
    """
    Retorna o status detalhado atualizado e progresso da sessão a partir do SQLite.
    """
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        cursor = await conn.execute(
            "SELECT * FROM desktop_study_sessions WHERE id = ? AND app_id = ?",
            (session_id, app_id)
        )
        row = await cursor.fetchone()
        
    if not row:
        raise ValueError(f"Sessão de estudo '{session_id}' não encontrada para o tenant '{app_id}'.")
        
    warnings_list = []
    if row["warnings"]:
        try:
            warnings_list = json.loads(row["warnings"])
        except Exception:
            warnings_list = [row["warnings"]]
            
    return DesktopStudyStatus(
        session_id=row["id"],
        app_id=row["app_id"],
        status=row["status"],
        progress=row["progress"] or 0.0,
        current_topic=row["current_topic"],
        sources_read=row["sources_read"] or 0,
        knowledge_saved=row["knowledge_saved"] or 0,
        warnings=warnings_list,
        updated_at=row["updated_at"]
    )


async def get_last_desktop_study_report(app_id: str) -> Optional[DesktopStudyReport]:
    """
    Retorna o último relatório gerado no tenant.
    """
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        cursor = await conn.execute(
            "SELECT * FROM desktop_study_reports WHERE app_id = ? ORDER BY created_at DESC LIMIT 1",
            (app_id,)
        )
        row = await cursor.fetchone()
        
    if not row:
        return None
        
    conclusions_list = []
    if row["conclusions"]:
        try:
            conclusions_list = json.loads(row["conclusions"])
        except Exception:
            conclusions_list = [row["conclusions"]]
            
    warnings_list = []
    if row["warnings"]:
        try:
            warnings_list = json.loads(row["warnings"])
        except Exception:
            warnings_list = [row["warnings"]]
            
    return DesktopStudyReport(
        id=row["id"],
        app_id=row["app_id"],
        session_id=row["session_id"],
        topics=json.loads(row["topics"]),
        sources_read=row["sources_read"] or 0,
        teacher_calls=row["teacher_calls"] or 0,
        knowledge_saved=row["knowledge_saved"] or 0,
        conclusions=conclusions_list,
        confidence=row["confidence"] or 0.0,
        pending_sync_count=row["pending_sync_count"] or 0,
        warnings=warnings_list,
        duration_seconds=row["duration_seconds"] or 0.0,
        created_at=row["created_at"]
    )


# ---------------------------------------------------------------------------
# Background study task runner
# ---------------------------------------------------------------------------

async def run_desktop_study_session(
    app_id: str,
    session_id: str,
    topics: List[str],
    duration_minutes: int,
    max_sources: int,
    depth: str,
) -> DesktopStudyReport:
    """
    Orquestrador principal que executa a pesquisa, leitura, RAG local e síntese.
    Esta função roda de forma totalmente não-bloqueante em background.
    """
    start_time = datetime.datetime.utcnow()
    started_at = start_time.isoformat()
    
    # Atualiza sessão para 'running' no SQLite
    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            """
            UPDATE desktop_study_sessions 
            SET status = 'running', started_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (started_at, started_at, session_id)
        )
        await conn.commit()
        
    sources_read_count = 0
    knowledge_saved_count = 0
    teacher_calls_count = 0
    warnings: List[str] = []
    conclusions: List[str] = []
    confidence_scores: List[float] = []
    
    total_topics = len(topics)
    
    try:
        from aion.agent.reasoner import build_rag_context, compute_rag_confidence
        from aion.llm import factory as llm_factory
        
        for idx, topic in enumerate(topics):
            # 1. Checa se a task foi cancelada de forma cooperativa
            await asyncio.sleep(0.1)
            
            # Atualiza tópico atual e progresso
            progress = idx / total_topics
            now_iso = datetime.datetime.utcnow().isoformat()
            async with sqlite_store.tenant_db_connection(app_id) as conn:
                await conn.execute(
                    """
                    UPDATE desktop_study_sessions 
                    SET current_topic = ?, progress = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (topic, progress, now_iso, session_id)
                )
                await conn.commit()
                
            # 2. Busca conhecimento local no RAG
            rag_context = ""
            local_confidence = 0.0
            try:
                rag_context = await build_rag_context(app_id, topic)
                local_confidence = compute_rag_confidence(rag_context)
            except Exception as e:
                warnings.append(f"Falha ao carregar RAG para o tópico '{topic}': {e}")
                
            # 3. Se RAG local já tem confiança alta (>= 0.80), consolida localmente sem chamar LLM externo
            if local_confidence >= 0.80:
                knowledge_saved_count += 1
                conclusions.append(f"Tópico '{topic}' consolidado a partir da memória local (confiança {local_confidence:.2f}).")
                confidence_scores.append(local_confidence)
                continue
                
            # 4. Caso contrário, inicia pesquisa pública web
            search_results = []
            try:
                search_results = await search_public_web(topic, max_results=5)
            except Exception as e:
                warnings.append(f"Pesquisa pública falhou para '{topic}': {e}")
                
            summaries = []
            for sr in search_results:
                # Checa limite de fontes por sessão
                if sources_read_count >= max_sources:
                    warnings.append(f"Limite máximo de fontes ({max_sources}) atingido.")
                    break
                    
                # Leitura e parsing seguro
                page_content = await open_public_page(sr.url)
                if page_content.success:
                    sources_read_count += 1
                    # Chama LLM para resumir a fonte individual
                    source_summary = await summarize_source(page_content, topic)
                    teacher_calls_count += 1 # Conta a chamada de IA do summarize_source
                    summaries.append(source_summary)
                else:
                    warnings.append(f"Não foi possível ler a URL {sr.url}: {page_content.error}")
                    
            # 5. Sintetiza conclusões com LLM combinando RAG local e resumos web
            web_context = ""
            if summaries:
                web_lines = [f"- Fonte: {s.url} (Confiança: {s.confidence:.2f}): {s.summary}" for s in summaries]
                web_context = "\n".join(web_lines)
                
            try:
                provider = await llm_factory.get_llm_provider()
                teacher_calls_count += 1 # Chamada de IA para consolidar
                
                prompt = f"""Você é o AION Intelligence Core. Estude o tópico solicitado integrando a memória local e os fatos pesquisados na web.

Tópico: {topic}

Contexto local existente:
{rag_context or '(nenhum)'}

Resultados obtidos via pesquisa web:
{web_context or '(nenhum)'}

Instruções de síntese:
1. Gere um resumo do aprendizado (máx 200 palavras).
2. Forneça até 5 conclusões práticas baseadas nos fatos.
3. Defina seu grau de confiança final (confidence) entre 0.0 e 1.0.
4. Identifique até 5 tags relevantes.

Retorne APENAS um JSON válido. Não use markdown no corpo:
{{
  "summary": "...",
  "conclusions": ["...", "..."],
  "confidence": 0.85,
  "tags": ["...", "..."]
}}"""

                messages = [
                    {"role": "system", "content": "You are the AION Study Engine. Output ONLY valid JSON. No markdown."},
                    {"role": "user", "content": prompt}
                ]
                
                raw = await provider(messages)
                clean = raw.replace("```json", "").replace("```", "").strip()
                data = json.loads(clean)
                
                sum_text = str(data.get("summary", ""))
                topic_conclusions = data.get("conclusions", [])
                conf_score = float(data.get("confidence", 0.5))
                tags = list(data.get("tags", []))
                
                conclusions.extend(topic_conclusions)
                confidence_scores.append(conf_score)
                
                # Chamada de professor (Teacher Adapters) como apoio se a confiança for baixa (< 0.80)
                from aion.config import settings
                max_teacher_calls = getattr(settings, "TEACHER_MAX_CALLS_PER_SESSION", 5)
                max_teacher_calls = min(max_teacher_calls, 10)
                
                if conf_score < 0.80 and teacher_calls_count < max_teacher_calls:
                    try:
                        from aion.study.teacher_adapters import ask_teacher, save_teacher_answer
                        teacher_answer = await ask_teacher(
                            provider="auto",
                            question=topic,
                            context={"local_confidence": local_confidence, "conf_score": conf_score}
                        )
                        if teacher_answer and teacher_answer.should_save and teacher_answer.confidence > 0.0:
                            k_id = await save_teacher_answer(app_id, teacher_answer, tags=["desktop_agent", "teacher"])
                            if k_id:
                                teacher_calls_count += 1
                                conclusions.append(f"Tópico '{topic}' complementado pelo Professor ({teacher_answer.provider}) com confiança {teacher_answer.confidence:.2f}.")
                                conf_score = max(conf_score, teacher_answer.confidence)
                                confidence_scores[-1] = conf_score
                    except Exception as te:
                        warnings.append(f"Consulta ao professor falhou para o tópico '{topic}': {te}")
                
                # Salva o aprendizado localmente
                # Cria o objeto StudyResult
                study_result = StudyResult(
                    topic=topic,
                    summary=sum_text,
                    conclusions=topic_conclusions,
                    confidence=conf_score,
                    sources_used=[s.url for s in summaries] + (["local_rag"] if rag_context else []),
                    should_save=True,
                    tags=tags
                )
                
                # Salva no SQLite, ChromaDB, Obsidian e enfileira na sync_queue via save_study_result
                await save_study_result(app_id, study_result)
                knowledge_saved_count += 1
                
            except Exception as e:
                logger.error("Erro ao sintetizar estudo para tópico '%s': %s", topic, e)
                warnings.append(f"LLM falhou ao consolidar tópico '{topic}': {e}")
                
        # 6. Conclusão com sucesso
        finished_time = datetime.datetime.utcnow()
        duration_seconds = (finished_time - start_time).total_seconds()
        finished_at = finished_time.isoformat()
        
        final_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.5
        report_id = f"desktop_study_report_{uuid.uuid4().hex[:12]}"
        
        # Obtém quantidade de itens pendentes de sincronização
        pending_sync_count = 0
        try:
            async with sqlite_store.tenant_db_connection(app_id) as conn:
                cursor = await conn.execute(
                    "SELECT COUNT(*) as cnt FROM sync_queue WHERE app_id = ? AND status = 'pending'",
                    (app_id,)
                )
                row = await cursor.fetchone()
                pending_sync_count = row["cnt"] if row else 0
        except Exception:
            pass
            
        report = DesktopStudyReport(
            id=report_id,
            app_id=app_id,
            session_id=session_id,
            topics=topics,
            sources_read=sources_read_count,
            teacher_calls=teacher_calls_count,
            knowledge_saved=knowledge_saved_count,
            conclusions=conclusions,
            confidence=final_confidence,
            pending_sync_count=pending_sync_count,
            warnings=warnings,
            duration_seconds=duration_seconds,
            created_at=finished_at
        )
        
        # Persiste o relatório de estudo no SQLite
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            await conn.execute(
                """
                INSERT INTO desktop_study_reports 
                (id, app_id, session_id, topics, sources_read, teacher_calls, knowledge_saved, conclusions, confidence, pending_sync_count, warnings, duration_seconds, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    report_id,
                    app_id,
                    session_id,
                    json.dumps(topics),
                    sources_read_count,
                    teacher_calls_count,
                    knowledge_saved_count,
                    json.dumps(conclusions),
                    final_confidence,
                    pending_sync_count,
                    json.dumps(warnings),
                    duration_seconds,
                    finished_at
                )
            )
            
            # Atualiza status da sessão para completed
            await conn.execute(
                """
                UPDATE desktop_study_sessions 
                SET status = 'completed', progress = 1.0, sources_read = ?, knowledge_saved = ?, warnings = ?, finished_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    sources_read_count,
                    knowledge_saved_count,
                    json.dumps(warnings),
                    finished_at,
                    finished_at,
                    session_id
                )
            )
            await conn.commit()
            
        # Grava o relatório estruturado no Obsidian Vault
        try:
            await write_desktop_study_report(app_id, report)
        except Exception as e:
            logger.error("Falha ao gravar relatório desktop study no Obsidian: %s", e)
            
        # Enfileira na sync_queue para sincronização remota
        try:
            from aion.sync.sync_queue import enqueue_sync
            await enqueue_sync(
                app_id=app_id,
                record_type="desktop_study_report",
                record_id=report_id,
                payload=report.model_dump()
            )
        except Exception as e:
            logger.warning("Falha ao enfileirar sync do relatório final de estudo: %s", e)
            
        return report
        
    except asyncio.CancelledError:
        logger.info("Task de estudo '%s' cancelada pelo usuário.", session_id)
        # Finalização graciosamente por cancelamento
        finished_time = datetime.datetime.utcnow()
        duration_seconds = (finished_time - start_time).total_seconds()
        finished_at = finished_time.isoformat()
        warnings.append("Sessão parada/cancelada ativamente pelo usuário.")
        
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            await conn.execute(
                """
                UPDATE desktop_study_sessions 
                SET status = 'cancelled', finished_at = ?, updated_at = ?, warnings = ?
                WHERE id = ?
                """,
                (finished_at, finished_at, json.dumps(warnings), session_id)
            )
            await conn.commit()
            
        # Cria relatório parcial
        report_id = f"desktop_study_report_{uuid.uuid4().hex[:12]}"
        report = DesktopStudyReport(
            id=report_id,
            app_id=app_id,
            session_id=session_id,
            topics=topics,
            sources_read=sources_read_count,
            teacher_calls=teacher_calls_count,
            knowledge_saved=knowledge_saved_count,
            conclusions=conclusions,
            confidence=0.5,
            pending_sync_count=0,
            warnings=warnings,
            duration_seconds=duration_seconds,
            created_at=finished_at
        )
        
        try:
            async with sqlite_store.tenant_db_connection(app_id) as conn:
                await conn.execute(
                    """
                    INSERT INTO desktop_study_reports 
                    (id, app_id, session_id, topics, sources_read, teacher_calls, knowledge_saved, conclusions, confidence, pending_sync_count, warnings, duration_seconds, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        report_id,
                        app_id,
                        session_id,
                        json.dumps(topics),
                        sources_read_count,
                        teacher_calls_count,
                        knowledge_saved_count,
                        json.dumps(conclusions),
                        0.5,
                        0,
                        json.dumps(warnings),
                        duration_seconds,
                        finished_at
                    )
                )
                await conn.commit()
                
            await write_desktop_study_report(app_id, report)
        except Exception as e:
            logger.error("Falha ao gravar relatório cancelado no Obsidian/SQLite: %s", e)
            
        raise
        
    except Exception as e:
        logger.error("Falha catastrófica na sessão de estudo '%s': %s", session_id, e)
        finished_time = datetime.datetime.utcnow()
        duration_seconds = (finished_time - start_time).total_seconds()
        finished_at = finished_time.isoformat()
        warnings.append(f"Erro catastrófico: {str(e)}")
        
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            await conn.execute(
                """
                UPDATE desktop_study_sessions 
                SET status = 'failed', finished_at = ?, updated_at = ?, warnings = ?
                WHERE id = ?
                """,
                (finished_at, finished_at, json.dumps(warnings), session_id)
            )
            await conn.commit()
            
        report_id = f"desktop_study_report_{uuid.uuid4().hex[:12]}"
        report = DesktopStudyReport(
            id=report_id,
            app_id=app_id,
            session_id=session_id,
            topics=topics,
            sources_read=sources_read_count,
            teacher_calls=teacher_calls_count,
            knowledge_saved=knowledge_saved_count,
            conclusions=conclusions,
            confidence=0.3,
            pending_sync_count=0,
            warnings=warnings,
            duration_seconds=duration_seconds,
            created_at=finished_at
        )
        
        try:
            async with sqlite_store.tenant_db_connection(app_id) as conn:
                await conn.execute(
                    """
                    INSERT INTO desktop_study_reports 
                    (id, app_id, session_id, topics, sources_read, teacher_calls, knowledge_saved, conclusions, confidence, pending_sync_count, warnings, duration_seconds, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        report_id,
                        app_id,
                        session_id,
                        json.dumps(topics),
                        sources_read_count,
                        teacher_calls_count,
                        knowledge_saved_count,
                        json.dumps(conclusions),
                        0.3,
                        0,
                        json.dumps(warnings),
                        duration_seconds,
                        finished_at
                    )
                )
                await conn.commit()
        except Exception as ex:
            logger.error("Falha ao salvar relatório de falha no SQLite: %s", ex)
            
        return report
        
    finally:
        # Remove a referência global da task ao finalizar
        if session_id in ACTIVE_DESKTOP_STUDY_TASKS:
            del ACTIVE_DESKTOP_STUDY_TASKS[session_id]

