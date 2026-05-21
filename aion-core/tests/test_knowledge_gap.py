import pytest
from aion.learning.knowledge_gap import (
    GapType,
    KnowledgeGapResult,
    LearningClassification,
    detect_gap,
    should_call_provider,
    classify_learning,
    _contains_sensitive_data,
)


class TestSensitiveDataDetection:

    def test_detects_cpf_format(self):
        assert _contains_sensitive_data("Meu CPF é 123.456.789-09")

    def test_detects_cpf_raw(self):
        assert _contains_sensitive_data("documento 12345678909")

    def test_detects_credit_card(self):
        assert _contains_sensitive_data("cartão 4111 1111 1111 1111")

    def test_detects_password_assignment(self):
        assert _contains_sensitive_data("minha senha: abc123")
        assert _contains_sensitive_data("password = segredo")

    def test_detects_token(self):
        assert _contains_sensitive_data("token: ghp_xyz123")

    def test_clean_text_not_sensitive(self):
        assert not _contains_sensitive_data("Qual o horário da reunião?")

    def test_sensitive_in_provider_response_is_filtered(self):
        classification = classify_learning("fale sobre o projeto", "o CPF é 123.456.789-09")
        assert classification.action == "discard"


class TestDetectGap:

    def test_empty_input_returns_ignore(self):
        result = detect_gap("app", "", 0.0)
        assert result.gap_type == GapType.ignore
        assert result.should_learn is False

    def test_blank_input_returns_ignore(self):
        result = detect_gap("app", "   ", 0.0)
        assert result.gap_type == GapType.ignore

    def test_high_confidence_returns_already_known(self):
        result = detect_gap("app", "alguma pergunta", 0.80)
        assert result.gap_type == GapType.already_known
        assert result.should_learn is False

    def test_high_confidence_at_threshold(self):
        result = detect_gap("app", "pergunta", 0.75)
        assert result.gap_type == GapType.already_known

    def test_sensitive_data_returns_ignore(self):
        result = detect_gap("app", "meu CPF é 123.456.789-09", 0.50)
        assert result.gap_type == GapType.ignore
        assert result.should_learn is False

    def test_greeting_returns_ignore(self):
        assert detect_gap("app", "oi", 0.0).gap_type == GapType.ignore
        assert detect_gap("app", "Bom dia!", 0.0).gap_type == GapType.ignore
        assert detect_gap("app", "obrigado", 0.0).gap_type == GapType.ignore
        assert detect_gap("app", "tudo bem?", 0.0).gap_type == GapType.ignore

    def test_personal_memory_detected(self):
        result = detect_gap("app", "meu nome é João", 0.0)
        assert result.gap_type == GapType.personal_memory
        assert result.should_learn is True

    def test_personal_age_detected(self):
        result = detect_gap("app", "minha idade é 30 anos", 0.0)
        assert result.gap_type == GapType.personal_memory

    def test_personal_address_detected(self):
        result = detect_gap("app", "eu moro na Rua Augusta", 0.0)
        assert result.gap_type == GapType.personal_memory

    def test_project_decision_detected(self):
        result = detect_gap("app", "vamos usar Python para o backend", 0.30)
        assert result.gap_type == GapType.project_decision

    def test_decision_variant(self):
        assert detect_gap("app", "decidimos usar PostgreSQL", 0.0).gap_type == GapType.project_decision
        assert detect_gap("app", "escolhi React para o front", 0.0).gap_type == GapType.project_decision

    def test_strategic_analysis_detected(self):
        result = detect_gap("app", "analise a performance do sistema", 0.20)
        assert result.gap_type == GapType.strategic_analysis

    def test_strategic_variants(self):
        assert detect_gap("app", "diagnóstico do projeto", 0.0).gap_type == GapType.strategic_analysis
        assert detect_gap("app", "recomendação para o próximo sprint", 0.0).gap_type == GapType.strategic_analysis

    def test_fresh_info_detected(self):
        result = detect_gap("app", "qual a previsão do tempo hoje?", 0.0)
        assert result.gap_type == GapType.fresh_info

    def test_fresh_variants(self):
        assert detect_gap("app", "cotação do dólar amanhã", 0.0).gap_type == GapType.fresh_info
        assert detect_gap("app", "clima agora", 0.0).gap_type == GapType.fresh_info

    def test_default_is_stable_knowledge(self):
        result = detect_gap("app", "o que é um banco de dados relacional?", 0.0)
        assert result.gap_type == GapType.stable_knowledge
        assert result.should_learn is True


class TestShouldCallProvider:

    def test_already_known_should_not_call(self):
        result = KnowledgeGapResult(gap_type=GapType.already_known, input="x", rag_confidence=0.80)
        assert should_call_provider(result) is False

    def test_personal_memory_should_not_call(self):
        result = KnowledgeGapResult(gap_type=GapType.personal_memory, input="x", rag_confidence=0.0)
        assert should_call_provider(result) is False

    def test_ignore_should_not_call(self):
        result = KnowledgeGapResult(gap_type=GapType.ignore, input="x", rag_confidence=0.0)
        assert should_call_provider(result) is False

    def test_project_decision_should_call(self):
        result = KnowledgeGapResult(gap_type=GapType.project_decision, input="x", rag_confidence=0.0)
        assert should_call_provider(result) is True

    def test_stable_knowledge_should_call(self):
        result = KnowledgeGapResult(gap_type=GapType.stable_knowledge, input="x", rag_confidence=0.0)
        assert should_call_provider(result) is True

    def test_fresh_info_should_call(self):
        result = KnowledgeGapResult(gap_type=GapType.fresh_info, input="x", rag_confidence=0.0)
        assert should_call_provider(result) is True

    def test_strategic_analysis_should_call(self):
        result = KnowledgeGapResult(gap_type=GapType.strategic_analysis, input="x", rag_confidence=0.0)
        assert should_call_provider(result) is True


class TestClassifyLearning:

    def test_ignore_discards(self):
        classification = classify_learning("oi", "resposta qualquer")
        assert classification.action == "discard"

    def test_personal_memory_saves_to_memory(self):
        classification = classify_learning("meu nome é Maria", "")
        assert classification.action == "save_memory"
        assert classification.target == "memory"

    def test_project_decision_saves_to_knowledge(self):
        classification = classify_learning("vamos usar FastAPI", "resposta do provider")
        assert classification.action == "save_knowledge"
        assert classification.target == "knowledge"

    def test_fresh_info_has_expiry(self):
        classification = classify_learning("qual a previsão do tempo hoje?", "previsão ensolarada")
        assert classification.action == "save_memory"
        assert classification.expires_in_hours == 48

    def test_strategic_analysis_saves_to_knowledge(self):
        classification = classify_learning("analise a concorrência", "análise completa...")
        assert classification.action == "save_knowledge"
        assert classification.target == "knowledge"
        assert "strategic" in classification.tags

    def test_stable_knowledge_default(self):
        classification = classify_learning("o que é uma API REST?", "é um estilo arquitetural...")
        assert classification.action == "save_knowledge"
        assert classification.target == "knowledge"
        assert "stable" in classification.tags


class TestDetectGapPriority:

    def test_high_confidence_takes_priority_over_ignore(self):
        result = detect_gap("app", "oi", 0.80)
        assert result.gap_type == GapType.already_known

    def test_sensitive_takes_priority_over_personal(self):
        result = detect_gap("app", "meu CPF é 123.456.789-09 e meu nome é Joao", 0.0)
        assert result.gap_type == GapType.ignore

    def test_personal_takes_priority_over_decision(self):
        result = detect_gap("app", "meu nome é Joao e vamos usar Python", 0.0)
        assert result.gap_type == GapType.personal_memory

    def test_decision_takes_priority_over_strategic(self):
        result = detect_gap("app", "decidimos usar Python, analise o impacto", 0.0)
        assert result.gap_type == GapType.project_decision


class TestDecideResponseSourceIntegration:

    @pytest.mark.asyncio
    async def test_already_known_returns_cache(self):
        from aion.agent.reasoner import decide_response_source
        source = decide_response_source(0.80, "alguma pergunta", "app-x")
        assert source == "cache"

    @pytest.mark.asyncio
    async def test_personal_memory_returns_cache(self):
        from aion.agent.reasoner import decide_response_source
        source = decide_response_source(0.30, "meu nome é João", "app-x")
        assert source == "cache"

    @pytest.mark.asyncio
    async def test_ignore_returns_llm(self):
        from aion.agent.reasoner import decide_response_source
        source = decide_response_source(0.60, "oi", "app-x")
        assert source == "llm"

    @pytest.mark.asyncio
    async def test_stable_knowledge_uses_confidence_fallback(self):
        from aion.agent.reasoner import decide_response_source
        source = decide_response_source(0.60, "o que é um banco de dados?", "app-x")
        assert source == "enrich"

    @pytest.mark.asyncio
    async def test_low_confidence_stable_knowledge_returns_llm(self):
        from aion.agent.reasoner import decide_response_source
        source = decide_response_source(0.30, "o que é um banco de dados?", "app-x")
        assert source == "llm"

    @pytest.mark.asyncio
    async def test_empty_input_falls_back_to_confidence(self):
        from aion.agent.reasoner import decide_response_source
        assert decide_response_source(0.90) == "cache"
        assert decide_response_source(0.60) == "enrich"
        assert decide_response_source(0.30) == "llm"
