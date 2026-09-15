# Research: Medição de Consumo de Contexto

## 1. Onde está o "uso real" reportado pelo LangChain

**Decision**: extrair de `AIMessage.usage_metadata.input_tokens` — campo padronizado do
`@langchain/core` (`UsageMetadata`, `src/messages/metadata.d.ts`), preenchido por qualquer chat
model que reporte uso (inclui `ChatOpenAI`, usado hoje via OpenRouter). Acessado num callback
`handleLLMEnd(output: LLMResult)`: cada `output.generations[][]` é um `ChatGeneration` com `.message`
(a `AIMessage`); somamos `message.usage_metadata?.input_tokens` de todas as generations de todas as
chamadas da execução.

**Rationale**: é o único campo de uso que o LangChain padroniza entre providers — não depende de
parsear `llmOutput` (formato legado, específico de cada integração). Reaproveita o mesmo ponto de
extensão que `CallCounter` já usa (`handleLLMStart`/`handleChatModelStart`), então não introduz um
segundo mecanismo de callback.

**Alternatives considered**:
- Ler `output.llmOutput?.tokenUsage?.promptTokens` (formato legado da API OpenAI): rejeitado —
  específico do provedor, e o campo padronizado (`usage_metadata`) já cobre o mesmo dado de forma
  portátil caso o provedor mude no futuro (`OPENROUTER_MODEL` é configurável).
- Tokenizar o prompt no cliente (ex.: `tiktoken`) para ter um "real" calculado localmente: rejeitado
  — a spec (FR-001) pede o valor que "o provedor efetivamente relatou", não uma segunda estimativa;
  além disso adicionaria uma dependência pesada só para essa métrica.

## 2. Por que a ausência de uso real nunca é um erro

**Decision**: `RunTracker` mantém uma soma acumulada e uma flag interna "algum uso real foi visto
nesta execução". `promptTokensReal` no `RunMetrics` final é a soma quando a flag é verdadeira, e
`undefined` quando nenhuma chamada reportou uso (ex.: um provedor que não populate
`usage_metadata`).

**Rationale**: distingue "0 tokens reais" (que seria enganoso) de "não sei" (FR-005). `undefined` é
serializado como campo ausente no JSON de resposta do `/chat` — natural em TypeScript/Zod, e não
exige um valor sentinela mágico (`-1`, `null` ambíguo com "carregando").

**Alternatives considered**: usar `0` como valor padrão quando ausente: rejeitado explicitamente pela
spec (FR-005 — "em vez de reportar um número inventado ou um zero que possa ser confundido com
consumo real nulo").

## 3. `estimateTokens`: heurística de chars/4

**Decision**: `estimateTokens(text: string): number = Math.ceil(text.length / 4)`. Função pura, sem
dependência de tokenizador. Usada para compor a estimativa por fonte (`contextBreakdown`), nunca para
o valor "real".

**Rationale**: é a heurística pedida explicitamente pelo usuário; é a aproximação padrão da indústria
para textos em inglês/português quando não se quer carregar um tokenizador específico do modelo —
suficiente para a spec (Assumptions: "não depende do tokenizador exato... consistente e
proporcional ao tamanho do texto").

**Alternatives considered**: usar um tokenizador real (ex.: `tiktoken`, ou o tokenizer local já usado
para embeddings em `@huggingface/transformers`, de 008): rejeitado para esta feature — adicionaria
custo (carregar um segundo modelo/tokenizador) só para uma estimativa que a spec já aceita como
aproximada; heurística determinística e barata é suficiente e mais previsível de testar.

## 4. Como compor o `contextBreakdown` por fonte

**Decision**: cada estratégia calcula, com `estimateTokens`, quatro números a partir do que já tem em
`StrategyInput`:
- `history`: soma de `estimateTokens(message.content)` de `input.history`.
- `memories`: soma de `estimateTokens(fact)` de `input.memories`.
- `systemPrompt`: `estimateTokens(...)` sobre o(s) texto(s) fixo(s) de instrução daquela estratégia
  (`SYSTEM_PROMPT` em `react.ts`; `PLANNER_PROMPT + EXECUTOR_PROMPT + REPLANNER_PROMPT` concatenados
  em `plan-and-execute.ts`).
- `request`: `estimateTokens(input.request)`.

**Rationale**: cada estratégia é quem sabe exatamente qual texto de instrução usa — calcular isso em
`server.ts` exigiria importar constantes internas de cada agente, invertendo a camada (regra I da
Constitution: `http` não deveria conhecer detalhes de prompt de `agents`). Já é o padrão hoje: cada
estratégia monta seu próprio prompt e devolve `RunMetrics` via `RunTracker`/objeto manual.

**Alternatives considered**: calcular a decomposição em `server.ts`, com um texto de "instruções
fixas" fixo e único para todas as estratégias: rejeitado — plan-and-execute usa três prompts
diferentes (planner/executor/replanner) em vez de um só, e a decomposição ficaria imprecisa/errada
para essa estratégia especificamente.

## 5. `reflect:<strategy>` (`runReflection`): como agregar entre tentativas

**Decision**: `runReflection` (`src/agents/reflection.ts`) já soma `llmCalls` de cada tentativa da
base mais as chamadas do crítico; da mesma forma, soma `promptTokensReal` de cada `runBase.metrics`
(tratando `undefined` como 0 na soma, mas preservando `undefined` no resultado final se **nenhuma**
tentativa reportou uso real). O `contextBreakdown` reportado é o da **última** tentativa executada
(a que gerou a resposta final) — como o `request` cresce a cada tentativa reprovada (feedback
anexado), refletir a tentativa final é o que efetivamente "custou" a resposta entregue.

**Rationale**: consistente com FR-002 (somar chamadas de uma interação) e com o Edge Case da spec
("a composição estimada descreve o contexto da interação como um todo, priorizando a última
tentativa executada, que é a que produziu a resposta final").

**Alternatives considered**: somar `contextBreakdown` de todas as tentativas: rejeitado — inflaria a
estimativa de forma enganosa, já que tentativas reprovadas não fazem parte do prompt da resposta
final entregue ao usuário (o `request` de cada tentativa já inclui o feedback anterior como texto,
então somar contaria o mesmo conteúdo várias vezes).

## Todas as NEEDS CLARIFICATION resolvidas

Nenhum item do Technical Context ficou marcado como `NEEDS CLARIFICATION` — decisões acima cobrem a
fonte do uso real, o tratamento de ausência, a heurística de estimativa, a composição por fonte e a
agregação em `reflect:*`.
