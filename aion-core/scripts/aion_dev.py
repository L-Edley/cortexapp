import sys
import argparse
import asyncio
import os
from typing import Optional

# Setup PYTHONPATH safely if run directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from aion.dev.dev_mode import (
    analyze_repository,
    create_dev_plan,
    review_code_changes,
    run_validation_commands,
    save_technical_lesson
)
from aion.dev.safety_guard import block_dangerous_command

async def handle_analyze(args):
    try:
        print(f"[*] Analyzing repository at: {args.project_path} ...")
        res = await analyze_repository(args.app_id, args.project_path)
        
        # Git status warning
        git_status = res.git_status
        if git_status.get("has_changes", False):
            print("\n[WARNING] Git has uncommitted changes!")
            print(f"Branch: {git_status.get('branch')}")
            print(f"Modified files: {git_status.get('modified')}")
            print(f"Untracked files: {git_status.get('untracked')}\n")
            
        print("=== Analysis Report ===")
        print(f"Project: {res.project_name}")
        print(f"Language: {res.stack.get('language')}")
        print(f"Framework: {res.stack.get('framework')}")
        print(f"Key Files: {res.key_files}")
        print(f"Architecture Summary:\n{res.architecture_summary}")
        print(f"Risks:\n{res.risks}")
        print(f"Suggested Next Steps:\n{res.suggested_next_steps}")
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] Analyze failed: {e}", file=sys.stderr)
        sys.exit(1)

async def handle_plan(args):
    if not args.goal:
        print("[ERROR] Please provide --goal for the development plan.", file=sys.stderr)
        sys.exit(1)
    try:
        print(f"[*] Creating plan for: '{args.goal}' ...")
        res = await create_dev_plan(args.app_id, args.goal, args.project_path)
        print("\n=== Technical Development Plan ===")
        print(f"Summary: {res.summary}")
        print("Steps:")
        for step in res.steps:
            print(f"  - {step}")
        print(f"Inspect files: {res.files_to_inspect}")
        print(f"Modify files: {res.files_to_modify}")
        print(f"Tests to run: {res.tests_to_run}")
        print(f"Risks: {res.risks}")
        print("\n=== OpenCode Prompt Instruction ===")
        print(res.opencode_prompt)
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] Plan failed: {e}", file=sys.stderr)
        sys.exit(1)

async def handle_review(args):
    try:
        print(f"[*] Reviewing repository changes at: {args.project_path} ...")
        res = await review_code_changes(args.app_id, args.project_path)
        print("\n=== Code Review Report ===")
        print(f"Changed Files: {res.changed_files}")
        print(f"Risk Level: {res.risk_level.upper()}")
        print("Findings:")
        for f in res.findings:
            print(f"  - {f}")
        print("Suggested Fixes:")
        for fix in res.suggested_fixes:
            print(f"  - {fix}")
        print(f"Recommended Tests: {res.tests_recommended}")
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] Review failed: {e}", file=sys.stderr)
        sys.exit(1)

async def handle_validate(args):
    if not args.command:
        print("[ERROR] Please provide a --command to execute.", file=sys.stderr)
        sys.exit(1)
        
    cmd_strip = args.command.strip()
    if block_dangerous_command(cmd_strip):
        print(f"[SECURITY ERROR] Command '{cmd_strip}' is blocked by Safety Guard.", file=sys.stderr)
        sys.exit(1)
        
    try:
        print(f"[*] Running safe validation command: '{cmd_strip}' ...")
        res = await run_validation_commands(args.project_path, [cmd_strip])
        print("\n=== Validation Report ===")
        print(f"Passed: {res.passed}")
        print(f"Failed commands: {res.failed}")
        print(f"Logs Summary:\n{res.logs_summary}")
        if res.next_fix:
            print(f"\n[Advice] Next fix suggestion: {res.next_fix}")
        sys.exit(0 if res.passed else 1)
    except Exception as e:
        print(f"[ERROR] Validation command failed: {e}", file=sys.stderr)
        sys.exit(1)

async def handle_save_lesson(args):
    if not args.title or not args.file:
        print("[ERROR] Please provide --title and --file to save the lesson.", file=sys.stderr)
        sys.exit(1)
        
    if not os.path.exists(args.file):
        print(f"[ERROR] File not found: {args.file}", file=sys.stderr)
        sys.exit(1)
        
    try:
        print(f"[*] Reading technical lesson from {args.file} ...")
        with open(args.file, "r", encoding="utf-8") as f:
            content = f.read()
            
        lesson = {
            "title": args.title,
            "content": content,
            "summary": f"Lição técnica sobre {args.title} importada via CLI.",
            "tags": ["cli", "import"],
            "confidence": 0.95
        }
        
        saved_id = await save_technical_lesson(args.app_id, lesson)
        if saved_id:
            print(f"[+] Technical lesson saved successfully with ID: {saved_id}")
            sys.exit(0)
        else:
            print("[ERROR] Failed to save lesson. Secret data detected or save rejected.", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Save-lesson failed: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="AION Intelligence Core - Developer Mode CLI")
    subparsers = parser.add_subparsers(dest="action", help="Disponíveis comandos")
    
    # Analyze
    parser_analyze = subparsers.add_parser("analyze", help="Analisa a estrutura do projeto, stack e git status")
    parser_analyze.add_argument("--app-id", default="cortex", help="ID do tenant")
    parser_analyze.add_argument("--project-path", default=".", help="Caminho do repositório a analisar")
    
    # Plan
    parser_plan = subparsers.add_parser("plan", help="Gera um plano de desenvolvimento técnico e prompt para o OpenCode")
    parser_plan.add_argument("--app-id", default="cortex", help="ID do tenant")
    parser_plan.add_argument("--project-path", default=".", help="Caminho do repositório")
    parser_plan.add_argument("--goal", required=True, help="O objetivo ou funcionalidade a ser implementada")
    
    # Review
    parser_review = subparsers.add_parser("review", help="Revisa modificações de código e git diff de forma técnica")
    parser_review.add_argument("--app-id", default="cortex", help="ID do tenant")
    parser_review.add_argument("--project-path", default=".", help="Caminho do repositório")
    
    # Validate
    parser_validate = subparsers.add_parser("validate", help="Executa comando de validação/teste seguro no diretório")
    parser_validate.add_argument("--project-path", default=".", help="Caminho do repositório")
    parser_validate.add_argument("--command", required=True, help="O comando de validação ou teste a rodar")
    
    # Save Lesson
    parser_save = subparsers.add_parser("save-lesson", help="Importa arquivo e salva como lição de desenvolvimento no cérebro")
    parser_save.add_argument("--app-id", default="cortex", help="ID do tenant")
    parser_save.add_argument("--title", required=True, help="Título da lição técnica")
    parser_save.add_argument("--file", required=True, help="Caminho do arquivo contendo o conteúdo da lição")
    
    args = parser.parse_args()
    
    if not args.action:
        parser.print_help()
        sys.exit(1)
        
    loop = asyncio.get_event_loop()
    if args.action == "analyze":
        loop.run_until_complete(handle_analyze(args))
    elif args.action == "plan":
        loop.run_until_complete(handle_plan(args))
    elif args.action == "review":
        loop.run_until_complete(handle_review(args))
    elif args.action == "validate":
        loop.run_until_complete(handle_validate(args))
    elif args.action == "save-lesson":
        loop.run_until_complete(handle_save_lesson(args))

if __name__ == "__main__":
    main()
