"""
AION Study Mode — Aprendizado autônomo por pesquisa, síntese e persistência.

O AION estuda tópicos, cruza informações, tira conclusões e salva
conhecimento no próprio cérebro (SQLite + Vector Store + Obsidian).
"""

import re
import json
import uuid
import time
import logging
import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from aion.config import settings

logger = logging.getLogger("aion.study")


# ---------------------------------------------------------------------------
# Tipos Pydantic
# ---------------------------------------------------------------------------


class StudyTopic(BaseModel):
    topic: str
    reason: str = ""
    source: str = "manual"  # manual | knowledge_gap | recent_activity | project | domain
    priority: int = 0
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class StudyResult(BaseModel):
    topic: str
    summary: str = ""
    conclusions: List[str] = Field(default_factory=list)
    confidence: float = 0.0
    sources_used: List[str] = Field(default_factory=list)
    should_save: bool = True
    tags: List[str] = Field(default_factory=list)
    expires_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class StudyReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    app_id: str
    mode: str = "manual"
    topics_studied: List[str] = Field(default_factory=list)
    knowledge_saved: int = 0
    skipped: int = 0
    provider_used: Optional[str] = None
    duration_seconds: float = 0.0
    summary: str = ""
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    warnings: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Filtro de dados sensíveis
# ---------------------------------------------------------------------------

_SENSITIVE_PATTERNS = re.compile(
    r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"          # CPF
    r"|\b\d{11}\b"                              # CPF raw
    r"|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"  # cartão
    r"|\b(?:senha|password|token|secret|apikey|api_key)\s*[:=]\s*\S+"
    r"|\b(?:sk-|ghp_|gho_|glpat-|xox[bpas]-)\S+",
    re.IGNORECASE,
)


def _contains_sensitive(text: str) -> bool:
    return bool(_SENSITIVE_PATTERNS.search(text))


def _sanitize_study_content(text: str) -> str:
    """Remove dados sensíveis do conteúdo de estudo."""
    return _SENSITIVE_PATTERNS.sub("[REDACTED]", text)


# ---------------------------------------------------------------------------
# Detecção automática de tópicos
# ---------------------------------------------------------------------------


async def detect_study_topics(app_id: str, max_topics: int = 5) -> List[StudyTopic]:
    """
    Detecta tópicos relevantes para estudo a partir de:
    - actions_log recente (perguntas recorrentes)
    - knowledge com confiança baixa (gaps)
    - memories recentes
    """
    from aion.memory import sqlite_store

    topics: List[StudyTopic] = []

    try:
        if not await sqlite_store.is_tenant_provisioned(app_id):
            return topics

        # 1. Busca perguntas recentes do actions_log
        try:
            async with sqlite_store.tenant_db_connection(app_id) as conn:
                cursor = await conn.execute(
                    "SELECT input FROM actions_log WHERE app_id = ? "
                    "ORDER BY created_at DESC LIMIT 20",
                    (app_id,),
                )
                rows = await cursor.fetchall()
                inputs = [r["input"] for r in rows if r["input"]]
        except Exception:
            inputs = []

        # Extrai temas recorrentes via análise de frequência simples
        word_freq: Dict[str, int] = {}
        for inp in inputs:
            words = [w.lower() for w in inp.split() if len(w) > 4]
            for w in words:
                word_freq[w] = word_freq.get(w, 0) + 1

        frequent = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:3]
        for word, count in frequent:
            if count >= 2:
                topics.append(StudyTopic(
                    topic=word,
                    reason=f"Mencionado {count}x nas últimas interações",
                    source="recent_activity",
                    priority=count,
                ))

        # 2. Busca knowledge com confiança baixa
        try:
            async with sqlite_store.tenant_db_connection(app_id) as conn:
                cursor = await conn.execute(
                    "SELECT content, confidence FROM knowledge WHERE app_id = ? "
                    "AND confidence < 0.70 ORDER BY confidence ASC LIMIT 5",
                    (app_id,),
                )
                weak_rows = await cursor.fetchall()
        except Exception:
            weak_rows = []

        for row in weak_rows:
            content = row["content"][:80]
            topics.append(StudyTopic(
                topic=content,
                reason=f"Knowledge com confiança baixa ({row['confidence']:.2f})",
                source="knowledge_gap",
                priority=3,
            ))

        # Deduplica e limita
        seen = set()
        unique: List[StudyTopic] = []
        for t in sorted(topics, key=lambda x: x.priority, reverse=True):
            key = t.topic.lower().strip()
            if key not in seen:
                seen.add(key)
                unique.append(t)

        return unique[:max_topics]

    except Exception as e:
        logger.error("Erro ao detectar tópicos de estudo: %s", e)
        return []


# ---------------------------------------------------------------------------
# Estudo de um tópico individual
# ---------------------------------------------------------------------------


async def study_topic(app_id: str, topic: str, depth: str = "normal") -> StudyResult:
    """
    Estuda um tópico:
    1. Busca contexto local (RAG)
    2. Se confiança local alta, consolida sem LLM
    3. Se precisa, chama LLM + web search
    4. Gera resultado com conclusões e confiança
    """
    from aion.agent.reasoner import build_rag_context, compute_rag_confidence

    sources: List[str] = []
    warnings: List[str] = []

    # 1. Contexto local
    try:
        rag_context = await build_rag_context(app_id, topic)
        local_confidence = compute_rag_confidence(rag_context)
        if rag_context:
            sources.append("local_rag")
    except Exception as e:
        logger.warning("RAG falhou para tópico '%s': %s", topic, e)
        rag_context = ""
        local_confidence = 0.0

    # 2. Se confiança local alta, consolida sem chamar provider
    if local_confidence >= 0.80:
        return StudyResult(
            topic=topic,
            summary=f"Conhecimento local suficiente sobre '{topic}'. Confiança: {local_confidence:.2f}.",
            conclusions=[f"Contexto local já cobre '{topic}' com confiança {local_confidence:.2f}"],
            confidence=local_confidence,
            sources_used=sources,
            should_save=False,
            tags=["consolidated", "local"],
        )

    # Integração de Professores (Teacher Adapters)
    needs_teacher = False
    if depth == "deep":
        needs_teacher = True
    elif depth == "normal":
        if local_confidence < 0.80:
            needs_teacher = True
    elif depth == "light":
        needs_teacher = False

    if needs_teacher:
        try:
            from aion.study.teacher_adapters import ask_teacher, save_teacher_answer
            teacher_answer = await ask_teacher(provider="auto", question=topic, context={"local_confidence": local_confidence})
            if teacher_answer and teacher_answer.should_save and teacher_answer.confidence > 0.0:
                k_id = await save_teacher_answer(app_id, teacher_answer, tags=["study", "teacher"])
                if k_id:
                    sources.append(f"teacher_{teacher_answer.provider}")
                    rag_context += f"\n\nContexto adicional do Professor ({teacher_answer.provider}):\n{teacher_answer.answer}"
        except Exception as te:
            logger.warning("Teacher integration failed for topic '%s': %s", topic, te)

    # 3. Web search
    web_results = []
    try:
        from aion.research.web_search import search_web
        web_results = await search_web(topic, max_results=3)
        if web_results:
            sources.append("web_search")
    except Exception as e:
        logger.warning("Web search falhou para '%s': %s", topic, e)

    web_context = ""
    if web_results:
        web_lines = [f"- {r.get('title', '')}: {r.get('snippet', '')}" for r in web_results]
        web_context = "\n".join(web_lines)

    # 4. Chama LLM para síntese
    try:
        from aion.llm import factory as llm_factory
        provider = await llm_factory.get_llm_provider()

        depth_instruction = ""
        if depth == "deep":
            depth_instruction = "Faça uma análise profunda e detalhada."
        elif depth == "shallow":
            depth_instruction = "Faça um resumo breve e objetivo."

        prompt = f"""Você é um pesquisador especialista. Estude o tópico abaixo e forneça:
1. Um resumo claro e objetivo (máx 200 palavras)
2. Até 5 conclusões práticas
3. Nível de confiança (0.0 a 1.0)
4. Tags relevantes (até 5)

{depth_instruction}

Tópico: {topic}

Contexto local disponível:
{rag_context or '(nenhum)'}

Resultados de pesquisa web:
{web_context or '(nenhum)'}

Retorne APENAS um JSON válido:
{{
  "summary": "...",
  "conclusions": ["...", "..."],
  "confidence": 0.0,
  "tags": ["...", "..."],
  "is_volatile": false
}}"""

        messages = [
            {"role": "system", "content": "Return only valid JSON. No markdown."},
            {"role": "user", "content": prompt},
        ]

        raw = await provider(messages)
        sources.append("llm_provider")

        # Parse resposta
        clean = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean)

        summary = str(data.get("summary", ""))
        conclusions = data.get("conclusions", [])
        confidence = float(data.get("confidence", 0.5))
        tags = data.get("tags", [])
        is_volatile = data.get("is_volatile", False)

        # Sanitiza conteúdo sensível
        summary = _sanitize_study_content(summary)
        conclusions = [_sanitize_study_content(c) for c in conclusions]

        # Se conteúdo sensível detectado no tópico original, não salvar
        should_save = not _contains_sensitive(topic) and confidence >= 0.50

        expires_at = None
        if is_volatile:
            expires_at = (
                datetime.datetime.utcnow() + datetime.timedelta(hours=48)
            ).isoformat()

        return StudyResult(
            topic=topic,
            summary=summary,
            conclusions=conclusions,
            confidence=confidence,
            sources_used=sources,
            should_save=should_save,
            tags=tags,
            expires_at=expires_at,
        )

    except Exception as e:
        logger.error("LLM falhou ao estudar '%s': %s", topic, e)
        # Retorna resultado parcial sem LLM
        return StudyResult(
            topic=topic,
            summary=f"Estudo parcial de '{topic}'. Provider indisponível.",
            conclusions=[],
            confidence=0.0,
            sources_used=sources,
            should_save=False,
            tags=["partial", "provider_failed"],
        )


# ---------------------------------------------------------------------------
# Persistência de resultado de estudo
# ---------------------------------------------------------------------------


async def save_study_result(app_id: str, result: StudyResult) -> None:
    """
    Salva conhecimento aprendido:
    1. SQLite (knowledge)
    2. Vector store (embedding)
    3. Obsidian (.md)
    """
    if not result.should_save:
        return

    if _contains_sensitive(result.summary):
        logger.warning("Conteúdo sensível detectado — não salvando resultado de estudo.")
        return

    from aion.memory import sqlite_store, vector_store, embeddings
    from aion.obsidian import writer

    content = f"[Study] {result.topic}\n\n{result.summary}"
    if result.conclusions:
        content += "\n\nConclusões:\n" + "\n".join(f"- {c}" for c in result.conclusions)

    tags = list(set(["study", "auto_learned"] + result.tags))

    # 1. SQLite
    try:
        k_id = await sqlite_store.save_knowledge(
            app_id,
            content,
            tags,
            confidence=result.confidence,
            expires_at=result.expires_at,
            source_mode="study",
        )
    except Exception as e:
        logger.error("Falha ao salvar knowledge do estudo: %s", e)
        return

    # 2. Vector store
    try:
        emb = embeddings.embed(content)
        if emb:
            await vector_store.add_knowledge(app_id, k_id, content, emb, {"tags": ",".join(tags)},
                                              source_mode="study")
    except Exception as e:
        logger.warning("Vector store falhou para estudo: %s", e)

    # 3. Obsidian
    try:
        await writer.write_knowledge(app_id, content, tags, result.confidence)
    except Exception as e:
        logger.warning("Obsidian write falhou para estudo: %s", e)

    # 4. Sync Queue
    try:
        from aion.sync.sync_queue import enqueue_sync
        await enqueue_sync(
            app_id=app_id,
            record_type="knowledge",
            record_id=k_id,
            payload={
                "content": content,
                "tags": tags,
                "confidence": result.confidence,
                "expires_at": result.expires_at,
            }
        )
    except Exception as e:
        logger.warning("Falha ao enfileirar sync do knowledge de estudo: %s", e)


# ---------------------------------------------------------------------------
# Persistência de relatório
# ---------------------------------------------------------------------------


async def _save_study_report(app_id: str, report: StudyReport) -> None:
    """Salva o relatório de estudo no SQLite."""
    from aion.memory import sqlite_store

    await sqlite_store.provision_tenant(app_id)

    async with sqlite_store.tenant_db_connection(app_id) as conn:
        await conn.execute(
            """
            INSERT OR REPLACE INTO study_reports
            (id, app_id, mode, topics, summary, knowledge_saved, skipped,
             provider_used, duration_seconds, warnings, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report.id,
                report.app_id,
                report.mode,
                json.dumps(report.topics_studied),
                report.summary,
                report.knowledge_saved,
                report.skipped,
                report.provider_used,
                report.duration_seconds,
                json.dumps(report.warnings),
                report.created_at,
            ),
        )
        await conn.commit()

    # 2. Sync Queue
    try:
        from aion.sync.sync_queue import enqueue_sync
        await enqueue_sync(
            app_id=app_id,
            record_type="study_report",
            record_id=report.id,
            payload=report.model_dump()
        )
    except Exception as e:
        logger.warning("Falha ao enfileirar sync do study_report: %s", e)


async def get_last_study_report(app_id: str) -> Optional[StudyReport]:
    """Recupera o último relatório de estudo do tenant."""
    from aion.memory import sqlite_store

    if not await sqlite_store.is_tenant_provisioned(app_id):
        return None

    try:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            cursor = await conn.execute(
                "SELECT * FROM study_reports WHERE app_id = ? "
                "ORDER BY created_at DESC LIMIT 1",
                (app_id,),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            return StudyReport(
                id=row["id"],
                app_id=row["app_id"],
                mode=row["mode"],
                topics_studied=json.loads(row["topics"]),
                knowledge_saved=row["knowledge_saved"],
                skipped=row["skipped"],
                provider_used=row["provider_used"],
                duration_seconds=row["duration_seconds"],
                summary=row["summary"],
                created_at=row["created_at"],
                warnings=json.loads(row["warnings"]) if row["warnings"] else [],
            )
    except Exception as e:
        logger.error("Falha ao recuperar último relatório de estudo: %s", e)
        return None


# ---------------------------------------------------------------------------
# Orquestrador principal
# ---------------------------------------------------------------------------


async def run_study_mode(
    app_id: str,
    topics: Optional[List[str]] = None,
    mode: str = "manual",
    max_topics: int = 5,
    depth: str = "normal",
) -> StudyReport:
    """
    Orquestra uma sessão de estudo completa.

    - mode="manual": estuda os tópicos fornecidos
    - mode="auto": detecta tópicos automaticamente
    """
    start = time.time()
    warnings: List[str] = []
    studied: List[str] = []
    saved_count = 0
    skipped_count = 0
    provider_used = None

    # 1. Determina tópicos
    if mode == "auto" or not topics:
        detected = await detect_study_topics(app_id, max_topics)
        study_topics = [t.topic for t in detected]
        mode = "auto"
    else:
        study_topics = topics[:max_topics]

    if not study_topics:
        warnings.append("Nenhum tópico detectado para estudo.")
        elapsed = time.time() - start
        report = StudyReport(
            app_id=app_id,
            mode=mode,
            topics_studied=[],
            knowledge_saved=0,
            skipped=0,
            duration_seconds=round(elapsed, 2),
            summary="Nenhum tópico encontrado para estudar.",
            warnings=warnings,
        )
        await _save_study_report(app_id, report)
        return report

    # 2. Estuda cada tópico
    for topic_str in study_topics:
        try:
            result = await study_topic(app_id, topic_str, depth)

            if result.should_save:
                await save_study_result(app_id, result)
                saved_count += 1
            else:
                skipped_count += 1

            studied.append(topic_str)

            # Detecta provider usado
            if "llm_provider" in result.sources_used and not provider_used:
                provider_used = "llm"

        except Exception as e:
            warnings.append(f"Erro ao estudar '{topic_str}': {str(e)}")
            logger.error("Erro ao estudar tópico '%s': %s", topic_str, e)

    elapsed = time.time() - start

    # 3. Gera relatório
    summary_parts = [f"Sessão de estudo ({mode}): {len(studied)} tópicos processados."]
    if saved_count:
        summary_parts.append(f"{saved_count} conhecimentos salvos.")
    if skipped_count:
        summary_parts.append(f"{skipped_count} tópicos pulados (já conhecidos ou sem confiança).")

    report = StudyReport(
        app_id=app_id,
        mode=mode,
        topics_studied=studied,
        knowledge_saved=saved_count,
        skipped=skipped_count,
        provider_used=provider_used,
        duration_seconds=round(elapsed, 2),
        summary=" ".join(summary_parts),
        warnings=warnings,
    )

    # 4. Persiste relatório
    await _save_study_report(app_id, report)

    # 5. Obsidian
    try:
        from aion.obsidian import writer
        await writer.write_study_report(app_id, report)
    except Exception as e:
        logger.warning("Falha ao gravar relatório no Obsidian: %s", e)

    return report
