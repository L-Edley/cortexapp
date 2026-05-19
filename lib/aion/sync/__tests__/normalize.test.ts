import { describe, it, expect } from "vitest";
import { normalizeObsidianNoteToRecord } from "../normalize";

describe("normalizeObsidianNoteToRecord", () => {
  it("normaliza task com campos completos", () => {
    const md = `---
id: "task-123"
tipo: tarefa
title: "Pagar internet"
descricao: "Pagar a conta de internet"
created_at: "2026-05-19T10:00:00.000Z"
updated_at: "2026-05-19T10:00:00.000Z"
tags: [tarefa, contas]
---

# Pagar internet

## Descrição
Pagar a conta de internet
`;

    const record = normalizeObsidianNoteToRecord(md, "Tarefas/task-123.md");
    expect(record.id).toBe("task-123");
    expect(record.type).toBe("task");
    expect(record.title).toBe("Pagar internet");
    expect(record.description).toBe("Pagar a conta de internet");
    expect(record.tags).toEqual(["tarefa", "contas"]);
  });

  it("normaliza finance (gasto)", () => {
    const md = `---
id: "finance-456"
tipo: gasto
title: "Almoço"
valor: 32.5
categoria: alimentacao
created_at: "2026-05-19T12:00:00.000Z"
tags: [financeiro, gasto]
---

# Almoço
`;

    const record = normalizeObsidianNoteToRecord(md, "Financeiro/finance-456.md");
    expect(record.id).toBe("finance-456");
    expect(record.type).toBe("finance");
    expect(record.amount).toBe(32.5);
    expect(record.category).toBe("alimentacao");
  });

  it("normaliza idea", () => {
    const md = `---
id: "idea-789"
tipo: ideia
title: "App de notas"
created_at: "2026-05-19T10:00:00.000Z"
tags: [ideia]
---

# App de notas
`;

    const record = normalizeObsidianNoteToRecord(md, "Ideias/idea-789.md");
    expect(record.id).toBe("idea-789");
    expect(record.type).toBe("idea");
    expect(record.title).toBe("App de notas");
  });

  it("aceita 'tipo' → type", () => {
    const md = `---
id: "x"
tipo: tarefa
title: "Teste"
created_at: "2026-01-01T00:00:00.000Z"
tags: []
---
`;
    const record = normalizeObsidianNoteToRecord(md);
    expect(record.type).toBe("task");
  });

  it("aceita 'valor' → amount", () => {
    const md = `---
id: "x"
tipo: gasto
title: "Teste"
valor: 99.9
created_at: "2026-01-01T00:00:00.000Z"
tags: []
---
`;
    const record = normalizeObsidianNoteToRecord(md);
    expect(record.amount).toBe(99.9);
  });

  it("aceita 'categoria' → category", () => {
    const md = `---
id: "x"
tipo: tarefa
title: "Teste"
categoria: trabalho
created_at: "2026-01-01T00:00:00.000Z"
tags: []
---
`;
    const record = normalizeObsidianNoteToRecord(md);
    expect(record.category).toBe("trabalho");
  });

  it("funciona com campos faltando (fallback seguro)", () => {
    const md = `---
---
`;
    const record = normalizeObsidianNoteToRecord(md);
    expect(record.id).toBeTruthy();
    expect(record.title).toBe("Registro sem título");
    expect(record.tags).toEqual([]);
    expect(record.source).toBe("obsidian");
    expect(record.sync_status).toBe("pending");
    expect(record.aion_processed).toBe(false);
    expect(record.created_at).toBeTruthy();
    expect(record.updated_at).toBeTruthy();
  });

  it("preserva campos extras em raw", () => {
    const md = `---
id: "x"
tipo: tarefa
title: "Extra test"
created_at: "2026-01-01T00:00:00.000Z"
tags: []
forma_pagamento: credito
parcela: 3
---
`;
    const record = normalizeObsidianNoteToRecord(md);
    expect(record.raw).toBeTruthy();
    expect(record.raw!.forma_pagamento).toBe("credito");
    expect(record.raw!.parcela).toBe(3);
  });

  it("extrai content do corpo do markdown", () => {
    const md = `---
id: "x"
tipo: tarefa
title: "Corpo test"
created_at: "2026-01-01T00:00:00.000Z"
tags: []
---

# Corpo test

Algum conteúdo aqui
`;
    const record = normalizeObsidianNoteToRecord(md);
    expect(record.content).toContain("Algum conteúdo");
  });
});
