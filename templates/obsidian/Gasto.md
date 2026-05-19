---
id: "{{title}}"
tipo: gasto
data: "{{date:YYYY-MM-DD}}"
origem: cortex
tags: [financeiro, gasto]
sync_status: synced
created_at: "{{date:YYYY-MM-DDTHH:mm:ssZ}}"
updated_at: "{{date:YYYY-MM-DDTHH:mm:ssZ}}"
aion_processed: false
aion_version: null

valor: 0.00
categoria: geral
forma_pagamento: null
parcela: null
projeto: null
descricao: "{{title}}"
---

# {{title}}

## Descrição


## Categoria
`{{categoria}}`

## Parcelamento
{{#if parcela}}{{parcela}}{{else}}À vista{{/if}}

## Links
- [[Financeiro]]
{{#if projeto}}- [[{{projeto}}]]{{/if}}
