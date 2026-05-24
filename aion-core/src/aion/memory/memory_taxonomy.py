import re
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field

logger = logging.getLogger("aion.memory.taxonomy")

DEFAULT_DOMAIN = "general"
DEFAULT_NICHE = "general"
DEFAULT_SCOPE = "app"
DEFAULT_SOURCE_MODE = "chat"

DOMAIN_NICHE_MAP: Dict[str, List[str]] = {
    "productivity": ["tasks", "planning", "finance", "ideas", "schedule"],
    "technology": ["dev", "aion_architecture", "memory_system", "ai_ml", "technical_reference"],
    "personal": ["personal_memory", "user_preferences", "health", "finance"],
    "business": ["marketing", "product", "sales", "strategy"],
    "knowledge": ["general_knowledge", "current_events", "study", "research"],
    "training": ["workout", "nutrition", "recovery", "progress"],
}

ALL_NICHES: List[str] = sorted(
    {n for niches in DOMAIN_NICHE_MAP.values() for n in niches}
    | {"general", "control_center", "sync", "teacher", "dev_mode", "briefing", "voice"}
)

_DEV_PATTERNS = re.compile(
    r"\b(c[óo]digo|codigo|programa[çc][ãa]o|fun[çc][ãa]o|classe|import|def\s|async|await"
    r"|build|compile|erro|bug|debug|commit|push|pull|branch|merge|repo|git|npm|pip|docker"
    r"|teste|test|pytest|unittest|refactor|refatorar|api|endpoint|rota|route|middleware"
    r"|typescript|javascript|python|react|next|node|deploy|release|vers[ãa]o|version"
    r"|changelog|hotfix|feature|dev.?ops|frontend|backend|fullstack|sdk"
    r")\b",
    re.IGNORECASE,
)

_FINANCE_PATTERNS = re.compile(
    r"\b(conta|pagamento|pix|boleto|fatura|gasto|gastei|receita|recebi|saldo"
    r"|cart[ãa]o|credito|debito|transfer[êe]ncia|investimento|poupan[çc]a"
    r"|dinheiro|reais|d[óo]lar|euro|bitcoin|cripto|mensalidade|assinatura"
    r"|or[çc]amento|budget|custo|despesa|lucro|preju[ií]zo|faturamento"
    r"|nota\s+fiscal|nf|imposto|taxa|juros|multa|rendimento"
    r")\b",
    re.IGNORECASE,
)

_PERSONAL_MEMORY_PATTERNS = re.compile(
    r"\b(lembrei?|mem[óo]ria|lembrar|esqueci|anivers[áa]rio|nascimento"
    r"|meu\s+nome|eu\s+sou|me\s+chamo|minha\s+idade|minha\s+m[ãa]e|meu\s+pai"
    r"|meu\s+email|meu\s+telefone|meu\s+endere[çc]o"
    r"|pedi\s+para|pedido|favorito|prefiro|gosto|odeio"
    r"|asthma|alergia|alergico|rem[ée]dio|medica[çc][ãa]o"
    r")\b",
    re.IGNORECASE,
)

_TASK_PATTERNS = re.compile(
    r"\b(tarefa|task|pendente|fazer|preciso|precisa|devo|deve|to[-\s]?do"
    r"|afazer|afazeres|backlog|lista|checklist|prioridade|urgente"
    r"|agendar|agenda|compromisso|reuni[ãa]o|meeting|deadline|prazo"
    r"|entregar|entreg[áa]vel|deliverable|acompanhamento|follow.up"
    r"|terminar|finalizar|concluir|completei|conclu[ií]do"
    r")\b",
    re.IGNORECASE,
)

_PLANNING_PATTERNS = re.compile(
    r"\b(plano|planejamento|planejar|estrat[ée]gia|estrat[ée]gico|rojeto"
    r"|pr[óo]ximos? passos|roadmap|meta|objetivo|goal|pro[óo]sito"
    r"|miss[ãa]o|vis[ãa]o|proposta|projetar|projetado"
    r")\b",
    re.IGNORECASE,
)

_TRAINING_PATTERNS = re.compile(
    r"\b(treino|treinar|academia|exerc[ií]cio|s[ée]rie|repeti[çc][ãa]o|rep"
    r"|dieta|nutri[çc][ãa]o|alimenta[çc][ãa]o|prote[ií]na|caloria|macro"
    r"|suplemento|whey|creatina|pr[ée]-treino|p[ó]s-treino"
    r"|recupera[çc][ãa]o|descanso|sono|sleep|les[ãa]o|dor|m[ú]sculo"
    r"|cardio|crossfit|funcional|peso|carga|s[ée]rie|progress[ãa]o"
    r")\b",
    re.IGNORECASE,
)

_AION_ARCH_PATTERNS = re.compile(
    r"\b(aion|c[óo]rtex|cortex|hot.?warm.?cold|brain|neo.?cortex"
    r"|teacher|reteacher|self.?teacher|dev.?mode|study.?mode|control.?center"
    r"|sync|supabase|chroma|chromadb|embeddings|embedding|vector.?store"
    r"|knowledge.?gap|learning.?engine|intent.?detector|persona|response.?formatter"
    r"|proactive|briefing|night.?research|obsidian|vault|memory.?system"
    r"|app.?id|tenant|multi.?tenant|nichos|dom[ií]nios|taxonomia"
    r"|sqlite|banco\s+relacional|vector\s+store|vetor|agente|agent|llm|rag"
    r"|cache|migration|migra[çc][ãa]o"
    r")\b",
    re.IGNORECASE,
)

_IDEAS_PATTERNS = re.compile(
    r"\b(ideia|idea|sugest[ãa]o|sugerir|propor|proposta|criativo"
    r"|inova[çc][ãa]o|inovar|novo\s+projeto|nova\s+funcionalidade"
    r"|brainstorm|inspira[çc][ãa]o|insight"
    r")\b",
    re.IGNORECASE,
)

_CONTROL_CENTER_PATTERNS = re.compile(
    r"\b(control.?center|diagn[óo]stico|dashboard|monitor|status"
    r"|sa[úu]de|health|provedor|provider|fila|queue|job|estudo|estudar"
    r")\b",
    re.IGNORECASE,
)


@dataclass
class MemoryTaxonomy:
    domain: str = DEFAULT_DOMAIN
    niche: str = DEFAULT_NICHE
    topic: str = ""
    subtopic: str = ""
    scope: str = DEFAULT_SCOPE
    tags: List[str] = field(default_factory=list)
    confidence: float = 1.0
    source_mode: str = DEFAULT_SOURCE_MODE


@dataclass
class QueryTaxonomy:
    domain: str = DEFAULT_DOMAIN
    niche: str = DEFAULT_NICHE
    topic: str = ""
    intent: str = ""
    confidence: float = 1.0


def _count_pattern_matches(text: str, pattern: re.Pattern) -> int:
    return len(pattern.findall(text))


def classify_memory_niche(
    app_id: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> MemoryTaxonomy:
    text = content.lower()
    scores: Dict[str, int] = {}

    for niche_name, pattern in [
        ("dev", _DEV_PATTERNS),
        ("finance", _FINANCE_PATTERNS),
        ("personal_memory", _PERSONAL_MEMORY_PATTERNS),
        ("tasks", _TASK_PATTERNS),
        ("planning", _PLANNING_PATTERNS),
        ("training", _TRAINING_PATTERNS),
        ("nutrition", _TRAINING_PATTERNS),
        ("aion_architecture", _AION_ARCH_PATTERNS),
        ("ideas", _IDEAS_PATTERNS),
        ("control_center", _CONTROL_CENTER_PATTERNS),
    ]:
        count = _count_pattern_matches(text, pattern)
        if count > 0:
            scores[niche_name] = scores.get(niche_name, 0) + count

    if metadata and "tags" in metadata:
        tag_text = " ".join(metadata["tags"]).lower()
        for tag_niche, pattern in [
            ("dev", _DEV_PATTERNS),
            ("finance", _FINANCE_PATTERNS),
            ("aion_architecture", _AION_ARCH_PATTERNS),
        ]:
            count = _count_pattern_matches(tag_text, pattern)
            if count > 0:
                scores[tag_niche] = scores.get(tag_niche, 0) + count

    best_niche = DEFAULT_NICHE
    best_score = 0
    for niche_name, score in scores.items():
        if score > best_score:
            best_score = score
            best_niche = niche_name

    domain = _niche_to_domain(best_niche)
    confidence = min(1.0, best_score / 5.0) if best_score > 0 else 0.3

    if metadata and metadata.get("type") == "dev_lesson":
        best_niche = "dev"
        domain = "technology"
        confidence = max(confidence, 0.85)

    source_mode = DEFAULT_SOURCE_MODE
    if metadata and "source_mode" in metadata:
        source_mode = metadata["source_mode"]

    scope = DEFAULT_SCOPE
    if metadata and "scope" in metadata:
        scope = metadata["scope"]

    tags = []
    if metadata and "tags" in metadata:
        tags = metadata["tags"]

    return MemoryTaxonomy(
        domain=domain,
        niche=best_niche,
        topic="",
        subtopic="",
        scope=scope,
        tags=tags,
        confidence=confidence,
        source_mode=source_mode,
    )


def infer_query_niche(
    app_id: str,
    input: str,
    context: Optional[Dict[str, Any]] = None,
) -> QueryTaxonomy:
    text = input.lower()
    scores: Dict[str, int] = {}

    for niche_name, pattern in [
        ("dev", _DEV_PATTERNS),
        ("finance", _FINANCE_PATTERNS),
        ("personal_memory", _PERSONAL_MEMORY_PATTERNS),
        ("tasks", _TASK_PATTERNS),
        ("planning", _PLANNING_PATTERNS),
        ("training", _TRAINING_PATTERNS),
        ("nutrition", _TRAINING_PATTERNS),
        ("aion_architecture", _AION_ARCH_PATTERNS),
        ("ideas", _IDEAS_PATTERNS),
        ("control_center", _CONTROL_CENTER_PATTERNS),
    ]:
        count = _count_pattern_matches(text, pattern)
        if count > 0:
            scores[niche_name] = scores.get(niche_name, 0) + count

    best_niche = DEFAULT_NICHE
    best_score = 0
    for niche_name, score in scores.items():
        if score > best_score:
            best_score = score
            best_niche = niche_name

    domain = _niche_to_domain(best_niche)
    confidence = min(1.0, best_score / 4.0) if best_score > 0 else 0.3

    intent = ""
    if context and "intent" in context:
        intent = context["intent"]

    return QueryTaxonomy(
        domain=domain,
        niche=best_niche,
        topic="",
        intent=intent,
        confidence=confidence,
    )


def _niche_to_domain(niche: str) -> str:
    for domain, niches in DOMAIN_NICHE_MAP.items():
        if niche in niches:
            return domain
    if niche == "general":
        return "general"
    if niche == "control_center":
        return "technology"
    if niche in ("sync", "dev_mode", "teacher", "briefing", "voice"):
        return "technology"
    return DEFAULT_DOMAIN


def should_search_niche(
    query_taxonomy: QueryTaxonomy,
    memory_taxonomy: MemoryTaxonomy,
) -> bool:
    if memory_taxonomy.niche == "general":
        return True
    if query_taxonomy.niche == "general":
        return True
    if query_taxonomy.niche == memory_taxonomy.niche:
        return True
    if query_taxonomy.domain == memory_taxonomy.domain:
        return True
    if query_taxonomy.confidence < 0.35 and memory_taxonomy.confidence < 0.35:
        return True
    if query_taxonomy.confidence >= 0.5 and memory_taxonomy.confidence >= 0.5:
        if query_taxonomy.niche != memory_taxonomy.niche:
            return False
    return False


def normalize_niche(value: str) -> str:
    normalized = value.lower().strip().replace(" ", "_").replace("-", "_")
    if normalized in ALL_NICHES:
        return normalized
    for known in ALL_NICHES:
        if known.startswith(normalized) or normalized.startswith(known):
            return known
    return DEFAULT_NICHE


def taxonomy_to_metadata(
    taxonomy: MemoryTaxonomy,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    meta: Dict[str, Any] = {
        "domain": taxonomy.domain,
        "niche": taxonomy.niche,
        "topic": taxonomy.topic or "",
        "scope": taxonomy.scope,
        "source_mode": taxonomy.source_mode,
        "taxonomy_confidence": taxonomy.confidence,
    }
    if taxonomy.tags:
        meta["taxonomy_tags"] = ",".join(taxonomy.tags)
    if extra:
        meta.update(extra)
    return meta
