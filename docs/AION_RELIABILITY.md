# Aion Reliability & Error Recovery Map

Este documento estabelece o mapa técnico de resiliência e recuperação de erros da inteligência artificial **Aion**, garantindo que o sistema continue funcional e estável mesmo diante de falhas de rede, conexões de APIs, indisponibilidade do microfone ou offline de bases integradas.

---

## 1. Classificação de Erros (`AionErrorType`)

Todos os erros capturados nas camadas de backend e frontend são interceptados e normalizados nos seguintes tipos técnicos mapeados:

| Tipo Técnico (`AionErrorType`) | Causa Comum | Impacto Primário |
| :--- | :--- | :--- |
| `stream_failed` | Falha de rede ou timeout durante a leitura dos chunks SSE do `/api/aion/stream`. | Interrupção da transmissão token-a-token da resposta. |
| `provider_timeout` | O serviço de LLM ultrapassa o limite padrão de tolerância (ex: 8-15s). | Atraso severo de resposta cognitiva. |
| `provider_failed` | Instabilidade temporária nas rotas de LLM (Groq, OpenCode, Ollama 500/502). | Aion sem capacidade de raciocinar com o LLM. |
| `tts_failed` | Falha na resposta da API ElevenLabs ou bloqueio na Web Speech nativa do navegador. | Resposta falada de áudio ausente. |
| `speech_recognition_failed` | Permissão de microfone negada ou erro na API nativa de voz. | Entrada por voz indisponível. |
| `storage_failed` | Problema ao gravar no banco local IndexedDB ou erros no provedor de storage. | Falha ao persistir dados do usuário (histórico/preferências). |
| `semantic_search_failed` | Erro ao carregar biblioteca de embeddings locais ou problemas vetoriais. | Falha na recuperação de longo prazo (memória semântica). |
| `obsidian_offline` | Conexão local com a porta 23531 recusada ou Obsidian fechado. | Ausência de notas integradas. |
| `unknown` | Exceções gerais de tempo de execução não catalogadas. | Erros aleatórios não tratados. |

---

## 2. Mapa de Falhas e Estratégias de Recuperação

### 2.1 Falha na Stream (`stream_failed`)
* **Comportamento Esperado**: Se a rota `/api/aion/stream` falhar, o CommandCenter interrompe a leitura da stream, cancela as atualizações de status e automaticamente faz um **fallback imediato** acionando a rota síncrona `POST /api/aion`.
* **Ação de Recuperação**: Tenta a resposta em requisição POST convencional para recuperar o texto completo.
* **Mensagem Amigável**: `"Tive um problema na transmissão da resposta em tempo real, mas consegui recuperar o texto completo."`

### 2.2 Falha no Cérebro/LLM (`provider_failed` & `provider_timeout`)
* **Comportamento Esperado**: Se todos os LLM Providers em nuvem falharem, o roteador ativa o **Ollama local** como backup ou aciona a cadeia local baseada em heurísticas simples.
* **Ação de Recuperação**: Se a chamada final também falhar, o CommandCenter captura a exceção globalmente no formulário principal de envio e exibe um aviso de recuperação elegante.
* **Mensagem Amigável**: `"Tive uma instabilidade ao conectar com meu cérebro principal. Tentei um caminho alternativo."`

### 2.3 Falha na Síntese de Voz (`tts_failed`)
* **Comportamento Esperado**: A voz falhar não pode impedir que o texto apareça. A geração do texto é concluída com sucesso e renderizada na UI. O erro do TTS é silenciosamente suprimido e a interface volta ao estado `idle` em vez de travar no modo `speaking`.
* **Ação de Recuperação**: Desativa a fala ativa e mantém o feedback puramente textual.
* **Mensagem Amigável**: `"A voz falhou temporariamente, mas a resposta textual está totalmente operacional."`

### 2.5 Falha no Reconhecimento de Voz (`speech_recognition_failed`)
* **Comportamento Esperado**: Se o botão de microfone falhar ao obter permissão ou retornar erros técnicos, ele notifica o status `error` temporariamente no botão e convida o usuário a digitar.
* **Ação de Recuperação**: Volta ao modo `idle` em 3 segundos e mantém a caixa de texto livre para digitação normal.
* **Mensagem Amigável**: `"O microfone não pôde ser ativado ou não está disponível. Você pode digitar normalmente."`

### 2.6 Falha no Armazenamento (`storage_failed`)
* **Comportamento Esperado**: Falhas ao salvar novos aprendizados, records ou históricos não podem travar as transições de tela ou impedir o fluxo da conversa.
* **Ação de Recuperação**: Armazena as mensagens ativas em memória volátil da sessão (`useState`) e prossegue com a interface.
* **Mensagem Amigável**: `"Tive um problema ao salvar as informações, mas podemos continuar conversando normalmente."`

### 2.7 Falha na Busca Semântica (`semantic_search_failed`)
* **Comportamento Esperado**: Erros vetoriais não impedem o cérebro do Aion de raciocinar.
* **Ação de Recuperação**: Roda o pipeline de raciocínio principal (`reason()`) omitindo o bloco vetorial enriquecido e procedendo apenas com o histórico de sessão clássico.
* **Mensagem Amigável**: `"Tive um problema na busca de memória de longo prazo, mas processei sua solicitação com o contexto disponível."`

---

## 3. Telemetria e Monitoramento Seguro

Toda recuperação de falha bem-sucedida ou erro capturado é registrado no **Diagnostics Panel** (quando o debug está ativo ou em ambiente de desenvolvimento):

### Riscos Restantes Mapeados
1. **Rede Completamente Offline**: Sem internet, os roteadores em nuvem não funcionam. O app dependerá exclusivamente de cache e modelo local (se houver Ollama rodando localmente).
2. **Autoplay no Navegador**: Navegadores bloqueiam áudio espontâneo sem interação prévia do usuário. O TTS é ativado de forma segura apenas após o clique explícito de envio do usuário.
