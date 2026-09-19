# Research: Modo Equipe (Supervisor Multi-Agente)

Nenhum item de Technical Context ficou marcado como `NEEDS CLARIFICATION` — a exploração do
código existente (`production-graph.ts`, `registry.ts`, `domain/strategy.ts`, `domain/trace.ts`,
`agents/tools.ts`, `agents/approval-guardrail.ts`, `store/sqlite/request-trace-schema.ts`,
`web/src/trace/trace-event.tsx`) já respondeu todas as dúvidas técnicas relevantes. Este documento
registra as decisões de design e as alternativas descartadas.

## Decisão 1 — Onde o modo equipe entra no sistema de rotas

**Decision**: "Modo equipe" é implementado como mais uma `ReasoningStrategy` (nome `"team"`),
registrada em `src/agents/registry.ts` junto com `react`, `plan-and-execute`, `reflect:*` e
`production`. É selecionada pelo cliente via o campo `strategy: "team"` já existente no corpo de
`POST /chat` (`src/http/server.ts`), exatamente como qualquer outra estratégia nomeada.

**Rationale**: O sistema já tem o conceito de "rota" na forma de `strategy` (seleção explícita) e
`route` (decisão automática interna do `production-graph`). Criar uma rota HTTP nova duplicaria
lógica de request/response, autenticação de sessão, persistência de trace e CORS já resolvidos em
`POST /chat`. Reaproveitar o seletor de estratégia mantém FR-001 ("rota dedicada ao modo equipe")
satisfeito sem violar a Camada Explícita (Princípio I): a fábrica de estratégias já é o ponto de
extensão pensado para isso.

**Alternatives considered**:
- *Nova rota Express (`POST /team`)*: rejeitada — duplicaria toda a lógica de `requestId`,
  persistência de trace e guardrails já centralizada em `/chat`, sem ganho para o operador.
- *Novo valor de `route` dentro do `production-graph` existente (ao lado de `react`/`plan-and-execute`)*:
  rejeitada — o router de `production-graph` decide entre *estratégias de resolução de uma única
  tarefa*; o modo equipe tem uma máquina de estados própria (handoffs, blackboard, teto de 8) que não
  se encaixa como mais um branch condicional do grafo existente sem acoplar as duas máquinas de
  estado. Mantê-lo como uma `ReasoningStrategy` independente preserva o isolamento.

## Decisão 2 — Forma do estado do grafo (blackboard)

**Decision**: Novo `Annotation.Root` em `src/team/state.ts`, seguindo o mesmo padrão de
`ProductionGraphState`, com um campo `blackboard: Annotation<readonly BlackboardEntry[]>({ reducer:
(a, b) => a.concat(b), default: () => [] })`, onde `BlackboardEntry = { role: TeamRole; summary:
string; producedAt: number }`. O campo `trace` reaproveita o mesmo reducer de concatenação já usado
em `ProductionGraphState.trace`.

**Rationale**: O reducer de concatenação (`concat`) já é o idiom estabelecido no código para campos
que "acumulam" ao longo da execução do grafo (usado para `trace`). Um `BlackboardEntry` por
contribuição de papel é suficiente para o supervisor decidir o próximo passo (FR-003) sem precisar
modelar um formato rico de "memória" — o quadro é efêmero, por execução, conforme a suposição do
spec.

**Alternatives considered**:
- *Blackboard como string única concatenada*: rejeitada — perde a estrutura por papel, dificultando
  tanto a decisão do supervisor quanto a exibição de handoffs.
- *Persistir o blackboard em `OpsStore`/SQLite entre conversas*: rejeitada — fora do escopo (ver
  Assumptions do spec: "não há requisito de persistência entre conversas distintas").

## Decisão 3 — Decisão do supervisor (`withStructuredOutput`)

**Decision**: `src/team/supervisor.ts` expõe uma função `decideNext(state): Promise<{ next:
TeamRole | "respond"; brief: string }>` que chama `createModel().withStructuredOutput(z.object({
next: z.enum(["analista", "planejador", "executor", "respond"]), brief: z.string().min(1) }))`,
seguindo o padrão já usado em `production-graph.ts` (`routeSchema`), `reflection.ts` (verdictSchema)
e `plan-and-execute.ts` (schema de replanejamento). Assim como o roteador do `production-graph`, a
função de decisão é injetável (parâmetro com default) para permitir fakes determinísticos em teste,
igual a `RouteFn` em `production-graph.test.ts`.

**Rationale**: Reaproveita um padrão já testado e revisado no código (`.withStructuredOutput(schema)`
seguido de `schema.parse(raw)` para segurança adicional), evitando introduzir uma nova forma de
parsing estruturado só para este recurso. A saída inclui um valor sentinela `"respond"` para permitir
que o supervisor decida encerrar a orquestração antes do teto de 8, cobrindo o Edge Case "resolvida
por um único papel".

**Alternatives considered**:
- *Function calling livre (sem schema Zod)*: rejeitada — viola o Princípio II (Validações na
  Fronteira) e diverge do padrão único usado em todo o restante do código.

## Decisão 4 — Fallback quando o supervisor não decide (saída malformada/ambígua)

**Decision**: Se `withStructuredOutput` lançar ou a saída falhar na validação Zod, o supervisor
resolve para um fallback determinístico: se o blackboard já contém pelo menos uma entrada, encerra e
responde com o que já foi produzido (equivalente a `next: "respond"`); se o blackboard está vazio,
direciona para `analista` como ponto de partida seguro (papel somente-leitura, sem risco). Este
fallback é registrado como um evento `"handoff"` com `reason: "fallback: decisão do supervisor
malformada"`, tornando o comportamento visível no "ver raciocínio" em vez de silencioso.

**Rationale**: Espelha o padrão já usado no roteador de `production-graph.ts`, que nunca deixa uma
falha de parsing travar a requisição — cai para `DEFAULT_ROUTE = "react"`. Aqui o "default" seguro é
o papel sem poder de ação (analista) ou o encerramento, nunca o executor (Princípio V).

**Alternatives considered**:
- *Lançar erro e falhar a requisição*: rejeitada — contraria o padrão de resiliência já estabelecido
  (feature 014) e o Princípio III (erros previsíveis viram classes de domínio tratadas na borda, não
  propagadas cruamente ao operador).

## Decisão 5 — Escopo de ferramentas por papel

**Decision**: Cada papel recebe um subconjunto de `makeTools(store)` filtrado por nome de
ferramenta:
- `analista`: `["list_alerts", "list_incidents", "consultar_runbook"]` (somente leitura).
- `planejador`: `[]` (nenhuma ferramenta).
- `executor`: `["open_incident", "resolve_incident"]`, sempre sobre o `guardedStore` já produzido por
  `withApprovalGuardrail` em `http/server.ts` — o mesmo `store` passado a `react`/`plan-and-execute`
  hoje, sem nenhum store alternativo criado para o modo equipe.

**Rationale**: `makeTools` já retorna um array nomeado, então filtrar por `name` é suficiente e não
exige alterar `agents/tools.ts`. Reaproveitar exatamente o `guardedStore` (em vez de instanciar um
novo `OpsStore`) é o que garante FR-007 (executor sujeito às mesmas confirmações/guardrails, "sem
bypass") por construção, não por convenção.

**Alternatives considered**:
- *Criar um novo mecanismo de permissão por papel dentro de `agents/tools.ts`*: rejeitada — maior
  superfície de mudança para um requisito que já é satisfeito por filtragem simples no lado do
  chamador (`src/team/roles/*.ts`).

## Decisão 6 — Evento de trace "handoff"

**Decision**: Estender a união discriminada `TraceEvent` em `src/domain/strategy.ts` com:

```ts
| { type: "handoff"; from: TeamRole | "supervisor"; to: TeamRole | "respond"; reason: string }
```

e adicionar o branch correspondente em `formatEvent` (`src/domain/trace.ts`) e em
`web/src/trace/trace-event.tsx` (o `never` exhaustiveness check do frontend forçará essa adição a
não ser esquecida).

**Rationale**: Segue exatamente o mesmo padrão do evento `"route"` já existente (`{ type: "route";
route: string; reason: string; manual: boolean }`), reaproveitando a mesma tabela `trace_events`
(coluna `payload` já é serialização genérica de `TraceEvent`, nenhuma migração de schema necessária)
e o mesmo pipeline de persistência (`appendTraceEvents`) e logging (`src/obs/logger.ts`).

**Alternatives considered**:
- *Reaproveitar o evento `"route"` existente para representar handoffs*: rejeitada — semanticamente
  diferente (route decide entre *estratégias*, handoff decide entre *papéis dentro de uma mesma
  estratégia*); reaproveitar confundiria a UI e a leitura do trace persistido.

## Decisão 7 — Teto de 8 transições

**Decision**: Um contador de handoffs é mantido no estado do grafo (`handoffCount`) e incrementado a
cada transição supervisor→papel. Ao atingir 8, o grafo força a transição para o nó `respond` com um
evento `"handoff"` adicional (`to: "respond"`, `reason: "teto de 8 transições atingido"`) e a
resposta final inclui uma observação de que foi truncada pelo teto (FR-013). Complementarmente, o
`recursionLimit` do `StateGraph.invoke` é configurado com folga suficiente (mesmo padrão de
`recursionLimitFor` em `react.ts`) para nunca ser o fator limitante — o teto de negócio (8) é sempre
verificado primeiro, de forma explícita e testável.

**Rationale**: Um contador explícito no estado é mais fácil de testar de forma determinística
(FR-011/FR-012/FR-013, User Story 4) do que depender apenas do `recursionLimit` genérico do
LangGraph, que produziria um erro de infraestrutura em vez de uma resposta controlada ao operador.

**Alternatives considered**:
- *Depender só do `recursionLimit` do LangGraph*: rejeitada — resultaria em exceção genérica em vez
  de uma resposta final ao operador, violando FR-012.
