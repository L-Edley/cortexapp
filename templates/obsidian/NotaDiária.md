---
id: "{{date:YYYY-MM-DD}}"
tipo: daily
data: "{{date:YYYY-MM-DD}}"
origem: cortex
tags: [daily]
sync_status: synced
created_at: "{{date:YYYY-MM-DDTHH:mm:ssZ}}"
updated_at: "{{date:YYYY-MM-DDTHH:mm:ssZ}}"
aion_processed: false
aion_version: null

humor: null
energia: null
foco: null
horas_trabalhadas: null
resumo: ""
---

# {{date:DD/MM/YYYY}} — Briefing

## Como estou?
- **Humor:** {{humor}}
- **Energia:** {{energia}}
- **Foco:** {{foco}}

## O que fiz hoje
- [ ]

## O que aprendi


## Gastos do dia

```dataview
TABLE valor, categoria
FROM "Financeiro"
WHERE data = "{{date:YYYY-MM-DD}}"
SORT data DESC
```

## Tarefas do dia

```dataview
TASK FROM "Tarefas"
WHERE !completed AND deadline = "{{date:YYYY-MM-DD}}"
```

## Ideias do dia

```dataview
LIST FROM "Ideias"
WHERE data = "{{date:YYYY-MM-DD}}"
```

## Revisão do Aion


## Links
- [[Daily]]
