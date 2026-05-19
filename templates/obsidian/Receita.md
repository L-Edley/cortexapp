---
id: "{{title}}"
tipo: receita
data: "{{date:YYYY-MM-DD}}"
origem: cortex
tags: [financeiro, receita]
sync_status: synced
created_at: "{{date:YYYY-MM-DDTHH:mm:ssZ}}"
updated_at: "{{date:YYYY-MM-DDTHH:mm:ssZ}}"
aion_processed: false
aion_version: null

valor: 0.00
categoria: salario
fonte: null
recorrente: false
projeto: null
descricao: "{{title}}"
---

# {{title}}

## Descrição


## Fonte
{{#if fonte}}{{fonte}}{{else}}Não informada{{/if}}

## Recorrência
{{#if recorrente}}Recorrente{{else}}Eventual{{/if}}

## Links
- [[Financeiro]]
{{#if projeto}}- [[{{projeto}}]]{{/if}}
