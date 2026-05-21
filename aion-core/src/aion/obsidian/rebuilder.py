import json
import time
import asyncio
import logging
from typing import List, Optional
from pydantic import BaseModel

from aion.memory.sqlite_store import tenant_db_connection, provision_tenant
from aion.obsidian.reader import read_all, VaultRecord

logger = logging.getLogger("aion.obsidian.rebuilder")


class RebuildReport(BaseModel):
    tenant: str
    source: str
    memories_restored: int
    knowledge_restored: int
    decisions_restored: int
    errors_skipped: int
    duration_seconds: float


class _SQLiteWriter:
    """Encapsula inserções diretas no SQLite com INSERT OR IGNORE."""

    @staticmethod
    async def _changed(conn) -> bool:
        cursor = await conn.execute("SELECT changes()")
        row = await cursor.fetchone()
        return row is not None and row[0] > 0

    @staticmethod
    async def insert_memory(
        conn, record: VaultRecord,
    ) -> bool:
        try:
            metadata_json = None
            if record.metadata is not None:
                metadata_json = json.dumps(record.metadata, ensure_ascii=False)
            await conn.execute(
                """INSERT OR IGNORE INTO memories
                   (id, app_id, content, type, metadata, confidence, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    record.id,
                    record.tenant,
                    record.content,
                    record.type,
                    metadata_json,
                    record.confidence or 1.0,
                    record.created_at or "",
                ),
            )
            return await _SQLiteWriter._changed(conn)
        except Exception as e:
            logger.warning("Failed to insert memory %s: %s", record.id, e)
            return False

    @staticmethod
    async def insert_knowledge(
        conn, record: VaultRecord,
    ) -> bool:
        try:
            tags_json = json.dumps(record.tags or [], ensure_ascii=False)
            await conn.execute(
                """INSERT OR IGNORE INTO knowledge
                   (id, app_id, content, tags, confidence, expires_at, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    record.id,
                    record.tenant,
                    record.content,
                    tags_json,
                    record.confidence or 1.0,
                    None,
                    record.created_at or "",
                ),
            )
            return await _SQLiteWriter._changed(conn)
        except Exception as e:
            logger.warning("Failed to insert knowledge %s: %s", record.id, e)
            return False

    @staticmethod
    async def insert_decision(
        conn, record: VaultRecord,
    ) -> bool:
        try:
            await conn.execute(
                """INSERT OR IGNORE INTO decisions
                   (id, app_id, content, reasoning, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    record.id,
                    record.tenant,
                    record.content,
                    record.reasoning or "",
                    record.created_at or "",
                ),
            )
            return await _SQLiteWriter._changed(conn)
        except Exception as e:
            logger.warning("Failed to insert decision %s: %s", record.id, e)
            return False


async def rebuild_from_vault(
    app_id: str,
    source: str = "auto",
    include_chroma: bool = True,
) -> RebuildReport:
    start = time.monotonic()
    
    from aion.config import settings

    memories = []
    knowledge = []
    decisions = []
    used_source = ""
    
    # Tentativa de reconstrução via Supabase (Warm Storage)
    if source in ("auto", "supabase"):
        if settings.SUPABASE_ENABLED and settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
            try:
                from aion.memory.supabase_store import SupabaseStore
                store = SupabaseStore(app_id, settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
                data = await store.pull_all(app_id)
                for m in data.get("memories", []):
                    memories.append(VaultRecord(id=m["id"], tenant=m["app_id"], type="memory", content=m["content"], confidence=m.get("confidence", 1.0), created_at=m.get("created_at"), metadata=m.get("metadata"), file_path="supabase"))
                for k in data.get("knowledge", []):
                    knowledge.append(VaultRecord(id=k["id"], tenant=k["app_id"], type="knowledge", content=k["content"], confidence=k.get("confidence", 1.0), created_at=k.get("created_at"), tags=k.get("tags"), file_path="supabase"))
                for d in data.get("decisions", []):
                    decisions.append(VaultRecord(id=d["id"], tenant=d["app_id"], type="decision", content=d["content"], reasoning=d.get("reasoning"), created_at=d.get("created_at"), file_path="supabase"))
                used_source = "supabase"
            except Exception as e:
                logger.warning("Failed to pull from Supabase for rebuild '%s': %s", app_id, e)
                if source == "supabase":
                    raise Exception(f"Supabase rebuild failed: {e}")
        else:
            if source == "supabase":
                raise Exception("Supabase is not configured or disabled.")
                
    # Fallback para Obsidian (Cold Storage)
    if source == "obsidian" or (source == "auto" and not used_source):
        try:
            records = read_all(app_id)
            memories = [r for r in records if r.type == "memory"]
            knowledge = [r for r in records if r.type == "knowledge"]
            decisions = [r for r in records if r.type == "decision"]
            used_source = "obsidian"
        except Exception as e:
            logger.warning("Failed to read from Obsidian vault for rebuild '%s': %s", app_id, e)
            if source == "obsidian":
                raise Exception(f"Obsidian rebuild failed: {e}")
            if source == "auto":
                raise Exception(f"Auto rebuild failed for both Supabase and Obsidian: {e}")

    await provision_tenant(app_id)

    mem_restored = 0
    know_restored = 0
    dec_restored = 0
    errors = 0

    async with tenant_db_connection(app_id) as conn:
        for r in memories:
            ok = await _SQLiteWriter.insert_memory(conn, r)
            if ok:
                mem_restored += 1
            else:
                errors += 1
        for r in knowledge:
            ok = await _SQLiteWriter.insert_knowledge(conn, r)
            if ok:
                know_restored += 1
            else:
                errors += 1
        for r in decisions:
            ok = await _SQLiteWriter.insert_decision(conn, r)
            if ok:
                dec_restored += 1
            else:
                errors += 1
        await conn.commit()

    if include_chroma and (memories or knowledge):
        try:
            await _rebuild_chroma(app_id, memories, knowledge)
        except Exception as e:
            logger.warning("ChromaDB rebuild skipped for '%s': %s", app_id, e)

    elapsed = time.monotonic() - start
    report = RebuildReport(
        tenant=app_id,
        source=used_source,
        memories_restored=mem_restored,
        knowledge_restored=know_restored,
        decisions_restored=dec_restored,
        errors_skipped=errors,
        duration_seconds=round(elapsed, 3),
    )
    logger.info("Rebuild complete for '%s' using '%s': %s", app_id, used_source, report.model_dump())
    return report


async def _rebuild_chroma(
    app_id: str,
    memories: List[VaultRecord],
    knowledge: List[VaultRecord],
) -> None:
    from aion.memory.embeddings import embed_batch
    from aion.memory.vector_store import add_memory, add_knowledge

    if memories:
        texts = [r.content for r in memories]
        embeddings = await embed_batch(texts)
        for r, emb in zip(memories, embeddings):
            meta = {"type": "memory", "source_id": r.id}
            if r.metadata:
                meta.update(r.metadata)
            await add_memory(app_id, r.id, r.content, emb, metadata=meta)

    if knowledge:
        texts = [r.content for r in knowledge]
        embeddings = await embed_batch(texts)
        for r, emb in zip(knowledge, embeddings):
            meta = {"type": "knowledge", "source_id": r.id}
            await add_knowledge(app_id, r.id, r.content, emb, metadata=meta)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Reconstrói SQLite + ChromaDB a partir dos arquivos .md do Obsidian vault."
    )
    parser.add_argument(
        "--tenant",
        required=True,
        help="Identificador do tenant (app_id) para reconstruir.",
    )
    parser.add_argument(
        "--no-chroma",
        action="store_true",
        help="Pula a reconstrução do ChromaDB (apenas SQLite).",
    )
    args = parser.parse_args()

    async def _main():
        report = await rebuild_from_vault(
            args.tenant,
            include_chroma=not args.no_chroma,
        )
        print(report.model_dump_json(indent=2))

    asyncio.run(_main())
