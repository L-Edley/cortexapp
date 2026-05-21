import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Configurações centralizadas do AION Intelligence Core.
    Carrega as variáveis de ambiente com validação estrita via Pydantic v2.
    """
    # Servidor FastAPI
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True

    # Multi-tenant SQLite
    DATABASE_DIR: str = "data/tenants"

    # IA e Provedores
    AI_PROVIDER: str = "gemini"
    AI_MODEL: str = "gemini-2.5-flash"
    GEMINI_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None

    # Obsidian Adapter
    OBSIDIAN_REST_ENABLED: bool = False
    OBSIDIAN_REST_URL: str = "http://127.0.0.1:27124"
    OBSIDIAN_REST_TOKEN: Optional[str] = None

    # Configuração de carregamento de arquivo .env
    # Carrega primeiro de aion-core/.env, ou herda as variáveis de ambiente locais do sistema
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

# Instância global singleton de configurações
settings = Settings()
