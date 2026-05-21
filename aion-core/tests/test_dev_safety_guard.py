import pytest
import os
from aion.dev.safety_guard import (
    is_sensitive_path,
    check_for_secrets,
    block_dangerous_command,
    validate_project_path,
    require_confirmation_for_destructive_action
)

def test_sensitive_path_detection():
    # Caminhos normais
    assert not is_sensitive_path("src/aion/main.py")
    assert not is_sensitive_path("scripts/setup.py")
    
    # Caminhos contendo .env
    assert is_sensitive_path(".env")
    assert is_sensitive_path("src/.env.production")
    assert is_sensitive_path("env")
    
    # Caminhos de segredos, bancos ou chaves
    assert is_sensitive_path("db/production.sqlite")
    assert is_sensitive_path("data/tenant_a.db")
    assert is_sensitive_path("credentials.json")
    assert is_sensitive_path("keys/private.pem")
    assert is_sensitive_path("id_rsa")

def test_secret_detection():
    assert not check_for_secrets("print('Hello World')")
    
    # Assignment de chaves
    assert check_for_secrets("OPENAI_API_KEY = 'sk-proj-1234'")
    assert check_for_secrets("secret_key: \"supersecret\"")
    assert check_for_secrets("password='my-custom-pass'")
    
    # Bearer tokens e chaves privadas
    assert check_for_secrets("Authorization: Bearer mytoken123")
    assert check_for_secrets("-----BEGIN RSA PRIVATE KEY-----")

def test_dangerous_commands_blocking():
    # Comandos seguros permitidos
    assert not block_dangerous_command("npm run build")
    assert not block_dangerous_command("pytest tests/")
    assert not block_dangerous_command("git status")
    assert not block_dangerous_command("git diff --stat")
    
    # Comandos perigosos bloqueados
    assert block_dangerous_command("rm -rf /")
    assert block_dangerous_command("del /s /q files")
    assert block_dangerous_command("git reset --hard")
    assert block_dangerous_command("git clean -fd")
    assert block_dangerous_command("git push --force")
    assert block_dangerous_command("npm publish")
    assert block_dangerous_command("pip upload")
    assert block_dangerous_command("docker system prune")
    
    # Comando com arquivo sensivel embutido
    assert block_dangerous_command("cat .env")
    assert block_dangerous_command("echo OPENAI_API_KEY='sk-123'")

def test_project_path_validation(tmp_path):
    # Diretório válido
    proj_dir = tmp_path / "my_project"
    proj_dir.mkdir()
    assert validate_project_path(str(proj_dir))
    
    # Arquivo não é diretório
    some_file = tmp_path / "file.txt"
    some_file.write_text("hello")
    assert not validate_project_path(str(some_file))
    
    # Inexistente
    assert not validate_project_path(str(tmp_path / "non_existent"))
    
    # Sensível
    env_dir = tmp_path / ".env.conf"
    env_dir.mkdir()
    assert not validate_project_path(str(env_dir))

def test_require_confirmation():
    assert not require_confirmation_for_destructive_action("build")
    assert require_confirmation_for_destructive_action("clean build cache")
    assert require_confirmation_for_destructive_action("delete this item")
    assert require_confirmation_for_destructive_action("git reset modifications")
