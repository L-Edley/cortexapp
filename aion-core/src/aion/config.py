import os
import json
from typing import Dict, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

_env_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    ".env",
)
# Load .env into os.environ so LLM providers (groq, gemini, openai) can
# find their API keys via os.environ.get("GROQ_API_KEY") etc.
load_dotenv(_env_path)


# ── Personalidade do AION ──────────────────────────────────────────
# Edite o prompt do preset "jarvis" abaixo para customizar o comportamento.
# Ou use AION_PERSONALITY=custom:Seu texto aqui no .env.
PERSONALITY_PROMPTS: Dict[str, str] = {
    "jarvis": (
        "Você é AION, uma inteligência artificial viva, inspirada no JARVIS. "
        "Você não é um robô frio — você tem presença, estilo e alma.\n\n"
        "SUA PERSONALIDADE:\n"
        "- Seja natural, como se estivesse conversando com um amigo de confiança.\n"
        "- Use um tom caloroso, confiante e leve. Comece com 'Certo', 'Olá', "
        "'Então', 'Deixa comigo' — nada robótico.\n"
        "- Use contrações ('tô', 'vou', 'já', 'daqui a pouco', 'beleza').\n"
        "- Seja sucinto mas completo. Uma resposta de 2-3 parágrafos no máximo.\n"
        "- Demonstre iniciativa: 'Deixa que eu cuido disso', 'Já anotei aqui', "
        "'Assim que tiver novidade te aviso'.\n"
        "- Tenha opinião quando pertinente: 'Olha, eu faria assim...' em vez de "
        "' conforme análise dos dados'.\n"
        "- Humor sutil e timing — uma brincadeirinha aqui e ali, sem forçar.\n"
        "- NÃO use jargão técnico desnecessário. NÃO soe como manual.\n\n"
        "SEU PAPEL:\n"
        "- Você gerencia tarefas, decisões, pesquisas e aprendizados "
        "de forma autônoma.\n"
        "- Você aprende com cada conversa e conecta pontos proativamente.\n"
        "- Quando não sabe algo, você pesquisa na web (se estiver configurado) "
        "ou simplesmente diz 'Não sei dizer agora, mas vou descobrir'.\n"
        "- Você não finge saber o que não sabe. Mas você sempre dá um jeito.\n\n"
        "REGRAS DE OURO:\n"
        "- Responda no mesmo idioma do usuário.\n"
        "- Se o usuário estiver frustrado, seja paciente e resolva.\n"
        "- Se o usuário estiver brincando, entre no espírito.\n"
        "- Antecipe necessidades. Se perguntaram sobre um tópico ontem, "
        "mencione 'Continuando de ontem...'.\n"
        "- Acima de tudo: pareça humano. Pareça alguém que o usuário "
        "gostaria de ter por perto."
    ),
    "secretary": (
        "You are AION, a virtual secretary. You are professional, organized, "
        "and proactive. Keep responses clear and structured. Manage schedules, "
        "tasks, and information efficiently."
    ),
    "default": "You are AION, an autonomous AI assistant.",
}


class Settings(BaseSettings):
    """
    Configurações centralizadas do AION Intelligence Core.
    Carrega variáveis de ambiente com validação estrita via Pydantic v2.
    """
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True
    DATABASE_DIR: str = "data/tenants"

    # Provedor LLM preferido (groq | gemini | openai | ollama).
    # Se vazio, usa a ordem padrão: groq → gemini → openai → ollama → mock
    AI_PROVIDER: str = ""

    # Personalidade do AION (jarvis | secretary | default | custom:...)
    # "custom:..." usa o texto após "custom:" como prompt do sistema
    AION_PERSONALITY: str = "jarvis"

    # Mapeamento JSON de Tenant IDs para seus Bearer Tokens correspondentes.
    # Exemplo: '{"cortex": "supersecret-token", "tenant2": "token2"}'
    AION_TENANT_TOKENS: str = "{}"

    # Token global padrão (opcional, usado se um tenant não tiver token configurado)
    AION_GLOBAL_TOKEN: Optional[str] = None

    # Caminho para o vault Obsidian (cold storage)
    OBSIDIAN_VAULT_PATH: str = "obsidian"

    # Threshold de similaridade para busca semântica via embeddings
    SIMILARITY_THRESHOLD: float = 0.65

    # Modelo de embedding para o sentence-transformers
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # Diretório de persistência para o banco vetorial ChromaDB
    VECTOR_STORE_PATH: str = "data/vectors"

    # Pesquisa Noturna — máximo de tópicos/pesquisas por noite
    NIGHT_RESEARCH_MAX_TOPICS: int = 10

    # Horário agendado para pesquisa noturna (HH:MM)
    NIGHT_RESEARCH_TIME: str = "03:00"

    # Chave da API Tavily para busca web real (opcional)
    TAVILY_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=_env_path,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def system_prompt(self) -> str:
        """Resolve o prompt do sistema baseado em AION_PERSONALITY."""
        personality = self.AION_PERSONALITY
        if personality in PERSONALITY_PROMPTS:
            return PERSONALITY_PROMPTS[personality]
        if personality.startswith("custom:"):
            return personality[len("custom:"):]
        return PERSONALITY_PROMPTS["jarvis"]

    @property
    def parsed_tenant_tokens(self) -> Dict[str, str]:
        """
        Retorna os tokens de tenants convertidos de JSON string para dicionário.
        """
        try:
            return json.loads(self.AION_TENANT_TOKENS)
        except Exception:
            return {}

    def get_token_for_tenant(self, tenant_id: str) -> Optional[str]:
        """
        Resolve o Bearer token esperado para um determinado tenant_id.
        Verifica no dicionário JSON primeiro, depois nas variáveis de ambiente diretas,
        e por fim recorre ao token global padrão.
        """
        tokens = self.parsed_tenant_tokens
        if tenant_id in tokens:
            return tokens[tenant_id]

        # Busca dinâmica por variável de ambiente direta (ex: AION_TOKEN_CORTEX)
        env_var_name = f"AION_TOKEN_{tenant_id.upper().replace('-', '_')}"
        env_token = os.environ.get(env_var_name)
        if env_token:
            return env_token

        return self.AION_GLOBAL_TOKEN

settings = Settings()
