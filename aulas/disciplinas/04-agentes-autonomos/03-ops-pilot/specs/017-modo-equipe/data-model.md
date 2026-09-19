# Data Model: Modo Equipe (Supervisor Multi-Agente)

Todas as entidades abaixo são estado interno do grafo `src/team/team-graph.ts`, existentes apenas
durante uma execução (por requisição), conforme a suposição do spec de que o blackboard não é
persistido entre conversas. A única saída persistida é o `TraceEvent` (via o pipeline já existente
de `src/store/sqlite/request-trace-schema.ts`), sem alteração de schema.

## TeamRole

```ts
type TeamRole = "analista" | "planejador" | "executor";
```

Os três papéis especializados definidos pelo FR-004. `"supervisor"` e `"respond"` são valores
adicionais usados apenas em `TraceEvent.handoff.from`/`to` e na decisão do supervisor — não são
"papéis" com nó próprio de ferramentas.

**Validation rules**:
- Um papel só é acionado por decisão do supervisor (nunca se autoseleciona).
- `analista`: nenhuma ferramenta de escrita disponível (FR-005); sua saída nunca é tratada como
  proposta/ação executável, apenas como achado.
- `planejador`: nenhuma ferramenta disponível, de leitura ou escrita (FR-006).
- `executor`: apenas ferramentas de incidente (`open_incident`, `resolve_incident`), sempre sobre o
  `OpsStore` já protegido por `withApprovalGuardrail` (FR-007).

## BlackboardEntry

```ts
type BlackboardEntry = {
  role: TeamRole;
  summary: string;
  producedAt: number; // sequência incremental dentro da execução, não timestamp de relógio
};
```

Representa uma contribuição de um especialista ao quadro compartilhado (Key Entity "Quadro
Compartilhado (Blackboard)" do spec). Acumulado via reducer de concatenação no estado do grafo,
nunca removido/editado após criado.

**Relationships**: Uma execução do modo equipe tem 0..N `BlackboardEntry`, uma por vez que um papel
termina sua atuação. O supervisor lê todas as entradas acumuladas até o momento para decidir o
próximo passo (FR-003).

## SupervisorDecision

```ts
type SupervisorDecision = {
  next: TeamRole | "respond";
  brief: string; // resumo do motivo da decisão, exibido no evento de handoff
};
```

Saída estruturada (`withStructuredOutput`) do supervisor a cada passo (Key Entity "Decisão do
Supervisor"). `brief` nunca fica vazio (`z.string().min(1)`) — é o texto usado no campo `reason` do
evento `handoff` correspondente.

**Validation rules**:
- `next` deve ser um `TeamRole` válido ou o sentinela `"respond"` (encerra a orquestração).
- Se a validação Zod falhar na resposta do modelo, aplica-se o fallback determinístico (ver
  research.md, Decisão 4): `respond` se o blackboard já tem conteúdo, senão `analista`.

## TraceEvent (extensão — variante "handoff")

```ts
type HandoffTraceEvent = {
  type: "handoff";
  from: TeamRole | "supervisor";
  to: TeamRole | "respond";
  reason: string;
};
```

Adicionada à união discriminada existente em `src/domain/strategy.ts` (Key Entity "Evento de
Transição (Handoff)"). Segue o mesmo formato de payload genérico já persistido em
`trace_events.payload` — nenhuma migração de tabela é necessária.

**Validation rules**:
- `reason` nunca é uma string vazia (reaproveita o `brief`/motivo do fallback).
- Emitido a cada transição real de responsabilidade, incluindo a transição forçada ao atingir o
  teto de 8 (`to: "respond"`, `reason` explicando o motivo do encerramento — FR-013) e a transição
  inicial supervisor→primeiro papel.
- Não deve ser emitido quando um único papel resolve tudo sem nenhuma transição adicional (Edge
  Case do spec) — nesse caso há só o handoff inicial (supervisor→papel) seguido do handoff de
  encerramento (papel→respond), refletindo fielmente o que ocorreu.

## TeamGraphState (estado do `StateGraph`)

```ts
type TeamGraphState = {
  input: StrategyInput;              // reaproveitado sem alteração
  blackboard: readonly BlackboardEntry[];
  trace: TraceEvent[];               // reaproveita o reducer de concat já usado em ProductionGraphState
  handoffCount: number;              // incrementado a cada handoff real; teto = 8
  answer: string;
  partial: boolean;                  // true quando o encerramento ocorreu por teto, não por decisão natural
  metrics: RunMetrics | undefined;   // reaproveitado de src/domain/strategy.ts
};
```

**State transitions** (State Diagram):

```
START
  → supervisor (decide via SupervisorDecision; handoffCount++ se next != "respond")
      → [next == "analista"]   → nó analista   → volta para supervisor
      → [next == "planejador"] → nó planejador → volta para supervisor
      → [next == "executor"]   → nó executor   → volta para supervisor
      → [next == "respond" OU handoffCount == 8] → respond → END
```

- Cada volta ao `supervisor` só é permitida enquanto `handoffCount < 8`; ao atingir 8, a próxima
  decisão é sobrescrita para `"respond"` independentemente da saída do modelo (FR-011/FR-012).
- `partial` é `true` somente quando o encerramento foi forçado pelo teto, permitindo à camada de
  resposta (`respond`) compor a mensagem final com a ressalva exigida por FR-013.
