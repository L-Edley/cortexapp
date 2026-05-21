#!/usr/bin/env python
import argparse
import asyncio
import os
import sys

# Garante que o diretorio 'src' esta no python path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from aion.study.teacher_adapters import ask_teacher, import_opencode_lesson, save_teacher_answer

async def run_ask(args):
    print(f"Consultando o professor '{args.teacher}' sobre: '{args.topic}'...")
    try:
        ans = await ask_teacher(args.teacher, args.topic)
        
        print("\n=== RESPOSTA DO PROFESSOR ===")
        print(f"Provider: {ans.provider}")
        print(f"Confiança: {ans.confidence:.2f}")
        print(f"Should Save: {ans.should_save}")
        print(f"Warnings: {ans.warnings}")
        print("\n--- RESUMO ---")
        print(ans.summary)
        print("\n--- RESPOSTA COMPLETA ---")
        print(ans.answer)
        print("=============================")
        
        if args.save:
            if not args.app_id:
                print("Erro: --app-id é obrigatório para salvar a resposta.")
                sys.exit(1)
            print(f"\nSalvando resposta no cérebro do tenant '{args.app_id}'...")
            k_id = await save_teacher_answer(args.app_id, ans, tags=args.tags)
            if k_id:
                print(f"Sucesso! Conhecimento salvo com o ID: {k_id}")
            else:
                print("Erro: Falha ao salvar a resposta (verifique se contém dados sensíveis).")
                sys.exit(1)
    except Exception as e:
        print(f"Erro ao consultar o professor: {e}", file=sys.stderr)
        sys.exit(1)

async def run_import(args):
    print(f"Importando lição '{args.file}' da fonte '{args.source}' para o tenant '{args.app_id}'...")
    try:
        ans = await import_opencode_lesson(args.app_id, args.file)
        
        print("\n=== LIÇÃO IMPORTADA ===")
        print(f"Provider: {ans.provider}")
        print(f"Confiança: {ans.confidence:.2f}")
        print(f"Tags: {ans.tags}")
        print(f"Warnings: {ans.warnings}")
        print("\n--- RESUMO ---")
        print(ans.summary)
        print("========================")
        
        if args.save:
            print(f"\nSalvando lição no cérebro do tenant '{args.app_id}'...")
            k_id = await save_teacher_answer(args.app_id, ans)
            if k_id:
                print(f"Sucesso! Conhecimento salvo com o ID: {k_id}")
            else:
                print("Erro: Falha ao salvar a lição importada (verifique se contém dados sensíveis).")
                sys.exit(1)
    except PermissionError as pe:
        print(f"Erro de Segurança (Permissão): {pe}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError as fnfe:
        print(f"Erro: Arquivo não encontrado: {fnfe}", file=sys.stderr)
        sys.exit(1)
    except ValueError as ve:
        print(f"Erro de Validação: {ve}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Erro ao importar lição: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="CLI de Ensino e Aprendizado do AION Core (Teacher Adapters).")
    subparsers = parser.add_subparsers(dest="command", help="Comando a ser executado")
    
    # Subcomando: ask
    parser_ask = subparsers.add_parser("ask", help="Fazer uma pergunta a um professor")
    parser_ask.add_argument("--teacher", required=True, help="Ollama, Groq, Gemini ou auto")
    parser_ask.add_argument("--topic", required=True, help="Tópico ou pergunta")
    parser_ask.add_argument("--app-id", help="Tenant ID para salvar o conhecimento")
    parser_ask.add_argument("--save", action="store_true", help="Salva a resposta no cérebro local")
    parser_ask.add_argument("--tags", nargs="*", default=[], help="Tags adicionais para salvar")
    
    # Subcomando: import
    parser_import = subparsers.add_parser("import", help="Importar lição estruturada")
    parser_import.add_argument("--app-id", required=True, help="Tenant ID da importação")
    parser_import.add_argument("--file", required=True, help="Caminho do arquivo (.md, .json, .txt)")
    parser_import.add_argument("--source", default="opencode", help="Fonte da lição (default: opencode)")
    parser_import.add_argument("--save", action="store_true", help="Salva a lição no cérebro local")
    
    args = parser.parse_args()
    
    if args.command == "ask":
        asyncio.run(run_ask(args))
    elif args.command == "import":
        asyncio.run(run_import(args))
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
