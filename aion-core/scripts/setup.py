#!/usr/bin/env python3
import sys
import os
import json
import secrets
import asyncio
import argparse
from pathlib import Path

# Add aion-core/src to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from aion.memory import sqlite_store

SUPABASE_SCHEMA_SQL = """
-- Executar no SQL Editor do Supabase para provisionar as tabelas do AION

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.aion_memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      TEXT NOT NULL,
  content     TEXT NOT NULL,
  type        TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}'::jsonb,
  confidence  FLOAT NOT NULL DEFAULT 1.0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.aion_knowledge (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      TEXT NOT NULL,
  content     TEXT NOT NULL,
  tags        JSONB DEFAULT '[]'::jsonb,
  confidence  FLOAT NOT NULL DEFAULT 1.0,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.aion_decisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      TEXT NOT NULL,
  content     TEXT NOT NULL,
  reasoning   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.aion_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aion_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aion_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_memories ON public.aion_memories USING (app_id = current_setting('request.jwt.claims', true)::json->>'app_id');
CREATE POLICY tenant_isolation_knowledge ON public.aion_knowledge USING (app_id = current_setting('request.jwt.claims', true)::json->>'app_id');
CREATE POLICY tenant_isolation_decisions ON public.aion_decisions USING (app_id = current_setting('request.jwt.claims', true)::json->>'app_id');

-- Função para busca semântica
CREATE OR REPLACE FUNCTION public.match_aion_memories(
  query_embedding vector(384),
  match_count int,
  filter_app_id text
) RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    aion_memories.id,
    aion_memories.content,
    1 - (aion_memories.embedding <=> query_embedding) AS similarity
  FROM aion_memories
  WHERE app_id = filter_app_id
  ORDER BY aion_memories.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
"""

def generate_token() -> str:
    return "tok_" + secrets.token_urlsafe(32)

def prompt_input(prompt_text: str, required: bool = False, default: str = "") -> str:
    prompt = f"{prompt_text} "
    if default:
        prompt += f"[{default}] "
    elif not required:
        prompt += "(opcional) "
        
    while True:
        val = input(prompt).strip()
        if not val and default:
            return default
        if not val and required:
            print("Este campo é obrigatório.")
        else:
            return val

async def do_init():
    print("=== AION Setup: Inicializar Novo App ===")
    app_id = prompt_input("App ID (ex: cortex):", required=True)
    supabase_url = prompt_input("Supabase URL:")
    supabase_key = prompt_input("Supabase Service Key:")
    obsidian_vault = prompt_input("Obsidian Vault Path:")

    print("\n[1/5] Gerando Bearer Token...")
    token = generate_token()

    print("[2/5] Provisionando banco SQLite local...")
    await sqlite_store.provision_tenant(app_id)

    if obsidian_vault:
        print("[3/5] Criando pasta no Obsidian...")
        obsidian_app_dir = os.path.join(obsidian_vault, app_id)
        os.makedirs(os.path.join(obsidian_app_dir, "memory"), exist_ok=True)
        os.makedirs(os.path.join(obsidian_app_dir, "knowledge"), exist_ok=True)
        os.makedirs(os.path.join(obsidian_app_dir, "decisions"), exist_ok=True)
        os.makedirs(os.path.join(obsidian_app_dir, "actions"), exist_ok=True)
    else:
        print("[3/5] Pulando configuração do Obsidian.")

    print(f"[4/5] Salvando .env.aion.{app_id} ...")
    env_content = [
        "AION_CORE_URL=http://localhost:8000",
        f"AION_APP_ID={app_id}",
        f"AION_API_KEY={token}",
    ]
    if supabase_url and supabase_key:
        env_content.extend([
            f"SUPABASE_URL={supabase_url}",
            f"SUPABASE_SERVICE_KEY={supabase_key}",
            "SUPABASE_ENABLED=true"
        ])
    if obsidian_vault:
        env_content.append(f"OBSIDIAN_VAULT_PATH={obsidian_vault}")

    env_path = f".env.aion.{app_id}"
    with open(env_path, "w") as f:
        f.write("\n".join(env_content) + "\n")

    print("[5/5] Finalizando...")
    
    print("\n=== Resumo e Próximos Passos ===")
    print(f"- SQLite configurado localmente.")
    if obsidian_vault:
        print(f"- Obsidian vault preparado em {obsidian_vault}/{app_id}.")
    if supabase_url:
        print("- Supabase configurado nas variáveis.")
        print("\n!!! AÇÃO NECESSÁRIA !!!")
        print("Para que o Supabase funcione, execute o código SQL abaixo no 'SQL Editor' do seu painel Supabase:\n")
        print(SUPABASE_SCHEMA_SQL)
    print("\nO arquivo", env_path, "foi gerado. Inclua as variáveis no seu aplicativo cliente.")


def load_env_for_app(app_id: str) -> dict:
    env_path = f".env.aion.{app_id}"
    config = {}
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                key, val = line.split("=", 1)
                config[key] = val
    return config

async def do_status(app_id: str):
    print(f"=== AION Status: {app_id} ===")
    config = load_env_for_app(app_id)
    
    # SQLite
    sqlite_ok = await sqlite_store.is_tenant_provisioned(app_id)
    sqlite_counts = {"memories": 0, "knowledge": 0, "decisions": 0}
    if sqlite_ok:
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            for tbl in sqlite_counts.keys():
                try:
                    c = await conn.execute(f"SELECT COUNT(*) FROM {tbl} WHERE app_id = ?", (app_id,))
                    sqlite_counts[tbl] = (await c.fetchone())[0]
                except Exception:
                    pass
    
    print(f"SQLite (Hot): {'OK' if sqlite_ok else 'MISSING'}")
    if sqlite_ok:
        print(f"  - Registros: {sqlite_counts['memories']} memories | {sqlite_counts['knowledge']} knowledge | {sqlite_counts['decisions']} decisions")

    # Supabase
    supa_enabled = config.get("SUPABASE_ENABLED", "false").lower() == "true"
    supa_url = config.get("SUPABASE_URL", "")
    supa_key = config.get("SUPABASE_SERVICE_KEY", "")
    
    if supa_enabled and supa_url and supa_key:
        try:
            from supabase import create_client
            client = create_client(supa_url, supa_key)
            # count directly
            mem_count = client.table("aion_memories").select("id", count="exact").eq("app_id", app_id).execute().count
            know_count = client.table("aion_knowledge").select("id", count="exact").eq("app_id", app_id).execute().count
            dec_count = client.table("aion_decisions").select("id", count="exact").eq("app_id", app_id).execute().count
            print(f"Supabase (Warm): OK")
            print(f"  - Registros: {mem_count} memories | {know_count} knowledge | {dec_count} decisions")
        except Exception as e:
            print(f"Supabase (Warm): OFFLINE ({e})")
    else:
        print(f"Supabase (Warm): NOT CONFIGURED")

    # Obsidian
    obsidian_path = config.get("OBSIDIAN_VAULT_PATH", "")
    if obsidian_path:
        target = os.path.join(obsidian_path, app_id)
        if os.path.isdir(target):
            count_md = len(list(Path(target).rglob("*.md")))
            print(f"Obsidian (Cold): OK")
            print(f"  - Registros: {count_md} arquivos markdown")
        else:
            print(f"Obsidian (Cold): MISSING (Pasta {target} não encontrada)")
    else:
        print(f"Obsidian (Cold): NOT CONFIGURED")

async def do_rebuild(app_id: str):
    print(f"=== AION Rebuild: {app_id} ===")
    config = load_env_for_app(app_id)
    
    supa_enabled = config.get("SUPABASE_ENABLED", "false").lower() == "true"
    supa_url = config.get("SUPABASE_URL", "")
    supa_key = config.get("SUPABASE_SERVICE_KEY", "")
    
    if not (supa_enabled and supa_url and supa_key):
        print("Rebuild requer Supabase configurado e online. Reconstrução via Obsidian ainda não implementada.")
        return
        
    try:
        from supabase import create_client
        client = create_client(supa_url, supa_key)
        
        memories = client.table("aion_memories").select("*").eq("app_id", app_id).execute().data
        knowledge = client.table("aion_knowledge").select("*").eq("app_id", app_id).execute().data
        decisions = client.table("aion_decisions").select("*").eq("app_id", app_id).execute().data
        
        await sqlite_store.provision_tenant(app_id)
        
        # Override local with remote
        async with sqlite_store.tenant_db_connection(app_id) as conn:
            # Memories
            for m in memories:
                metadata_str = json.dumps(m.get("metadata", {}))
                await conn.execute(
                    "INSERT OR REPLACE INTO memories (id, app_id, content, type, metadata, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (m["id"], m["app_id"], m["content"], m["type"], metadata_str, m["confidence"], m["created_at"])
                )
            
            # Knowledge
            for k in knowledge:
                tags_str = json.dumps(k.get("tags", []))
                await conn.execute(
                    "INSERT OR REPLACE INTO knowledge (id, app_id, content, tags, confidence, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (k["id"], k["app_id"], k["content"], tags_str, k["confidence"], k["expires_at"], k["created_at"])
                )
                
            # Decisions
            for d in decisions:
                await conn.execute(
                    "INSERT OR REPLACE INTO decisions (id, app_id, content, reasoning, created_at) VALUES (?, ?, ?, ?, ?)",
                    (d["id"], d["app_id"], d["content"], d["reasoning"], d["created_at"])
                )
            
            await conn.commit()
            
        print(f"Rebuild completo com sucesso!")
        print(f"Restaurados: {len(memories)} memories | {len(knowledge)} knowledge | {len(decisions)} decisions")
        
    except Exception as e:
        print(f"Falha ao reconstruir a partir do Supabase: {e}")

def main():
    parser = argparse.ArgumentParser(description="AION Intelligence Core Setup CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # init
    parser_init = subparsers.add_parser("init", help="Inicializa a configuração de um novo App.")
    
    # status
    parser_status = subparsers.add_parser("status", help="Verifica o status de armazenamento de um App.")
    parser_status.add_argument("--app-id", required=True, help="App ID a ser verificado.")
    
    # rebuild
    parser_rebuild = subparsers.add_parser("rebuild", help="Reconstrói o SQLite local a partir do Warm/Cold storage.")
    parser_rebuild.add_argument("--app-id", required=True, help="App ID a ser reconstruído.")
    
    args = parser.parse_args()
    
    if args.command == "init":
        asyncio.run(do_init())
    elif args.command == "status":
        asyncio.run(do_status(args.app_id))
    elif args.command == "rebuild":
        asyncio.run(do_rebuild(args.app_id))

if __name__ == "__main__":
    main()
