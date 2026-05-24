import re
import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

from aion.cognitive.goal_models import (
    GoalAnalysis,
    GoalType,
    ComplexityLevel,
    DecomposedTask,
    ExecutionStep,
    RecommendedCapability,
    CapabilityMode,
    GoalPlan,
    TaskStatus,
)

logger = logging.getLogger("aion.cognitive.execution_plan")

_COMPLEXITY_PATTERNS: Dict[str, List[str]] = {
    "trivial": [
        r"\b(que\s+horas|que\s+dia|qual\s+o\s+maior|quem\s+foi|quanto\s+[ée])\b",
    ],
    "high": [
        r"\b(monetizar|lan[çc]ar|desenvolver|criar\s+(um\s+)?(projeto|produto|sistema|plataforma|aplicativo))",
        r"\b(arquitetura|infraestrutura|migrar|refatorar|reestruturar|orquestrar|automatizar)",
        r"\b(campanha|estrat[ée]gia\s+de|plano\s+de\s+neg[óo]cios|business\s+plan)",
        r"\b(mvp|mínimo\s+produto\s+vi[áa]vel|produto\s+m[íi]nimo\s+vi[áa]vel)",
    ],
    "critical": [
        r"\b(crise|emerg[êe]ncia|incidente|viola[çc][ãa]o|brecha|vulnerabilidade)",
        r"\b(auditoria|conformidade|regulat[óo]rio|legal|jur[ií]dico)",
    ],
}

_SENSITIVE_PATTERNS: List[str] = [
    r"\b(deletar|apagar|remover|excluir|destruir|eliminar)\s+(todos?\s+)?(os\s+)?(dados|arquivos|registros|informa[çc][õo]es)",
    r"\b(formata[rç]|reset|factory.?reset|limpar\s+tudo|zerar)",
]

_DOMAIN_PATTERNS: Dict[str, List[str]] = {
    "dev": [
        r"\b(back.?end|front.?end|api|endpoint|banco|database|sql|deploy|devops|docker)",
        r"\b(c[óo]digo|programar|bug|debug|teste|refatorar|pull.?request|commit|push)",
    ],
    "business": [
        r"\b(monetizar|receita|lucro|faturamento|cliente|mercado|concorrente|vender|venda)",
        r"\b(marketing|branding|p[úb]blico.?alvo|lead|convers[ãa]o|funil|cac|roi)",
    ],
    "product": [
        r"\b(mvp|produto|funcionalidade|feature|roadmap|backlog|user.?story|sprint)",
        r"\b(ux|ui|design|prot[óo]tipo|wireframe|mockup|usabilidade|experi[êe]ncia)",
    ],
    "finance": [
        r"\b(pagamento|fatura|pix|boleto|cart[ãa]o|receita|despesa|custo|or[çc]amento)",
        r"\b(investimento|fluxo\s+de\s+caixa|d[ée]bito|cr[ée]dito|nota\s+fiscal|nf)",
    ],
    "planning": [
        r"\b(planejamento|plano|estrat[ée]gia|cronograma|prazo|deadline|etapa|fase|marco)",
        r"\b(organizar|organiza[çc][ãa]o|priorizar|prioridade|roteiro|roadmap|tarefa|task)",
    ],
}

_TASK_DECOMPOSITION: Dict[str, List[str]] = {
    "backend": ["API design", "database schema", "business logic", "auth", "tests"],
    "frontend": ["UI components", "state management", "routing", "responsiveness", "tests"],
    "auth": ["registration", "login", "OAuth", "session management", "RBAC"],
    "payments": ["gateway integration", "checkout flow", "invoice generation", "refund logic"],
    "landing": ["hero section", "features", "pricing", "FAQ", "contact form"],
    "onboarding": ["welcome flow", "tutorial", "first-run experience", "configuration wizard"],
    "deploy": ["CI/CD pipeline", "containerization", "environments", "monitoring", "logging"],
    "analytics": ["event tracking", "dashboard", "reports", "KPIs", "data pipeline"],
}


class GoalAnalyzer:
    def analyze(self, app_id: str, input: str) -> GoalAnalysis:
        text = input.lower()

        goal_type = self._detect_goal_type(text)
        complexity = self._detect_complexity(text)
        domains = self._detect_domains(text)
        estimated_steps = self._estimate_steps(complexity, domains, text)
        confidence = self._compute_confidence(text, domains, complexity)
        is_sensitive = any(re.search(p, text) for p in _SENSITIVE_PATTERNS)
        requires_approval = complexity in (ComplexityLevel.high, ComplexityLevel.critical) or is_sensitive

        return GoalAnalysis(
            goal_type=goal_type,
            complexity=complexity,
            domains=domains,
            estimated_steps=estimated_steps,
            raw_input=input,
            confidence=confidence,
            requires_approval=requires_approval,
        )

    def _detect_goal_type(self, text: str) -> GoalType:
        if re.search(r"\b(monetizar|receita|lucro|vender|neg[óo]cio|business|mercad[eo])", text):
            return GoalType.business_growth
        if re.search(r"\b(criar|desenvolver|construir|lan[çc]ar|fabricar|produzir|mvp)", text):
            return GoalType.product_development
        if re.search(r"\b(planejar|plano|cronograma|organizar|projeto|projetar)", text):
            return GoalType.project_planning
        if re.search(r"\b(aprender|estudar|entender|compreender|pesquisar|investigar)", text):
            return GoalType.learning
        if re.search(r"\b(pesquisar|pesquisa|investigar|investiga[çc][ãa]o|buscar.*informa)", text):
            return GoalType.research
        if re.search(r"\b(analisar|an[áa]lise|diagn[óo]stico|avaliar|comparar)", text):
            return GoalType.analysis
        if re.search(r"\b(automatizar|automa[çc][ãa]o|automaticamente|script|bot)", text):
            return GoalType.automation
        if re.search(r"\b(estrat[ée]gia|estrat[ée]gico|posicionamento|diferencial)", text):
            return GoalType.strategy
        if re.search(r"\b(erro|problema|bug|falha|n[ãa]o\s+funciona|quebrou|corrigir)", text):
            return GoalType.troubleshooting
        if re.search(r"\b(conte[úu]do|artigo|post|blog|newsletter|texto|escrever)", text):
            return GoalType.content_creation
        if re.search(r"\b(organizar|organiza[çc][ãa]o|arrumar|categorizar|classificar)", text):
            return GoalType.personal_organization
        return GoalType.unknown

    def _detect_complexity(self, text: str) -> ComplexityLevel:
        for level, patterns in _COMPLEXITY_PATTERNS.items():
            for p in patterns:
                if re.search(p, text):
                    return ComplexityLevel(level)
        word_count = len(text.split())
        if word_count <= 5:
            return ComplexityLevel.trivial
        if word_count <= 15:
            return ComplexityLevel.low
        if word_count <= 30:
            return ComplexityLevel.medium
        return ComplexityLevel.medium

    def _detect_domains(self, text: str) -> List[str]:
        domains = []
        for domain, patterns in _DOMAIN_PATTERNS.items():
            for p in patterns:
                if re.search(p, text):
                    domains.append(domain)
                    break
        return domains if domains else ["general"]

    def _estimate_steps(self, complexity: ComplexityLevel, domains: List[str], text: str) -> int:
        base = {
            ComplexityLevel.trivial: 1,
            ComplexityLevel.low: 2,
            ComplexityLevel.medium: 4,
            ComplexityLevel.high: 8,
            ComplexityLevel.critical: 12,
        }.get(complexity, 4)
        multiplier = max(1, len(domains))
        return min(base * multiplier, 50)

    def _compute_confidence(self, text: str, domains: List[str], complexity: ComplexityLevel) -> float:
        score = 0.3
        if domains != ["general"]:
            score += 0.3
        if complexity != ComplexityLevel.medium:
            score += 0.2
        if len(text.split()) >= 8:
            score += 0.1
        if re.search(r"\b(quero|preciso|vou|vamos|gostaria|planejo)", text):
            score += 0.1
        return min(score, 0.95)


class TaskDecomposer:
    def decompose(self, analysis: GoalAnalysis, input: str) -> List[DecomposedTask]:
        text = input.lower()
        tasks: List[DecomposedTask] = []
        seen = set()

        for keyword, subtasks in _TASK_DECOMPOSITION.items():
            if keyword in text or any(d in keyword for d in analysis.domains):
                for i, st in enumerate(subtasks):
                    if st not in seen:
                        task_id = str(uuid.uuid4())
                        tasks.append(DecomposedTask(
                            id=task_id,
                            title=st,
                            domain=analysis.domains[0] if analysis.domains else "general",
                            niche=self._map_domain_to_niche(analysis.domains[0]) if analysis.domains else "general",
                            depends_on=[tasks[-1].id] if tasks and i == 0 else [],
                            capability=self._infer_capability(st),
                            estimated_effort=self._estimate_effort(st),
                        ))
                        seen.add(st)

        if not tasks:
            task_id = str(uuid.uuid4())
            tasks.append(DecomposedTask(
                id=task_id,
                title=analysis.raw_input[:80],
                domain=analysis.domains[0] if analysis.domains else "general",
                niche="general",
                capability=CapabilityMode.chat,
                estimated_effort="medium",
            ))

        return tasks

    def _map_domain_to_niche(self, domain: str) -> str:
        mapping = {
            "dev": "dev",
            "business": "marketing",
            "product": "product",
            "finance": "finance",
            "planning": "planning",
        }
        return mapping.get(domain, "general")

    def _infer_capability(self, task_title: str) -> CapabilityMode:
        text = task_title.lower()
        if re.search(r"\b(research|pesquisa|investigar|estudo|analisar|concorrente|mercado)", text):
            return CapabilityMode.research
        if re.search(r"\b(c[óo]digo|programar|dev|back.?end|front.?end|api|deploy)", text):
            return CapabilityMode.dev
        if re.search(r"\b(aprender|estudar|teacher|ensin[ao]|conceito|teoria)", text):
            return CapabilityMode.teacher
        if re.search(r"\b(estudo|study|conhecimento|knowledge)", text):
            return CapabilityMode.study
        if re.search(r"\b(planejar|plano|organizar|cronograma)", text):
            return CapabilityMode.planner
        return CapabilityMode.chat

    def _estimate_effort(self, title: str) -> str:
        text = title.lower()
        if re.search(r"\b(pipeline|infra|deploy|arquitetura|migra[çc][ãa]o)", text):
            return "high"
        if re.search(r"\b(auth|pagamento|integra[çc][ãa]o|dashboard)", text):
            return "medium"
        return "low"


class CapabilityRouter:
    def route(self, analysis: GoalAnalysis, tasks: List[DecomposedTask]) -> List[RecommendedCapability]:
        mode_scores: Dict[CapabilityMode, int] = {}
        mode_reasons: Dict[CapabilityMode, List[str]] = {}

        for mode in CapabilityMode:
            mode_scores[mode] = 0
            mode_reasons[mode] = []

        for domain in analysis.domains:
            if domain == "dev":
                mode_scores[CapabilityMode.dev] += 3
                mode_reasons[CapabilityMode.dev].append(f"Domínio {domain} requer Dev Mode")
                mode_scores[CapabilityMode.study] += 1
                mode_reasons[CapabilityMode.study].append(f"Domínio {domain} pode usar Study Mode")
            elif domain == "business":
                mode_scores[CapabilityMode.research] += 3
                mode_reasons[CapabilityMode.research].append(f"Domínio {domain} requer pesquisa")
                mode_scores[CapabilityMode.teacher] += 1
                mode_reasons[CapabilityMode.teacher].append(f"Domínio {domain} pode usar Teacher")
            elif domain == "product":
                mode_scores[CapabilityMode.study] += 2
                mode_reasons[CapabilityMode.study].append(f"Domínio {domain} recomendado Study Mode")
                mode_scores[CapabilityMode.dev] += 2
                mode_reasons[CapabilityMode.dev].append(f"Domínio {domain} pode usar Dev Mode")
            elif domain == "finance":
                mode_scores[CapabilityMode.study] += 2
                mode_reasons[CapabilityMode.study].append(f"Domínio {domain} recomendado Study Mode")
            elif domain == "planning":
                mode_scores[CapabilityMode.planner] += 3
                mode_reasons[CapabilityMode.planner].append(f"Domínio {domain} requer Planner")
                mode_scores[CapabilityMode.reflection] += 1

        if analysis.complexity in (ComplexityLevel.high, ComplexityLevel.critical):
            mode_scores[CapabilityMode.reflection] += 2
            mode_reasons[CapabilityMode.reflection].append("Alta complexidade ativa Reflection")
            mode_scores[CapabilityMode.study] += 1
            mode_reasons[CapabilityMode.study].append("Alta complexidade ativa Study Mode")

        if analysis.estimated_steps > 5:
            mode_scores[CapabilityMode.planner] += 2
            mode_reasons[CapabilityMode.planner].append("Múltiplos passos ativam Planner")

        for task in tasks:
            mode_scores[task.capability] += 1
            mode_reasons[task.capability].append(f"Tarefa '{task.title[:30]}' requer {task.capability.value}")

        mode_scores[CapabilityMode.rag] = max(1, mode_scores.get(CapabilityMode.rag, 0))
        mode_reasons[CapabilityMode.rag].append("RAG base para contexto cognitivo")
        mode_scores[CapabilityMode.chat] = max(1, mode_scores.get(CapabilityMode.chat, 0))
        mode_reasons[CapabilityMode.chat].append("Chat base para interação com usuário")

        recommendations = [
            RecommendedCapability(mode=mode, reason="; ".join(mode_reasons[mode][:2]), priority=min(score, 10))
            for mode, score in sorted(mode_scores.items(), key=lambda x: -x[1])
            if score > 0
        ]

        return recommendations


class ExecutionPlanner:
    def plan(self, analysis: GoalAnalysis, tasks: List[DecomposedTask], recommendations: List[RecommendedCapability]) -> List[ExecutionStep]:
        steps: List[ExecutionStep] = []

        if analysis.complexity in (ComplexityLevel.high, ComplexityLevel.critical):
            steps.append(ExecutionStep(
                step_number=1,
                mode=CapabilityMode.reflection,
                task_id="",
                objective="Avaliar viabilidade e riscos do objetivo",
                prompt=f"Analise a viabilidade do objetivo: {analysis.raw_input[:200]}",
                requires_user_input=False,
            ))

        step_num = len(steps) + 1
        for i, task in enumerate(tasks):
            prompt = self._build_prompt(task)
            steps.append(ExecutionStep(
                step_number=step_num + i,
                mode=task.capability,
                task_id=task.id,
                objective=task.title,
                prompt=prompt,
                requires_user_input=(i == 0 and analysis.requires_approval),
            ))

        if analysis.complexity in (ComplexityLevel.high, ComplexityLevel.critical):
            final_step = len(steps) + 1
            steps.append(ExecutionStep(
                step_number=final_step,
                mode=CapabilityMode.reflection,
                task_id="",
                objective="Revisar resultados consolidados",
                prompt="Revise os resultados de todos os passos e sugira próximos passos.",
            ))

        return steps

    def _build_prompt(self, task: DecomposedTask) -> str:
        base = task.description or task.title
        if task.validation_criteria:
            criteria = "; ".join(task.validation_criteria)
            base += f"\nCritérios de validação: {criteria}"
        return base
