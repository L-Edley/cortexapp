import uuid
import datetime
import logging
import re
from typing import List, Optional, Dict, Any

from aion.cognitive.goal_models import (
    Reflection,
    LearnedStrategy,
    GoalPlan,
    ExecutionStep,
    TaskStatus,
    CapabilityMode,
)

logger = logging.getLogger("aion.cognitive.reflection")


class ReflectionEngine:
    def __init__(self):
        self._learned_strategies: Dict[str, LearnedStrategy] = {}

    async def analyze_step(
        self,
        app_id: str,
        plan: GoalPlan,
        step: ExecutionStep,
        input_text: str,
        output_text: str,
        error: Optional[str] = None,
    ) -> Reflection:
        success = error is None
        error_type = None
        error_detail = None
        improvement = None
        lesson = None

        if error:
            error_type = self._classify_error(error)
            error_detail = error[:500]
            improvement = self._suggest_improvement(error_type, step)
            lesson = self._extract_lesson(step, error)

        else:
            if step.mode == CapabilityMode.dev:
                improvement = "Considere adicionar testes automatizados para este passo."
            elif step.mode == CapabilityMode.research:
                improvement = "Considere estruturar os resultados em formato de documento."
            elif step.mode == CapabilityMode.study:
                improvement = "Considere salvar os aprendizados como conhecimento permanente."
            else:
                improvement = "Passo executado com sucesso. Nenhuma melhoria identificada."

            lesson = f"{step.mode.value}: {step.objective[:60]} executado com sucesso."

        reflection = Reflection(
            reflection_id=str(uuid.uuid4()),
            goal_id=plan.goal_id,
            app_id=app_id,
            step_number=step.step_number,
            input_snapshot=input_text[:500],
            output_snapshot=output_text[:500],
            success=success,
            error_type=error_type,
            error_detail=error_detail,
            improvement_suggestion=improvement,
            lesson_learned=lesson,
        )

        if success:
            self._record_strategy(app_id, step.mode, lesson)

        return reflection

    def _classify_error(self, error: str) -> str:
        text = error.lower()
        if re.search(r"\b(timeout|timed\s+out|time\s+out)", text):
            return "timeout"
        if re.search(r"\b(rate.limit|429|too\s+many\s+requests)", text):
            return "rate_limit"
        if re.search(r"\b(auth|unauthorized|401|403|permission|token)", text):
            return "authorization"
        if re.search(r"\b(not\s+found|404|missing|doesn'?t\s+exist)", text):
            return "not_found"
        if re.search(r"\b(provider|llm|model|api.*error|500)", text):
            return "provider_error"
        if re.search(r"\b(validation|invalid|bad\s+request|400)", text):
            return "validation_error"
        if re.search(r"\b(timeout|conex[ãa]o|connection|network|offline)", text):
            return "connection_error"
        return "unknown_error"

    def _suggest_improvement(self, error_type: str, step: ExecutionStep) -> str:
        suggestions = {
            "timeout": "Reduza o escopo do passo ou aumente o timeout.",
            "rate_limit": "Aguarde antes de repetir ou reduza a frequência de requisições.",
            "authorization": "Verifique as credenciais e permissões de acesso.",
            "not_found": "Verifique se o recurso necessário existe antes de prosseguir.",
            "provider_error": "Tente usar um provedor alternativo ou modo fallback.",
            "validation_error": "Revise os parâmetros de entrada antes de repetir.",
            "connection_error": "Verifique a conectividade de rede e tente novamente.",
            "unknown_error": "Revise o log de execução para identificar a causa raiz.",
        }
        return suggestions.get(error_type, "Revise o passo e tente novamente.")

    def _extract_lesson(self, step: ExecutionStep, error: str) -> str:
        return (
            f"Falha no passo {step.step_number} ({step.mode.value}): {step.objective[:60]}. "
            f"Erro: {error[:200]}"
        )

    def _record_strategy(self, app_id: str, mode: CapabilityMode, lesson: str) -> None:
        pattern_hash = f"{app_id}:{mode.value}"
        if pattern_hash in self._learned_strategies:
            ls = self._learned_strategies[pattern_hash]
            ls.usage_count += 1
            ls.success_rate = min(1.0, ls.success_rate + 0.05)
            ls.updated_at = datetime.datetime.utcnow().isoformat()
        else:
            self._learned_strategies[pattern_hash] = LearnedStrategy(
                strategy_id=str(uuid.uuid4()),
                app_id=app_id,
                pattern=pattern_hash,
                context=lesson[:200],
                recommended_mode=mode,
                success_rate=0.5,
                usage_count=1,
                tags=[mode.value, "reflection_learned"],
            )

    def get_learned_strategies(self, app_id: Optional[str] = None) -> List[LearnedStrategy]:
        strategies = list(self._learned_strategies.values())
        if app_id:
            strategies = [s for s in strategies if s.app_id == app_id]
        return sorted(strategies, key=lambda s: -s.usage_count)

    async def validate_result(self, step: ExecutionStep, output: Optional[str]) -> bool:
        if not output or not output.strip():
            return False
        if step.validation_criteria:
            for criterion in step.validation_criteria:
                if criterion.lower() not in output.lower():
                    return False
        min_length = 10 if step.mode == CapabilityMode.chat else 20
        return len(output.strip()) >= min_length

    async def generate_summary(self, plan: GoalPlan, reflections: List[Reflection]) -> str:
        total = len(plan.execution_plan)
        completed = sum(1 for s in plan.execution_plan if s.status == TaskStatus.completed)
        failed = sum(1 for s in plan.execution_plan if s.status == TaskStatus.failed)
        lessons = [r.lesson_learned for r in reflections if r.lesson_learned]

        summary_parts = [
            f"Plano '{plan.raw_input[:60]}' executou {completed}/{total} passos.",
        ]
        if failed > 0:
            summary_parts.append(f"{failed} passo(s) falharam.")
        if lessons:
            summary_parts.append("Lições aprendidas:")
            for lesson in lessons[:3]:
                summary_parts.append(f"- {lesson}")
        if plan.completed_steps == plan.total_steps:
            summary_parts.append("Objetivo concluído com sucesso.")

        return "\n".join(summary_parts)
