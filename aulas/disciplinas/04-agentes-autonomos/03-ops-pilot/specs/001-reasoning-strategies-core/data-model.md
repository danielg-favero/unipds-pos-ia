# Phase 1 — Data Model: Núcleo de Raciocínio

**Feature**: `001-reasoning-strategies-core` | **Date**: 2026-09-02

Tipos de domínio vivem em `src/domain/` e são puros (sem I/O). A persistência é detalhe do adaptador em `src/store/`.

---

## Entidades de domínio

### Service

Unidade operacional monitorada. Alvo de alertas e incidentes.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | `string` | Slug, obrigatório, único. `^[a-z0-9-]{2,64}$` |
| `name` | `string` | Obrigatório, 1–120 caracteres |

- Origem: FR-018, FR-019.
- Serviços são fixos no seed; não há criação de serviço pelas ferramentas.

### Alert

Sinal emitido sobre um serviço.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | `string` | Obrigatório, único. Ex.: `alert-01` |
| `serviceId` | `string` | FK → `Service.id`, deve existir |
| `severity` | `Severity` | `"critical" \| "high" \| "medium" \| "low"` |
| `status` | `AlertStatus` | `"firing" \| "resolved"` |
| `summary` | `string` | Obrigatório, 1–240 caracteres |

- Origem: FR-014, FR-019.
- Alertas são somente-leitura para as ferramentas nesta feature (não há tool que altere alerta).

### Incident

Registro de trabalho aberto em resposta a um problema.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | `string` | Gerado pelo store, único. Ex.: `inc-1` |
| `title` | `string` | Obrigatório, 1–160 caracteres |
| `serviceId` | `string` | FK → `Service.id`, **deve existir** (FR-015) |
| `severity` | `Severity` | Mesma enumeração de `Alert.severity` |
| `status` | `IncidentStatus` | `"open" \| "resolved"`, inicia em `"open"` |

**Transições de estado**

```
        open_incident              resolve_incident
(inexistente) ──────────► open ──────────────────► resolved
                           │                            │
                           │ resolve_incident           │ resolve_incident
                           ▼                            ▼
                    (ok, vira resolved)     IncidentAlreadyResolvedError
```

- `resolve_incident` em id inexistente → `IncidentNotFoundError` (FR-016).
- `resolve_incident` em incidente já resolvido → `IncidentAlreadyResolvedError`, sem alterar estado (FR-016).

---

## Entidades de raciocínio

### TraceEvent (união discriminada por `type`)

Origem: FR-002, FR-003.

| `type` | Carga | Emitido por |
|--------|-------|-------------|
| `thought` | `{ text: string }` | Raciocínio intermediário do modelo |
| `plan` | `{ steps: string[] }` | Planner e cada replanejamento |
| `action` | `{ tool: string; args: Record<string, unknown>; callId?: string }` | Toda invocação de ferramenta |
| `observation` | `{ callId?: string; ok: boolean; result?: unknown; error?: string }` | Resultado (ou erro) da ação anterior |
| `critique` | `{ text: string }` | Avaliação do replanner sobre o que resta |
| `answer` | `{ text: string; partial: boolean }` | Encerramento; `partial: true` quando por limite |

**Invariantes**
- Todo `observation` é precedido por um `action`; quando ambos têm `callId`, os valores coincidem.
- O último evento de toda execução é sempre um `answer` — inclusive em falha ou estouro de limite (SC-002).
- `args` já passou pela validação Zod da ferramenta; `observation.error` carrega a mensagem do erro de domínio, nunca a stack.

### RunMetrics

Origem: FR-004, FR-006.

| Campo | Tipo | Regras |
|-------|------|--------|
| `llmCalls` | `number` | Inteiro ≥ 0; conta toda chamada ao chat model, inclusive em execução interrompida |
| `latencyMs` | `number` | Inteiro ≥ 0; medido de ponta a ponta da execução |

> `latencyMds` do pedido original é lido como `latencyMs` (ver Assumptions da spec).

### StrategyRun

Resultado de uma execução: `{ answer: string; trace: TraceEvent[]; metrics: RunMetrics }`.

### ReasoningStrategy

`{ name: string; run(input: StrategyInput): Promise<StrategyRun> }`, com `StrategyInput = { request: string; maxIterations: number; store: OpsStore }`.

---

## Erros de domínio

Classes em `src/domain/errors.ts`, todas estendendo `DomainError` (FR-013, FR-015, FR-016, princípio III da constitution).

| Classe | Quando |
|--------|--------|
| `ConfigError` | `OPENROUTER_API_KEY` ou `OPENROUTER_MODEL` ausente/vazia |
| `ValidationError` | Argumentos de ferramenta reprovados pelo schema Zod |
| `ServiceNotFoundError` | `open_incident` com `service` não cadastrado |
| `IncidentNotFoundError` | `resolve_incident` com id inexistente |
| `IncidentAlreadyResolvedError` | `resolve_incident` em incidente já resolvido |
| `IterationLimitError` | Uso interno; convertido em `answer` parcial, nunca propagado ao chamador |
| `UnknownStrategyError` | Arena recebe nome de estratégia fora do catálogo (FR-028) |

Nenhuma mensagem de erro inclui o valor de `OPENROUTER_API_KEY` (FR-011).

---

## Persistência (adaptador Sequelize / MySQL)

Modelos em `src/store/sequelize/models.ts`, definidos com `Model.init` e `InferAttributes`/`InferCreationAttributes`.

| Tabela | Colunas | Índices / restrições |
|--------|---------|----------------------|
| `services` | `id` (PK, `VARCHAR(64)`), `name` (`VARCHAR(120)`, not null) | PK em `id` |
| `alerts` | `id` (PK, `VARCHAR(64)`), `service_id` (FK → `services.id`), `severity` (`ENUM`), `status` (`ENUM`), `summary` (`VARCHAR(240)`) | FK `service_id`; índice em `status` |
| `incidents` | `id` (PK, `VARCHAR(64)`), `title` (`VARCHAR(160)`), `service_id` (FK → `services.id`), `severity` (`ENUM`), `status` (`ENUM`) | FK `service_id`; índice em `status` |

Timestamps `created_at`/`updated_at` habilitados com `underscored: true`.

O adaptador `MemoryOpsStore` mantém as mesmas três coleções em memória e satisfaz a mesma porta `OpsStore` — é o adaptador usado pelos testes (FR-031) e o padrão do arena.

---

## Dados do seed

Origem: FR-019, FR-020, SC-008. Definidos como constantes puras em `src/store/seed-data.ts` e reutilizados pelo `MemoryOpsStore` e pelo script de seed — uma única fonte de verdade.

**5 serviços**: `checkout-api`, `payments-worker`, `auth-service`, `search-indexer`, `notification-gateway`.

**6 alertas** (3 `firing`, 3 `resolved`), variados em serviço e severidade:

| id | serviço | severidade | status | resumo |
|----|---------|-----------|--------|--------|
| `alert-01` | `checkout-api` | `critical` | `firing` | Taxa de erro 5xx acima de 10% |
| `alert-02` | `payments-worker` | `high` | `firing` | Fila de pagamentos com atraso crescente |
| `alert-03` | `auth-service` | `medium` | `firing` | Latência p95 de login acima do limite |
| `alert-04` | `search-indexer` | `low` | `resolved` | Reindexação atrasada |
| `alert-05` | `notification-gateway` | `high` | `resolved` | Falha de entrega de push |
| `alert-06` | `checkout-api` | `medium` | `resolved` | Pico de timeouts no gateway de cartão |

**Incidentes**: nenhum. O estado inicial não tem incidentes; eles nascem das execuções.

**Idempotência** (FR-020): o seed usa `upsert` por chave primária para serviços e alertas e não toca em incidentes. Rodar duas vezes deixa exatamente 5 serviços e 6 alertas.
