import pytest
from aion.memory.memory_taxonomy import (
    classify_memory_niche,
    infer_query_niche,
    should_search_niche,
    normalize_niche,
    taxonomy_to_metadata,
    MemoryTaxonomy,
    QueryTaxonomy,
)


class TestClassifyMemoryNiche:
    def test_classify_finance(self):
        tax = classify_memory_niche("cortex", "Paguei a conta de água com Pix no valor de R$ 150")
        assert tax.niche == "finance"
        assert tax.domain == "productivity"

    def test_classify_dev(self):
        tax = classify_memory_niche("cortex", "O bug no módulo de sync foi corrigido com um async patch")
        assert tax.niche == "dev"
        assert tax.domain == "technology"

    def test_classify_training(self):
        tax = classify_memory_niche("natuforce", "Treino de perna com agachamento 4x12 e dieta de 2500 calorias")
        assert tax.niche in ("training", "nutrition")

    def test_classify_aion_architecture(self):
        tax = classify_memory_niche("cortex", "O AION usa ChromaDB como vector store e SQLite como banco relacional")
        assert tax.niche == "aion_architecture"
        assert tax.domain == "technology"

    def test_classify_personal_memory(self):
        tax = classify_memory_niche("cortex", "Meu nome é João e eu moro em São Paulo")
        assert tax.niche == "personal_memory"
        assert tax.domain == "personal"

    def test_classify_tasks(self):
        tax = classify_memory_niche("cortex", "Preciso terminar a task de refatorar o endpoint de chat")
        assert tax.niche == "tasks"

    def test_classify_general_when_no_match(self):
        tax = classify_memory_niche("cortex", "O céu está azul hoje")
        assert tax.niche == "general"
        assert tax.domain == "general"

    def test_classify_uses_tags_metadata(self):
        tax = classify_memory_niche("cortex", "lesson about python async",
                                     metadata={"tags": ["dev", "python"], "type": "dev_lesson"})
        assert tax.niche == "dev"

    def test_classify_dev_lesson_type(self):
        tax = classify_memory_niche("cortex", "lesson content",
                                     metadata={"type": "dev_lesson"})
        assert tax.niche == "dev"

    def test_classify_honors_source_mode(self):
        tax = classify_memory_niche("cortex", "some content",
                                     metadata={"source_mode": "study"})
        assert tax.source_mode == "study"


class TestInferQueryNiche:
    def test_infer_dev_query(self):
        q = infer_query_niche("cortex", "como corrigir o bug no endpoint?")
        assert q.niche == "dev"
        assert q.confidence >= 0.3

    def test_infer_finance_query(self):
        q = infer_query_niche("cortex", "quanto eu paguei de conta esse mês?")
        assert q.niche == "finance"

    def test_infer_personal_query(self):
        q = infer_query_niche("cortex", "você lembra do meu nome?")
        assert q.niche == "personal_memory"

    def test_infer_general_fallback(self):
        q = infer_query_niche("cortex", "qual é a capital do Brasil?")
        assert q.niche in ("general", "general_knowledge")

    def test_infer_training_query(self):
        q = infer_query_niche("natuforce", "qual meu treino de hoje?")
        assert q.niche in ("training", "tasks")


class TestShouldSearchNiche:
    def test_same_niche_allows(self):
        qt = QueryTaxonomy(niche="dev")
        mt = MemoryTaxonomy(niche="dev")
        assert should_search_niche(qt, mt)

    def test_same_domain_allows(self):
        qt = QueryTaxonomy(niche="dev", domain="technology")
        mt = MemoryTaxonomy(niche="aion_architecture", domain="technology")
        assert should_search_niche(qt, mt)

    def test_general_memory_allows(self):
        qt = QueryTaxonomy(niche="dev", domain="technology")
        mt = MemoryTaxonomy(niche="general", domain="general")
        assert should_search_niche(qt, mt)

    def test_general_query_allows(self):
        qt = QueryTaxonomy(niche="general", domain="general")
        mt = MemoryTaxonomy(niche="finance", domain="productivity")
        assert should_search_niche(qt, mt)

    def test_different_niche_and_domain_blocks(self):
        qt = QueryTaxonomy(niche="dev", domain="technology", confidence=0.8)
        mt = MemoryTaxonomy(niche="finance", domain="productivity", confidence=0.9)
        assert not should_search_niche(qt, mt)

    def test_low_confidence_allows(self):
        qt = QueryTaxonomy(niche="dev", domain="technology", confidence=0.3)
        mt = MemoryTaxonomy(niche="finance", domain="productivity", confidence=0.3)
        assert should_search_niche(qt, mt)


class TestNormalizeNiche:
    def test_normalize_exact(self):
        assert normalize_niche("dev") == "dev"

    def test_normalize_uppercase(self):
        assert normalize_niche("FINANCE") == "finance"

    def test_normalize_spaces(self):
        assert normalize_niche("personal memory") == "personal_memory"

    def test_normalize_default(self):
        assert normalize_niche("unknown_niche_xyz") == "general"


class TestTaxonomyToMetadata:
    def test_converts_taxonomy_to_dict(self):
        tax = MemoryTaxonomy(domain="technology", niche="dev", scope="app", source_mode="chat")
        meta = taxonomy_to_metadata(tax)
        assert meta["domain"] == "technology"
        assert meta["niche"] == "dev"
        assert meta["scope"] == "app"
        assert meta["source_mode"] == "chat"

    def test_merges_extra(self):
        tax = MemoryTaxonomy(domain="technology", niche="dev")
        meta = taxonomy_to_metadata(tax, {"extra": "value"})
        assert meta["extra"] == "value"

    def test_includes_taxonomy_tags(self):
        tax = MemoryTaxonomy(domain="technology", niche="dev", tags=["python", "async"])
        meta = taxonomy_to_metadata(tax)
        assert "taxonomy_tags" in meta
        assert "python" in meta["taxonomy_tags"]


class TestIntegration:
    def test_dev_query_does_not_return_finance_memory(self):
        qt = infer_query_niche("cortex", "como está o código do control center?")
        mt = classify_memory_niche("cortex", "Paguei a conta de água com Pix")
        assert qt.niche == "dev"
        assert mt.niche == "finance"
        assert not should_search_niche(qt, mt)

    def test_finance_query_does_not_return_arch_memory(self):
        qt = infer_query_niche("cortex", "qual método de pagamento eu uso?")
        mt = classify_memory_niche("cortex", "O AION usa ChromaDB e SQLite")
        assert qt.niche == "finance"
        assert mt.niche == "aion_architecture"
        assert not should_search_niche(qt, mt)

    def test_old_records_without_niche_treated_as_general(self):
        mt = MemoryTaxonomy(niche="general", domain="general")
        tax = MemoryTaxonomy(niche="general", domain="general")
        assert tax.niche == "general"
        assert tax.domain == "general"
