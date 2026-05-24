import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from aion.orchestrator.execution_memory import ExecutionRecord

logger = logging.getLogger("aion.orchestrator.reflection_engine")


class ExecutionReflection(BaseModel):
    execution_id: str = ""
    success_pattern: Optional[str] = None
    weakness: Optional[str] = None
    improvement: Optional[str] = None
    detected_errors: List[str] = Field(default_factory=list)
    detected_patterns: List[str] = Field(default_factory=list)
    suggested_improvements: List[str] = Field(default_factory=list)


_FAILURE_PATTERNS: Dict[str, List[str]] = {
    "timeout": ["timeout", "timed out", "time_out", "excedeu tempo", "time limit"],
    "provider_error": ["provider", "api error", "connection refused", "5", "503", "502"],
    "rate_limit": ["rate limit", "too many requests", "429", "quota exceeded"],
    "authorization": ["unauthorized", "forbidden", "401", "403", "auth", "invalid key"],
    "validation": ["validation", "invalid", "malformed", "schema error", "parse error"],
    "not_found": ["not found", "404", "no results", "empty", "None"],
}

_SUCCESS_PATTERNS: Dict[str, List[str]] = {
    "fast_completion": ["segundos", "seconds", "r[áa]pido", "imediato", "instant"],
    "high_confidence": ["confian[çc]a", "confidence > 0.8", "alta confian[çc]a"],
    "reused_context": ["cache", "cached", "rag context", "mem[óo]ria relevante"],
}

_IMPROVEMENT_TEMPLATES: Dict[str, str] = {
    "timeout": "Usar provedor mais rápido ou reduzir tamanho da entrada.",
    "rate_limit": "Implementar backoff exponencial ou alternar provedor.",
    "provider_error": "Configurar fallback automático para provedor secundário.",
    "authorization": "Verificar credenciais e renovar token de acesso.",
    "not_found": "Ampliar contexto RAG antes de consultar o provedor.",
    "validation": "Validar entrada antes de enviar ao provedor.",
    "empty_result": "Buscar conhecimento adicional antes de responder.",
    "low_confidence": "Solicitar confirmação do usuário antes de prosseguir.",
}


class OrchestratorReflectionEngine:
    def reflect(self, record: ExecutionRecord) -> ExecutionReflection:
        ref = ExecutionReflection(execution_id=record.id)
        ref.detected_errors = self.detect_failures(record)
        ref.detected_patterns = self.detect_success_patterns(record)
        ref.suggested_improvements = self.generate_improvements(record, ref.detected_errors)

        if record.success and ref.detected_patterns:
            ref.success_pattern = ref.detected_patterns[0]
        if not record.success and ref.detected_errors:
            ref.weakness = self._summarize_weakness(record, ref.detected_errors)
        if ref.suggested_improvements:
            ref.improvement = ref.suggested_improvements[0]

        return ref

    def detect_failures(self, record: ExecutionRecord) -> List[str]:
        seen_categories: set = set()
        failures: List[str] = []
        if record.errors:
            for err in record.errors:
                err_lower = err.lower()
                matched = False
                for category, patterns in _FAILURE_PATTERNS.items():
                    if any(p in err_lower for p in patterns):
                        if category not in seen_categories:
                            failures.append(f"{category}: {err[:80]}")
                            seen_categories.add(category)
                        matched = True
                        break
                if not matched and "unknown" not in seen_categories:
                    failures.append(f"unknown: {err[:80]}")
                    seen_categories.add("unknown")
        if not record.success and not record.errors and "execution_failed" not in seen_categories:
            failures.append("execution_failed: Nenhum erro registrado, mas resultado negativo.")
        return failures

    def detect_success_patterns(self, record: ExecutionRecord) -> List[str]:
        patterns: List[str] = []
        if not record.success:
            return patterns

        if record.duration_seconds < 2.0 and record.duration_seconds > 0:
            patterns.append("Execução rápida concluída em menos de 2 segundos.")
        elif record.duration_seconds < 10.0 and record.duration_seconds > 0:
            patterns.append("Tempo de resposta adequado.")

        if record.confidence_score >= 0.8:
            patterns.append("Alta confiança na execução.")

        if record.providers_used:
            for p in record.providers_used:
                if "mock" not in p.lower():
                    patterns.append(f"Provedor '{p}' executou com sucesso.")
                    break

        if record.modes_used:
            for m in record.modes_used:
                patterns.append(f"Modo '{m}' completou sem erros.")

        return patterns

    def generate_improvements(self, record: ExecutionRecord, detected_errors: List[str]) -> List[str]:
        improvements: List[str] = []
        seen = set()

        for err in detected_errors:
            for category in _FAILURE_PATTERNS:
                if err.startswith(category) and category not in seen:
                    template = _IMPROVEMENT_TEMPLATES.get(category)
                    if template and category not in seen:
                        improvements.append(template)
                        seen.add(category)

        if record.duration_seconds > 30:
            improvements.append("Tempo de execução elevado. Considerar cache semântico para consultas similares.")

        if record.confidence_score < 0.5:
            improvements.append("Confiança baixa. Considerar busca adicional de conhecimento ou fallback.")

        if not record.success and not record.errors:
            improvements.append("Falha sem erro específico. Adicionar logging detalhado para diagnóstico.")

        return improvements[:5]

    def _summarize_weakness(self, record: ExecutionRecord, detected_errors: List[str]) -> str:
        if detected_errors:
            top = detected_errors[0]
            return f"Falha detectada: {top[:100]}"
        return "Falha na execução sem causa específica identificada."

    async def reflect_and_persist(self, app_id: str, record: ExecutionRecord) -> ExecutionReflection:
        reflection = self.reflect(record)

        try:
            from aion.memory.sqlite_store import save_knowledge
            content = (
                f"[OrchestratorReflection] Goal: {record.goal[:80]}\n"
                f"Sucesso: {record.success}\n"
                f"Fraqueza: {reflection.weakness or 'N/A'}\n"
                f"Melhoria: {reflection.improvement or 'N/A'}\n"
                f"Erros: {', '.join(reflection.detected_errors) or 'Nenhum'}\n"
                f"Padrões: {', '.join(reflection.detected_patterns) or 'Nenhum'}"
            )
            tags = ["orchestrator", "reflection", "ok" if record.success else "fail", record.goal_type]
            await save_knowledge(
                app_id=app_id,
                content=content,
                tags=tags,
                confidence=max(0.3, record.confidence_score),
                domain="aion_orchestration",
                niche="execution_memory",
                topic=record.goal_type,
                scope="orchestrator",
                source_mode="reflection",
            )

            try:
                from aion.obsidian.writer import write_knowledge
                await write_knowledge(app_id, content, tags, max(0.3, record.confidence_score))
            except Exception:
                pass
        except Exception as e:
            logger.debug("Failed to persist reflection: %s", e)

        return reflection
