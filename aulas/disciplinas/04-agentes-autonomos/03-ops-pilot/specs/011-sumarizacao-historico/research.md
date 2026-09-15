# Research: Sumarização de Histórico (Pruning de Contexto)

Nenhum item da Technical Context ficou como `NEEDS CLARIFICATION` — o projeto já tem padrões
estabelecidos para todas as decisões técnicas relevantes. Este documento registra as decisões e
por que os padrões existentes se aplicam.

## 1. Como detectar "8 novas mensagens saíram da janela"

**Decision**: Persistir em `conversation_summaries` um contador `summarized_through` = quantidade
de mensagens já incorporadas ao resumo acumulado. A cada `append` de mensagem, calcular
`totalMessages` da conversa; se `(totalMessages - 8) - summarized_through >= 8`, sumarizar o
próximo lote de 8 mensagens (as mensagens de índice `summarized_through` até
`summarized_through + 8`, em ordem cronológica), mesclar ao resumo existente e avançar
`summarized_through` em 8.

**Rationale**: É uma condição puramente aritmética sobre contagens (função pura, Princípio VI da
constitution), sem precisar guardar timestamps ou re-escanear todas as mensagens a cada request.
`totalMessages - 8` é exatamente o número de mensagens que já saíram (ou estão saindo) da janela
recente de 8; comparar com `summarized_through` garante que só disparamos quando um lote *completo*
de 8 saiu, nunca a cada mensagem individual (FR-005).

**Alternatives considered**:
- Recalcular o resumo a cada request lendo todas as mensagens antigas: rejeitado — é exatamente o
  comportamento que a spec proíbe (US2/FR-005), e reprocessa trabalho já sumarizado.
- Guardar um timestamp "última sumarização" e comparar com `created_at` das mensagens: mais frágil
  (relógio, timezone) e não expressa diretamente "8 mensagens", que é uma contagem, não um tempo.

## 2. Como obter o texto do resumo (decisões, fatos, pendências)

**Decision**: Reaproveitar o padrão de `defaultLearningReflector`
(`src/memory/learning-reflector.ts`): uma chamada `createModel().withStructuredOutput(schema)`
com um prompt de sistema dedicado, pedindo ao modelo para extrair decisões, fatos e pendências de
um lote de mensagens e, quando houver resumo anterior, mesclá-lo ao novo conteúdo em um único
texto de ~150 tokens. A função é injetável (`HistorySummarizerFn`), com uma implementação real
(`defaultHistorySummarizer`) e uma fake determinística usada nos testes.

**Rationale**: Consistência arquitetural — é o único outro ponto do sistema que já faz
"extração estruturada de uma troca de mensagens via LLM, com fallback seguro". Reusar o padrão
mantém a curva de aprendizado baixa e o comportamento de erro previsível (ver item 3).

**Alternatives considered**:
- Sumarização puramente extrativa (concatenar trechos-chave sem LLM): mais barato, mas a spec
  pede preservação semântica de "decisões, fatos e pendências" e mesclagem inteligente com o
  resumo anterior — tarefa naturalmente abstrativa, mal servida por heurísticas de texto puro.
- Chamar o modelo a cada mensagem para ir "atualizando incrementalmente": rejeitado, conflita
  diretamente com FR-005 (só a cada lote de 8).

## 3. Tratamento de falha na sumarização (FR-010)

**Decision**: Mesmo padrão de `reflectLearning` — a chamada ao sumarizador fica dentro de um
`try/catch` que nunca propaga. Em caso de falha, `summarized_through` **não avança** e o resumo
existente (ou ausência dele) é mantido; a tentativa é refeita naturalmente na próxima vez que a
condição do item 1 for reavaliada (próxima mensagem), sem lógica extra de retry/fila.

**Rationale**: Resolve o edge case da spec sem introduzir estado adicional (fila de retry,
contador de tentativas) — o próprio contador `summarized_through` já serve como "ainda não
sumarizado", então a próxima chamada de `/chat` tenta de novo automaticamente.

**Alternatives considered**:
- Marcar tentativa falha e re-tentar em background/cron: complexidade desnecessária para o escopo
  atual (sem infraestrutura de jobs no projeto).

## 4. Tamanho do resumo (~150 tokens) e limite de crescimento

**Decision**: Reaproveitar `estimateTokens` de `src/context/tokens.ts` (heurística
`length / 4`, já usada para `ContextBreakdown`) para validar/registrar o tamanho do resumo
gerado. O próprio prompt de sistema instrui o modelo a produzir ~150 tokens e a comprimir o
conteúdo anterior ao mesclar, em vez de concatenar sem limite; não há truncamento mecânico
adicional no código além da instrução ao modelo, mesmo padrão de "confiar na saída estruturada
validada por Zod" usado em `learning-reflector.ts`.

**Rationale**: Evita duplicar lógica de tokenização; a heurística já existente e testada no
projeto é suficiente para uma expectativa aproximada (a spec já admite variação de até 30% em
SC-003).

**Alternatives considered**:
- Tokenizador exato (ex.: tiktoken): rejeitado — o projeto já optou explicitamente por uma
  heurística barata sem dependência de tokenizador (research.md de 010-medicao-contexto).

## 5. Evento "summarize"

**Decision**: Emitir o evento como um `console.log`/log estruturado simples no momento em que a
sumarização é executada (sucesso ou falha), incluindo `conversationId` e o novo
`summarized_through`, seguindo o nível de observabilidade já usado no projeto (não há
infraestrutura de eventos/mensageria externa em `src/`).

**Rationale**: A spec (Assumptions) já define o evento como mecanismo de observabilidade, não
mensageria. Não há barramento de eventos no projeto — introduzir um seria complexidade não
justificada pela constitution.

**Alternatives considered**:
- EventEmitter interno dedicado: possível evolução futura, mas nenhum outro consumidor precisa
  disso hoje; adiado até haver necessidade concreta (YAGNI).

## Resumo das decisões

| Tópico | Decisão |
|---|---|
| Gatilho de sumarização | Contador `summarized_through` por conversa; dispara a cada lote completo de 8 |
| Geração do resumo | Função injetável via LLM estruturado, padrão de `learning-reflector.ts` |
| Falha na sumarização | Engolida; `summarized_through` não avança; tenta de novo na próxima mensagem |
| Tamanho do resumo | Heurística `estimateTokens` existente + instrução de prompt (~150 tokens) |
| Evento `summarize` | Log estruturado no ponto de execução, sem infraestrutura de mensageria |
