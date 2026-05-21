import re
import logging
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.learning.knowledge_gap")


class GapType(str, Enum):
    already_known = "already_known"
    personal_memory = "personal_memory"
    project_decision = "project_decision"
    current_event = "current_event"
    strategic_analysis = "strategic_analysis"
    fresh_info = "fresh_info"
    stable_knowledge = "stable_knowledge"
    ignore = "ignore"


class KnowledgeGapResult(BaseModel):
    gap_type: GapType
    input: str
    rag_confidence: float
    should_learn: bool = Field(default=True)


class LearningClassification(BaseModel):
    action: str = Field(default="discard")
    target: str = Field(default="none")
    content: str = Field(default="")
    tags: List[str] = Field(default_factory=list)
    confidence: float = Field(default=1.0)
    expires_in_hours: Optional[int] = None


_SENSITIVE_PATTERNS = re.compile(
    r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"            # CPF
    r"|\b\d{11}\b"                                # CPF raw digits
    r"|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"  # credit card
    r"|\b(?:senha|password|token|secret|apikey|api_key)\s*[:=]\s*\S+"  # credentials
    r"|\b(?:cartão|cartao|cc)\s*\d+"              # card number shorthand
    r"|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b",           # duplicate, keep anyway
    re.IGNORECASE,
)

_IGNORE_PATTERNS = re.compile(
    r"^(?:oi|ol[áa]|hey|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem"
    r"|obrigado|obrigada|valeu|brigado|tks|thanks|thank\s+you"
    r"|blz|ok|okay|t[-]?d[ea]?[rb]"
    r"|qual[ée]\s+seu\s+nome"
    r"|quem\s+[ée]\s+voc[êe]"
    r"|como\s+vai"
    r")[.!?]*\s*$",
    re.IGNORECASE,
)

_PERSONAL_PATTERNS = re.compile(
    r"\b(?:meu\s+nome|eu\s+sou|me\s+chamo|minha\s+idade|eu\s+moro"
    r"|meu\s+email|meu\s+telefone|meu\s+celular|meu\s+whatsapp"
    r"|meu\s+endere[çc]o|minha\s+data\s+de\s+nascimento"
    r"|eu\s+nasci|minha\s+m[ãa]e|meu\s+pai|meu\s+contato"
    r")\b",
    re.IGNORECASE,
)

_DECISION_PATTERNS = re.compile(
    r"\b(?:decidimos|vamos\s+usar|escolhemos|optamos|adotamos"
    r"|vamos\s+adotar|decidi|escolhi|prefiro|determinamos"
    r"|estabelecemos|definimos|acordamos|combinamos"
    r")\b",
    re.IGNORECASE,
)

_STRATEGIC_PATTERNS = re.compile(
    r"\b(?:analise|an[áa]lise|analisar|comparar|compar[aç][ãa]o"
    r"|avaliar|avalia[çc][ãa]o|diagn[óo]stico|planejamento"
    r"|recomenda[çc][ãa]o|progn[óo]stico|tend[êe]ncia"
    r"|relat[óo]rio|pesquisa|estudo\s+de\s+caso"
    r"|pr[óo]ximos\s+passos|estrat[ée]gia|roteiro"
    r")\b",
    re.IGNORECASE,
)

_CURRENT_EVENT_PATTERNS = re.compile(
    r"\b(?:"
    # Current year (2026) or next year
    r"(?:202[6-9]|20[3-9]\d)"
    # Specific events + temporal
    r"|copa\s+(?:do\s+mundo|2026|2024|2025|2027|atual|d[ée]sse\s+ano)"
    r"|olimp[ií]adas(?:\s+2026|\s+2024|\s+atuais)?"
    r"|campeonato\s+(?:brasileiro|mundial|atual|desse\s+ano)"
    r"|elei[çc][õo]es\s+(?:2026|2024|atuais|desse\s+ano)"
    r"|mundial\s+(?:de\s+)?(?:clubes|2025|2026)"
    r"|libertadores\s+(?:2025|2026|atual)"
    r"|(?:brasileir[ãa]o|la\s+liga|premier\s+league|s[ée]rie\s+[ab])\s+(?:202[56]|atual)"
    # Temporal event keywords
    r"|jogador(?:es)?\s+da\s+copa"
    r"|jogos?\s+da\s+copa"
    r"|que\s+dia\s+(?:é|são|tem)\s+o\s+(?:jogos?|partida)"
    r"|copa\b"
    r"|escalação|elenco|resultados?\s+de\s+hoje"
    r"|jogos?\s+de\s+hoje"
    r"|quem\s+(?:ganhou|venceu|foi\s+o\s+campe[ãa]o)"
    r"|(?:atual|[úu]ltimo)\s+campe[ãa]o|campe[ãa]o\s+atual"
    r"|not[ií]cias?\s+sobre|[úu]ltimas\s+not[ií]cias"
    r"|previs[ãa]o\s+(?:do\s+tempo\s+)?(?:para\s+)?(?:hoje|amanh[ãa]|essa\s+semana)"
    r"|clima\s+(?:hoje|agora)"
    r"|classifica[çc][ãa]o\s+atual"
    r"|tabela\s+do\s+(?:campeonato|brasileir[ãa]o)"
    r"|quanto\s+(?:t[áa]|est[áa])\s+(?:o\s+)?(?:d[óo]lar|euro|bitcoin)"
    r"|cota[çc][ãa]o\s+(?:do|da)\s+(?:d[óo]lar|euro|a[çc][ãa]o)"
    r")\b",
    re.IGNORECASE,
)

_FRESH_PATTERNS = re.compile(
    r"\b(?:hoje|amanh[ãa]|ontem|esta\s+semana|esse\s+m[êe]s"
    r"|pr[óo]xima\s+semana|pr[óo]ximo\s+m[êe]s|agora\s+h[oó]ra"
    r"|[êe]ssa\s+noite|previs[ãa]o|cota[çc][ãa]o\s+do"
    r"|clima\s+(?:hoje|agora)|tempo\s+(?:hoje|agora)"
    r")\b",
    re.IGNORECASE,
)


def _contains_sensitive_data(text: str) -> bool:
    return bool(_SENSITIVE_PATTERNS.search(text))


def _is_personal_input(text: str) -> bool:
    return bool(_PERSONAL_PATTERNS.search(text))


def _is_ignore(text: str) -> bool:
    return bool(_IGNORE_PATTERNS.match(text.strip()))


def _is_decision(text: str) -> bool:
    return bool(_DECISION_PATTERNS.search(text))


def _is_strategic(text: str) -> bool:
    return bool(_STRATEGIC_PATTERNS.search(text))


def _is_fresh(text: str) -> bool:
    return bool(_FRESH_PATTERNS.search(text))


def _is_current_event(text: str) -> bool:
    return bool(_CURRENT_EVENT_PATTERNS.search(text))


def detect_gap(app_id: str, input: str, rag_confidence: float = 0.0) -> KnowledgeGapResult:
    if not input or not input.strip():
        return KnowledgeGapResult(
            gap_type=GapType.ignore,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=False,
        )

    if rag_confidence >= 0.75:
        return KnowledgeGapResult(
            gap_type=GapType.already_known,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=False,
        )

    if _contains_sensitive_data(input):
        logger.info("Sensitive data detected in input — skipping learn")
        return KnowledgeGapResult(
            gap_type=GapType.ignore,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=False,
        )

    if _is_ignore(input):
        return KnowledgeGapResult(
            gap_type=GapType.ignore,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=False,
        )

    if _is_personal_input(input):
        return KnowledgeGapResult(
            gap_type=GapType.personal_memory,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=True,
        )

    if _is_decision(input):
        return KnowledgeGapResult(
            gap_type=GapType.project_decision,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=True,
        )

    if _is_strategic(input):
        return KnowledgeGapResult(
            gap_type=GapType.strategic_analysis,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=True,
        )

    if _is_fresh(input):
        return KnowledgeGapResult(
            gap_type=GapType.fresh_info,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=True,
        )

    if _is_current_event(input):
        return KnowledgeGapResult(
            gap_type=GapType.current_event,
            input=input,
            rag_confidence=rag_confidence,
            should_learn=True,
        )

    return KnowledgeGapResult(
        gap_type=GapType.stable_knowledge,
        input=input,
        rag_confidence=rag_confidence,
        should_learn=True,
    )


def should_call_provider(gap_result: KnowledgeGapResult) -> bool:
    return gap_result.gap_type not in (
        GapType.already_known,
        GapType.personal_memory,
        GapType.ignore,
    )


def classify_learning(input: str, provider_response: str) -> LearningClassification:
    if _contains_sensitive_data(input) or _contains_sensitive_data(provider_response):
        return LearningClassification(
            action="discard",
            target="none",
            content="",
            tags=[],
            confidence=0.0,
        )

    gap = detect_gap("", input)

    if gap.gap_type == GapType.ignore:
        return LearningClassification(
            action="discard", target="none", content="", tags=[]
        )

    if gap.gap_type == GapType.already_known:
        return LearningClassification(
            action="update_cache",
            target="cache",
            content=provider_response,
            tags=["known"],
            confidence=0.85,
        )

    if gap.gap_type == GapType.personal_memory:
        return LearningClassification(
            action="save_memory",
            target="memory",
            content=input,
            tags=["personal", "user_fact"],
            confidence=0.95,
        )

    if gap.gap_type == GapType.project_decision:
        return LearningClassification(
            action="save_knowledge",
            target="knowledge",
            content=provider_response,
            tags=["decision", "project"],
            confidence=0.90,
        )

    if gap.gap_type == GapType.current_event:
        return LearningClassification(
            action="save_knowledge",
            target="knowledge",
            content=provider_response,
            tags=["current_event", "volatile"],
            confidence=0.70,
            expires_in_hours=24,
        )

    if gap.gap_type == GapType.fresh_info:
        return LearningClassification(
            action="save_memory",
            target="memory",
            content=provider_response,
            tags=["fresh", "volatile"],
            confidence=0.70,
            expires_in_hours=48,
        )

    if gap.gap_type == GapType.strategic_analysis:
        return LearningClassification(
            action="save_knowledge",
            target="knowledge",
            content=provider_response,
            tags=["strategic", "analysis"],
            confidence=0.90,
        )

    return LearningClassification(
        action="save_knowledge",
        target="knowledge",
        content=provider_response,
        tags=["stable", "technical"],
        confidence=0.85,
    )
