# Contract: Estratégia "team" (interno) e evento de trace "handoff"

O modo equipe não introduz nenhum endpoint HTTP novo — ele é acessado pelo contrato já existente de
`POST /chat`, apenas com um novo valor aceito no campo `strategy`. Este documento descreve (a) o
contrato de código que `src/team/` deve expor para se encaixar na fábrica de estratégias já
existente, e (b) a extensão de contrato observável pelo cliente (payload de `TraceEvent`).

## 1. Contrato de código: `ReasoningStrategy` (reaproveitado, sem alteração de interface)

```ts
// src/domain/strategy.ts (já existente, não alterado nesta feature)
export interface ReasoningStrategy {
  readonly name: string; // "team"
  run(input: StrategyInput): Promise<StrategyRun>;
}
```

`src/team/team-graph.ts` MUST exportar uma função `buildTeamStrategy(...deps): ReasoningStrategy`
com `name === "team"`, registrada em `src/agents/registry.ts` como `strategies.team`. Nenhum campo
novo é adicionado a `StrategyInput`/`StrategyRun` — o modo equipe consome exatamente o mesmo
contrato de entrada/saída que `react`/`plan-and-execute`/`production` já usam.

## 2. Contrato HTTP observável: seleção da estratégia "team"

Reaproveita `POST /chat` (`src/http/server.ts`), sem alteração de schema de request. Exemplo:

```http
POST /chat
Content-Type: application/json

{
  "conversationId": "c-123",
  "message": "Investigue o pico de erros do serviço de pagamentos e proponha uma ação",
  "strategy": "team"
}
```

**Response** (schema inalterado — `answer`, `requestId`, etc. — mesmo formato de qualquer outra
estratégia):

```json
{
  "answer": "...",
  "requestId": "r-456"
}
```

O cliente recupera o raciocínio completo, incluindo os eventos `"handoff"`, via o endpoint já
existente `GET /requests/:id` (feature 015), que devolve o `trace` ordenado.

## 3. Contrato de payload: evento `TraceEvent` variante `"handoff"`

Extensão da união discriminada já pública (consumida hoje pelo War Room Console em
`web/src/api/types.ts`):

```ts
export type TraceEvent =
  | { type: "thought"; text: string }
  | { type: "plan"; steps: readonly string[] }
  | { type: "action"; tool: string; args: Readonly<Record<string, unknown>>; callId?: string }
  | { type: "observation"; callId?: string; ok: boolean; result?: unknown; error?: string }
  | { type: "critique"; text: string }
  | { type: "answer"; text: string; partial: boolean }
  | { type: "route"; route: string; reason: string; manual: boolean }
  | { type: "fallback"; primaryModel: string; fallbackModel: string; reason: string }
  | { type: "handoff"; from: "supervisor" | "analista" | "planejador" | "executor";
      to: "analista" | "planejador" | "executor" | "respond"; reason: string }; // NOVO
```

**Exemplo de payload** (o que aparece em `trace_events.payload` e no array `trace` da resposta de
`GET /requests/:id`):

```json
{ "type": "handoff", "from": "supervisor", "to": "analista", "reason": "Nenhum achado ainda; iniciar pela investigação de leitura." }
```

```json
{ "type": "handoff", "from": "analista", "to": "planejador", "reason": "Causa raiz identificada; falta organizar um plano de ação." }
```

```json
{ "type": "handoff", "from": "executor", "to": "respond", "reason": "teto de 8 transições atingido" }
```

**Consumers obrigados a tratar a nova variante** (breaking se ignorados, pois usam checagem
exaustiva `never`):
- `web/src/trace/trace-event.tsx` — precisa de um novo `case "handoff":` no `switch` de renderização.
- `web/src/api/types.ts` — precisa espelhar a união com a nova variante.
- `src/domain/trace.ts` (`formatEvent`) — precisa de um novo `case "handoff":` para a representação
  textual usada em logs (`src/obs/logger.ts`) e em qualquer formatação server-side do trace.

## 4. Garantias comportamentais (verificáveis por teste, não apenas por tipo)

- Nunca existe evento `"action"` emitido por um passo cujo `BlackboardEntry.role` seja `planejador`
  (FR-006).
- Todo evento `"action"` com `tool` em `["open_incident", "resolve_incident"]` só ocorre dentro de um
  passo com `role: "executor"`, e resulta no mesmo comportamento de `ApprovalRequiredError` já
  coberto pelos testes de `approval-guardrail.test.ts` quando a ação exige confirmação (FR-007).
- O número de eventos `"handoff"` com `to != "respond"` em uma única execução nunca excede 8
  (FR-011); o último evento `"handoff"` de uma execução truncada tem `reason` mencionando o teto
  (FR-013).
