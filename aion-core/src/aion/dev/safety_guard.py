import os
import re

def is_sensitive_path(path: str) -> bool:
    """
    Bloqueia caminhos que contêm arquivos de configuração .env, bancos de dados,
    credenciais, cookies ou arquivos de chave privada.
    """
    if not path:
        return True
    
    norm_path = path.replace("\\", "/").lower()
    filename = os.path.basename(norm_path)
    
    # Bloquear arquivos .env
    if ".env" in filename or filename == "env":
        return True
        
    # Padrões sensíveis explicitamente bloqueados
    sensitive_patterns = [
        r"secret", r"token", r"key", r"credential", r"cookie", r"password",
        r"\.sqlite", r"\.db", r"\.config", r"\.json_key", r"credentials",
        r"\.pem", r"\.id_rsa", r"id_rsa"
    ]
    
    # Determinar qual parte do caminho deve ser validada para evitar falsos positivos
    # em diretórios pai como pastas de usuário (ex: /Users/monkey) ou pastas temporárias
    check_path = norm_path
    try:
        if os.path.isabs(path):
            try:
                rel_path = os.path.relpath(path)
                if not rel_path.startswith(".."):
                    check_path = rel_path.replace("\\", "/").lower()
                else:
                    # Se fora do CWD, tentar relativo ao home do usuário
                    home = os.path.expanduser("~")
                    rel_to_home = os.path.relpath(path, home)
                    if not rel_to_home.startswith(".."):
                        parts = rel_to_home.replace("\\", "/").split("/")
                        check_path = "/".join(parts[1:]) if len(parts) > 1 else rel_to_home.lower()
                    else:
                        check_path = filename
            except Exception:
                check_path = filename
    except Exception:
        check_path = filename
        
    for pat in sensitive_patterns:
        if re.search(pat, check_path):
            return True
            
    return False

def check_for_secrets(text: str) -> bool:
    """
    Varre o texto em busca de chaves privadas, senhas ou tokens de API expostos.
    """
    if not text:
        return False
        
    text_lower = text.lower()
    
    # Padrões comuns de segredos
    patterns = [
        r"bearer\s+[a-za-z0-9\-\._~\+\/]+=*",
        r"secret[_-]?key\s*[:=]\s*['\"][^'\"]+['\"]",
        r"password\s*[:=]\s*['\"][^'\"]+['\"]",
        r"api[_-]?key\s*[:=]\s*['\"][^'\"]+['\"]",
        r"aws[_-]?key\s*[:=]\s*['\"][^'\"]+['\"]",
        r"jwt[_-]?token\s*[:=]\s*['\"][^'\"]+['\"]",
        r"ai_key\s*[:=]",
        r"gemini_api_key\s*[:=]",
        r"openai_api_key\s*[:=]",
        r"groq_api_key\s*[:=]",
        r"supabase_service_key\s*[:=]",
        r"-----begin\s+.*private\s+key-----"
    ]
    
    for pat in patterns:
        if re.search(pat, text_lower):
            return True
            
    if "private key" in text_lower or "private_key" in text_lower:
        return True
        
    return False

def block_dangerous_command(command: str) -> bool:
    """
    Bloqueia comandos potencialmente perigosos ou destrutivos.
    """
    if not command:
        return True
        
    cmd_clean = command.strip().lower()
    
    dangerous_commands = [
        "rm -rf", "del /s", "del /f", "git reset --hard", "git clean -fd",
        "git push --force", "git push -f", "npm publish", "pip upload",
        "docker system prune", "format "
    ]
    
    for dc in dangerous_commands:
        if dc in cmd_clean:
            return True
            
    # Bloquear comandos que fazem referência a arquivos .env
    if ".env" in cmd_clean:
        return True
        
    # Verificar se o próprio comando contém segredos embutidos
    if check_for_secrets(command):
        return True
        
    return False

def validate_project_path(project_path: str) -> bool:
    """
    Valida se o caminho do projeto é seguro e existe.
    Previne Path Traversal e vazamento de diretórios privados.
    """
    if not project_path:
        return False
    try:
        abs_path = os.path.abspath(project_path)
        
        # Validar existência e se é um diretório
        if not os.path.exists(abs_path) or not os.path.isdir(abs_path):
            return False
            
        # Bloquear traversal óbvio
        parts = abs_path.split(os.sep)
        if ".." in parts or "." in parts:
            return False
            
        # Verificar se o próprio caminho é sensível
        if is_sensitive_path(abs_path):
            return False
            
        return True
    except Exception:
        return False

def require_confirmation_for_destructive_action(action: str) -> bool:
    """
    Retorna True se a ação descrita for de natureza destrutiva e necessitar confirmação.
    """
    if not action:
        return False
        
    act_lower = action.lower()
    destructive_keywords = ["delete", "clean", "reset", "remove", "prune", "force"]
    
    for kw in destructive_keywords:
        if kw in act_lower:
            return True
            
    return False
