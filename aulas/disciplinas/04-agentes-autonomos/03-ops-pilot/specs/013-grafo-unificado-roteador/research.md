# Research: Grafo Unificado com Roteamento Automático de Estratégia

Nenhum `NEEDS CLARIFICATION` ficou pendente no Technical Context do `plan.md`. Este documento
registra as decisões de abordagem tomadas a partir do código já existente no repositório.

## 1. Como estruturar o grafo unificado

- **Decision**: Construir `production-graph.ts` com `StateGraph`/`Annotation` do
  `@langchain/langgraph`, no mesmo padrão já usado em `src/agents/plan-and-execute.ts`
  (`Annotation.Root`, `START`/`END`, nós como funções `(state) => Partial<State>`). Os nós são:
  `context` (monta `buildPromptSections`/`buildContextBreakdown`, idêntico ao que `react.ts` faz
  hoje), `router` (decide a estratégia), um nó por estratégia-base (`react`, `plan-and-execute`,
  reaproveitando as implementações existentes de `ReasoningStrategy` como sub-chamadas, não como
  reimplementação), e `respond` (aplica `finishRun` para fechar o trace com o evento `answer`).
- **Rationale**: O projeto já tem o padrão estabelecido (`plan-and-execute.ts`); reaproveitar evita
  uma segunda forma de compor fluxos assíncronos com trace, e mantém a Camada de Serviço unificada.
  Tratar `react`/`plan-and-execute` como nós que *chamam* as estratégias existentes (em vez de
  reescrevê-las dentro do grafo) preserva o contrato `ReasoningStrategy` sem duplicar lógica.
- **Alternatives considered**:
  - *Um `switch` manual em `server.ts` decidindo a estratégia antes de chamar `.run()`*: mais
    simples, mas não atende ao pedido explícito de um grafo unificado com nós e trace por nó (FR-004
    da spec), e mistura a decisão de roteamento na camada HTTP.
  - *Reimplementar `react`/`plan-and-execute` como nós nativos do grafo unificado (sem reusar os
    módulos atuais)*: rejeitado — duplicaria lógica já testada e violaria DRY sem necessidade.

## 2. Como decidir a estratégia automaticamente

- **Decision**: Nó `router` usa `createModel().withStructuredOutput(routeSchema)`, onde
  `routeSchema = z.object({ route: z.enum([...nomes das estratégias base]), reason: z.string() })`
  — mesmo padrão de `verdictSchema`/`critique()` em `src/agents/reflection.ts`. O prompt do
  roteador inclui uma tabela markdown com nome de cada estratégia e uma descrição de quando usá-la
  (baseado no propósito de cada uma: `react` para tarefas diretas/exploratórias iterativas,
  `plan-and-execute` para tarefas que se beneficiam de um plano explícito de múltiplos passos).
- **Rationale**: `withStructuredOutput` já é o padrão do projeto para decisões estruturadas via LLM
  (reflection.ts). Reaproveitar o padrão mantém consistência de estilo e tratamento de erro.
- **Alternatives considered**:
  - *Roteamento por heurística determinística (regras/regex sobre o texto do pedido)*: mais barato e
    sem chamada de LLM extra, mas a spec pede uma decisão "baseada no conteúdo do pedido" com
    justificativa auditável (FR-002/FR-003), o que um LLM com `reason` atende diretamente e regras
    fixas não generalizam bem.
  - *Function-calling/tool-choice em vez de `withStructuredOutput`*: equivalente em resultado, mas
    diverge do padrão já estabelecido no código (`reflection.ts` usa `withStructuredOutput`).

## 3. Tratamento de falha/ambiguidade do roteador (FR-008)

- **Decision**: Igual a `critique()` em `reflection.ts` — a chamada ao roteador é envolvida em
  `try/catch`; qualquer falha do provedor, e qualquer saída que não valide contra `routeSchema` ou
  cujo `route` não esteja no conjunto de estratégias disponíveis, resulta em fallback para uma
  estratégia padrão pré-definida (`react`, mesma default hoje usada em `/chat` quando `strategy` não
  é informado). O evento de trace `route` registra o fallback com uma razão padronizada
  (`"fallback: <motivo>"`) em vez de omitir o evento.
- **Rationale**: Cumpre FR-008 (nunca falhar o pedido por causa do roteador) e mantém FR-003 (todo
  pedido roteado automaticamente tem um evento `route` com motivo), inclusive no caminho de erro.
- **Alternatives considered**: Deixar o erro subir e retornar HTTP 500 — rejeitado, viola FR-008 e o
  princípio já estabelecido em `react.ts`/`reflection.ts` de que `run()` nunca rejeita.

## 4. Contrato de override em `/chat`

- **Decision**: `chatRequestSchema.strategy` continua opcional e sem mudança de forma. Em
  `server.ts`, quando `strategy` vier no corpo, o nome resolvido (`reflect:<strategy>` se
  `reflect: true`, senão `strategy`) é repassado como uma entrada adicional de `StrategyInput`
  (`overrideRoute`) ao chamar a estratégia `"production"`; o grafo usa essa entrada para pular o nó
  `router` e ir direto para o nó da estratégia indicada, emitindo um evento `route` com
  `{ route: overrideRoute, reason: "override manual via /chat", manual: true }`. Quando `strategy`
  não vier, `server.ts` chama a estratégia `"production"` sem `overrideRoute`, deixando o roteador
  decidir.
- **Rationale**: Não requer mudança de schema HTTP (menor superfície de mudança, consistente com
  FR-011 — comportamento observável equivalente ao atual para quem já informa `strategy`).
  Continua reaproveitando `UnknownStrategyError` para nomes inválidos (FR-010): a validação do nome
  informado acontece antes de entrar no grafo, igual ao lookup atual em `deps.strategies`.
- **Alternatives considered**: Fazer o override inteiramente dentro de `server.ts` (sem passar pelo
  grafo, chamando a estratégia-base diretamente quando `strategy` vier) — rejeitado porque quebraria
  FR-004 (trace deve continuar mostrando as etapas `context`/`respond` de forma uniforme) e
  duplicaria a lógica de contexto/resposta que o grafo unificado centraliza.

## 5. Formato do evento de trace `route`

- **Decision**: Adicionar ao union `TraceEvent` (`src/domain/strategy.ts`) um novo variant:
  `{ type: "route"; route: string; reason: string; manual: boolean }`. `manual: true` sinaliza
  override (FR-007); `manual: false` sinaliza decisão automática (FR-003). Os demais nós
  (`context`, a estratégia executada, `respond`) continuam reaproveitando os tipos de evento já
  existentes (`thought`/`plan`/`action`/`observation`/`critique`/`answer`), sem necessidade de um
  evento genérico "nó" adicional — a etapa `context` não precisa de um evento próprio, pois hoje já
  não é observável (é preparação, não uma ação sobre o mundo); a spec exige a etapa "aparecer
  registrada" no trace, o que é satisfeito por `route` marcando o início do processamento
  pós-contexto e `answer` marcando o fim.
- **Rationale**: Reaproveita o mecanismo de union discriminado já existente, minimiza mudanças em
  consumidores de `TraceEvent` (ex.: `formatTrace` em `src/domain/trace.ts`, `observationsOf` em
  `reflection.ts`, que já filtra por `type` e ignora tipos desconhecidos).
- **Alternatives considered**: Emitir um evento `thought` genérico por nó (`"iniciando nó X"`) —
  rejeitado por poluir o trace com texto não estruturado quando um evento tipado (`route`) já cobre
  o requisito central (FR-003/FR-004) de forma auditável.
