#!/usr/bin/env python3
"""
Gera um Bearer Token seguro para um novo tenant do AION Intelligence Core.

Uso:
    python generate_tenant_key.py <tenant_id>          # gera e imprime
    python generate_tenant_key.py <tenant_id> --json    # gera e imprime JSON para AION_TENANT_TOKENS
"""

import sys
import json
import secrets
import argparse


def generate_token() -> str:
    """Generate a cryptographically secure Bearer token."""
    return "tok_" + secrets.token_urlsafe(32)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a Bearer token for an AION tenant"
    )
    parser.add_argument("tenant_id", help="Tenant identifier (e.g., 'cortex')")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON snippet for AION_TENANT_TOKENS env var",
    )
    args = parser.parse_args()

    token = generate_token()

    if args.json:
        env_json = json.dumps({args.tenant_id: token})
        print(f"AION_TENANT_TOKENS={env_json}")
    else:
        print(f"Tenant:       {args.tenant_id}")
        print(f"Bearer Token: {token}")
        print()
        print("Add this to your .env or Railway/Render secrets:")
        print(f'  AION_TENANT_TOKENS={{\"{args.tenant_id}\":\"{token}\"}}')
        print(f"  Or as AION_TOKEN_{args.tenant_id.upper()}={token}")


if __name__ == "__main__":
    main()
