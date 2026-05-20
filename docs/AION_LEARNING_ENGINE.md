# Aion Learning Engine & World Radar

Este documento descreve como o Aion adquire e armazena novos conhecimentos, garantindo que o seu provedor de IA online (Groq, etc.) seja usado apenas quando estritamente necessário.

## Como o Aion Aprende

O aprendizado no Aion segue um fluxo reativo (via interação do usuário) e proativo (via World Radar). 
Sempre que uma mensagem ou comando chega ao `reason()`, o sistema detecta se há uma "Lacuna de Conhecimento" (`Knowledge Gap`). Se existir, e se a informação não estiver na doutrina oficial nem na memória pessoal, o Aion aciona o **Learning Engine** que consulta o provedor LLM configurado (Groq ou fallbacks).

## Quando Chama Groq (Learning Engine Acionado)
- **Questões Estratégicas**: e.g., *"Como estruturar o Night Research?"*
- **Tendências / Novidades**: e.g., *"Novidades sobre agentes de IA"*
- **Informações Voláteis / Atuais**: e.g., *"Preço atual do dólar"*, *"Clima de hoje"*
- **Decisões Estruturais do Projeto**: e.g., *"Decidimos usar o Dexie como banco local"*
- **Buscas de Conhecimento Estável**: e.g., *"Qual o conceito de PWA offline?"*

## Quando NÃO Chama Groq (Segurança e Economia)
- **Memórias Pessoais e Doutrina**: Comandos como *"salve que..."*, ou perguntas cruciais que a Doutrina Oficial já responde (*"Qual é o banco principal?"*).
- **Smalltalk**: Saudações curtas resolvidas de forma estática (*"bom dia", "eae"*).
- **Gerenciamento Transacional**: Criação de tarefas (*"me lembra de..."*), registro de gastos (*"gastei 50 reais"*).
- **Dados Sensíveis**: O Aion intercepta e bloqueia a persistência de senhas, cartões de crédito e PIIs no momento de salvar (mesmo que haja chamada, os dados não viram aprendizado duradouro).
- **Hit de Cache**: Se uma pesquisa sobre o dólar ocorreu há 1 hora, o cache responde e o Groq é poupado.

## Diferença entre Knowledge, Memory e SearchCache

1. **Memory (`memory.ts`)**: Usado para preferências exclusivas do usuário, contextos de projeto, comandos imperativos ("lembre que eu gosto de X"). Possui altíssima confiança.
2. **Knowledge (`knowledge.ts`)**: Para aprendizados gerais que podem durar muito tempo ou ser provisórios (trends). São fatos de mercado, tecnologias e estratégias obtidos pelo LLM que complementam o conhecimento base do sistema.
3. **SearchCache (`searchCache.ts`)**: Exclusivo para cotações, dados altamente perecíveis, clima, etc. Evita entupir o Knowledge de "lixo datado". 

## TTL (Time-To-Live)

- **Fresh Info** (Ex: preço do dólar): Expira do `searchCache` em **4 horas**.
- **Trends** (Ex: novidades do React): Expira do `knowledge` em **15 dias**.
- **Stable Knowledge / Strategy**: Salvo permanentemente no `knowledge` (sem expiração).

## Segurança Contra Dados Sensíveis

O `shouldSaveLearning()` possui bloqueios via Expressões Regulares contra termos como `senha`, `token`, `api_key`, `cartão`, `cvv`, dados íntimos, médicos, processuais, etc. 
Se qualquer termo sensível for detectado no input original ou na resposta do provedor, o Learning Engine pode até usar a resposta em tempo real, mas **jamais** arquivará na base Vetorial do Brain (Knowledge ou Memory).

## Próximos Passos (Night Research)

A arquitetura atual preparou a função `runWorldRadar()` para consultar tópicos de forma assíncrona. O próximo passo é integrar um agendamento noturno local (`Night Research`), ativado por CRON do App Mobile ou via Web Worker para preencher o Aion Brain com as novidades de tecnologia e do mercado de maneira totalmente stealth, garantindo um "Daily Briefing" fresco todos os dias de manhã sem atraso de carregamento.
