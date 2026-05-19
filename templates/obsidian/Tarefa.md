---
id: "{{title}}"
tipo: tarefa
data: "{{date:YYYY-MM-DD}}"
origem: cortex
tags: [tarefa]
sync_status: synced
created_at: "{{date:YYYY-MM-DDTHH:mm:ssZ}}"
updated_at: "{{date:YYYY-MM-DDTHH:mm:ssZ}}"
aion_processed: false
aion_version: null

prioridade: media
status: pendente
deadline: null
projeto: null
categoria: null
descricao: "{{title}}"
---

# {{title}}

## Descrição


## Status
- [ ] Pendente

## Prazo
{{#if deadline}}{{deadline}}{{else}}Sem prazo definido{{/if}}

## Links
- [[Tarefas]]
{{#if projeto}}- [[{{projeto}}]]{{/if}}
