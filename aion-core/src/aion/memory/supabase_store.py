import asyncio
import logging
from typing import List, Dict, Any, Optional
from supabase import create_client, Client

logger = logging.getLogger("aion.memory.supabase_store")

class SupabaseStore:
    def __init__(self, app_id: str, supabase_url: str, supabase_key: str):
        self.app_id = app_id
        try:
            self.client: Client = create_client(supabase_url, supabase_key)
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client for {app_id}: {e}")
            self.client = None

    async def sync_memory(self, memory_id: str, content: str, type: str, metadata: Optional[Dict[str, Any]], confidence: float = 1.0) -> None:
        if not self.client:
            return
            
        data = {
            "id": memory_id,
            "app_id": self.app_id,
            "content": content,
            "type": type,
            "metadata": metadata or {},
            "confidence": confidence
        }
        
        def _execute():
            self.client.table("aion_memories").upsert(data).execute()

        try:
            await asyncio.to_thread(_execute)
            logger.debug(f"Synced memory {memory_id} to Supabase for tenant {self.app_id}")
        except Exception as e:
            logger.warning(f"Failed to sync memory {memory_id} to Supabase: {e}")

    async def sync_knowledge(self, knowledge_id: str, content: str, tags: List[str], confidence: float = 1.0, expires_at: Optional[str] = None) -> None:
        if not self.client:
            return
            
        data = {
            "id": knowledge_id,
            "app_id": self.app_id,
            "content": content,
            "tags": tags or [],
            "confidence": confidence,
            "expires_at": expires_at
        }
        
        def _execute():
            self.client.table("aion_knowledge").upsert(data).execute()

        try:
            await asyncio.to_thread(_execute)
            logger.debug(f"Synced knowledge {knowledge_id} to Supabase for tenant {self.app_id}")
        except Exception as e:
            logger.warning(f"Failed to sync knowledge {knowledge_id} to Supabase: {e}")

    async def sync_decision(self, decision_id: str, content: str, reasoning: str) -> None:
        if not self.client:
            return
            
        data = {
            "id": decision_id,
            "app_id": self.app_id,
            "content": content,
            "reasoning": reasoning
        }
        
        def _execute():
            self.client.table("aion_decisions").upsert(data).execute()

        try:
            await asyncio.to_thread(_execute)
            logger.debug(f"Synced decision {decision_id} to Supabase for tenant {self.app_id}")
        except Exception as e:
            logger.warning(f"Failed to sync decision {decision_id} to Supabase: {e}")

    async def search_semantic(self, app_id: str, embedding: List[float], table: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Executes a semantic search using an RPC function in Supabase.
        The database should have an RPC function `match_embeddings` that accepts:
        - query_embedding (vector)
        - match_count (int)
        - filter_app_id (text)
        - target_table (text) -> handled by the RPC or separate RPCs per table.
        Assuming separate RPCs: `match_aion_memories` and `match_aion_knowledge`.
        """
        if not self.client:
            return []
            
        rpc_name = "match_aion_memories" if table == "memories" else "match_aion_knowledge"
        
        def _execute():
            return self.client.rpc(
                rpc_name, 
                {
                    "query_embedding": embedding,
                    "match_count": top_k,
                    "filter_app_id": app_id
                }
            ).execute()

        try:
            result = await asyncio.to_thread(_execute)
            return result.data if result and hasattr(result, 'data') else []
        except Exception as e:
            logger.warning(f"Failed to perform semantic search in Supabase for {app_id}: {e}")
            return []

    async def pull_all(self, app_id: str) -> Dict[str, List[Dict[str, Any]]]:
        if not self.client:
            return {"memories": [], "knowledge": [], "decisions": []}
            
        def _execute_memories():
            return self.client.table("aion_memories").select("*").eq("app_id", app_id).execute()
            
        def _execute_knowledge():
            return self.client.table("aion_knowledge").select("*").eq("app_id", app_id).execute()
            
        def _execute_decisions():
            # Fallback if aion_decisions doesn't exist yet, but assuming it does
            return self.client.table("aion_decisions").select("*").eq("app_id", app_id).execute()

        try:
            memories = await asyncio.to_thread(_execute_memories)
            knowledge = await asyncio.to_thread(_execute_knowledge)
            decisions = await asyncio.to_thread(_execute_decisions)
            
            return {
                "memories": memories.data if hasattr(memories, 'data') else [],
                "knowledge": knowledge.data if hasattr(knowledge, 'data') else [],
                "decisions": decisions.data if hasattr(decisions, 'data') else []
            }
        except Exception as e:
            logger.warning(f"Failed to pull all records from Supabase for {app_id}: {e}")
            return {"memories": [], "knowledge": [], "decisions": []}
