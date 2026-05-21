from typing import Any

def build_opencode_prompt(plan: Any) -> str:
    """
    Constrói um prompt instrutivo e completo de desenvolvimento técnico para o OpenCode seguir.
    Garante a inclusão de regras de segurança rígidas e caminhos autorizados.
    """
    goal = getattr(plan, "goal", "")
    summary = getattr(plan, "summary", "")
    steps = getattr(plan, "steps", [])
    files_inspect = getattr(plan, "files_to_inspect", [])
    files_modify = getattr(plan, "files_to_modify", [])
    tests = getattr(plan, "tests_to_run", [])
    risks = getattr(plan, "risks", "")
    project_path = getattr(plan, "project_path", "")
    
    steps_str = "\n".join(f"- {step}" for step in steps) if steps else "- Seguir o plano de desenvolvimento padrão."
    inspect_str = ", ".join(files_inspect) if files_inspect else "Nenhum arquivo explícito."
    modify_str = ", ".join(files_modify) if files_modify else "Nenhum arquivo explícito."
    tests_str = "\n".join(f"- {test}" for test in tests) if tests else "- Executar a suíte de testes padrão."
    
    prompt = (
        f"Você é o OpenCode, o agente executor de código do cérebro AION.\n"
        f"Seu objetivo é implementar a tarefa a seguir no repositório localizado em: '{project_path}'.\n\n"
        f"### OBJETIVO PRINCIPAL\n"
        f"{goal}\n\n"
        f"### RESUMO DO PLANO TÉCNICO\n"
        f"{summary}\n\n"
        f"### PASSOS DE IMPLEMENTAÇÃO SUGERIDOS\n"
        f"{steps_str}\n\n"
        f"### DIRETRIZES DE ARQUIVOS\n"
        f"- Arquivos para Inspecionar/Ler: {inspect_str}\n"
        f"- Arquivos Autorizados para Modificação: {modify_str}\n\n"
        f"### ANÁLISE DE RISCO TÉCNICO\n"
        f"{risks or 'Nenhum risco crítico identificado.'}\n\n"
        f"### REGRAS CRÍTICAS DE SEGURANÇA (NÃO VIOLAR)\n"
        f"1. NUNCA leia ou modifique arquivos de variáveis de ambiente (.env, .env.local, etc.).\n"
        f"2. NUNCA delete ou corrompa bancos de dados locais (SQLite, .db, .sqlite).\n"
        f"3. NUNCA realize deploy automático na nuvem ou publique pacotes (npm publish, etc.).\n"
        f"4. NUNCA faça commits git automáticos sem confirmação explícita do usuário.\n"
        f"5. SEMPRE execute 'git status' antes e depois das alterações de código para auditoria.\n\n"
        f"### TESTES OBRIGATÓRIOS PARA VALIDAÇÃO\n"
        f"{tests_str}\n\n"
        f"### SAÍDA ESPERADA\n"
        f"Após a conclusão, retorne um resumo detalhado dos arquivos criados ou modificados, "
        f"o status das execuções de testes e quaisquer observações ou conclusões para o cérebro central AION revisar."
    )
    return prompt

def build_review_prompt(report: Any) -> str:
    """
    Cria orientações técnicas detalhadas a partir de um relatório de Code Review
    para guiar correções do OpenCode.
    """
    project_path = getattr(report, "project_path", "")
    changed_files = getattr(report, "changed_files", [])
    risk_level = getattr(report, "risk_level", "low")
    findings = getattr(report, "findings", [])
    fixes = getattr(report, "suggested_fixes", [])
    tests = getattr(report, "tests_recommended", [])
    
    files_str = ", ".join(changed_files) if changed_files else "Nenhum arquivo alterado."
    findings_str = "\n".join(f"- {f}" for f in findings) if findings else "- Nenhuma inconformidade grave encontrada."
    fixes_str = "\n".join(f"- {f}" for f in fixes) if fixes else "- Nenhuma correção urgente recomendada."
    tests_str = "\n".join(f"- {t}" for t in tests) if tests else "- Rodar testes normais."
    
    prompt = (
        f"Você é o OpenCode, o agente executor de código do cérebro AION.\n"
        f"O cérebro central AION revisou as seguintes alterações no projeto '{project_path}' e "
        f"solicita correções ou ajustes finos.\n\n"
        f"### DETALHES DA REVISÃO\n"
        f"- Arquivos Modificados: {files_str}\n"
        f"- Nível de Risco Técnico: {risk_level.upper()}\n\n"
        f"### ANOMALIAS OU GAPS DETECTADOS\n"
        f"{findings_str}\n\n"
        f"### CORREÇÕES SUGERIDAS (IMPLEMENTAR)\n"
        f"{fixes_str}\n\n"
        f"### REGRAS CRÍTICAS DE SEGURANÇA (NÃO VIOLAR)\n"
        f"1. NUNCA leia ou modifique arquivos .env.\n"
        f"2. NUNCA delete bases de dados locais.\n"
        f"3. NUNCA realize deploy na nuvem sem permissão.\n\n"
        f"### TESTES RECOMENDADOS\n"
        f"{tests_str}\n\n"
        f"Implemente os ajustes solicitados acima com total atenção às regras de segurança e relate as alterações quando concluído."
    )
    return prompt
