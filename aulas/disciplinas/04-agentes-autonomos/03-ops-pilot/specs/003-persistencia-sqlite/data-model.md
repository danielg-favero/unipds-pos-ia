# Data Model: Persistência Real de Operações (SQLite)

## Tipos de domínio (`src/domain/types.ts`)

Extensão do existente — sem quebrar os tipos já usados por `MemoryOpsStore`/`SequelizeOpsStore`.

```ts
export type Incident = {
  readonly id: string;
  readonly title: string;
  readonly serviceId: string;
  readonly severity: Severity;
  readonly status: IncidentStatus;
  readonly resolvedAt: string | null; // ISO-8601; null enquanto status === "open"
  readonly summary: string | null;    // resumo de fechamento; null enquanto status === "open"
};

export type Runbook = {
  readonly serviceId: string;
  readonly content: string; // passos de resposta, texto livre (markdown simples)
};
```

`Service` e `Alert` permanecem inalterados.

## Entidades e regras de validação

### Service
- `id` (PK, string, ex. `checkout-api`)
- `name` (string, não vazio)
- Sem `CHECK` de domínio fechado (nome livre).

### Alert
- `id` (PK, string, ex. `alert-01`)
- `service_id` (FK → `services.id`)
- `severity` (`CHECK IN` os valores de `SEVERITIES`)
- `status` (`CHECK IN` os valores de `ALERT_STATUSES`)
- `summary` (string, não vazio)

### Incident
- `id` (PK, string, ex. `inc-1`)
- `title` (string, 1–160 chars — mesmo limite já validado por `openIncidentSchema` na fronteira)
- `service_id` (FK → `services.id`)
- `severity` (`CHECK IN` os valores de `SEVERITIES`)
- `status` (`CHECK IN` os valores de `INCIDENT_STATUSES`)
- `resolved_at` (TEXT ISO-8601, nullable; **MUST** ser `NULL` sse `status = 'open'`)
- `summary` (TEXT, nullable; **MUST** ser `NULL` sse `status = 'open'`)

### Runbook
- `service_id` (PK, FK → `services.id`) — um runbook por serviço
- `content` (TEXT, não vazio)

## Relacionamentos

```
Service 1 ──< Alert        (service_id)
Service 1 ──< Incident     (service_id)
Service 1 ──0..1── Runbook (service_id)
```

Nenhuma FK usa `ON DELETE CASCADE`: o cenário atual não expõe exclusão de serviço, então o
comportamento de cascata é irrelevante nesta fase (fora de escopo).

## Transições de estado — Incident

```
open --(resolveIncident)--> resolved
```

- `open → resolved`: seta `status = 'resolved'`, `resolved_at = now()`, `summary` (quando a chamada
  fornecer um resumo; caso contrário mantém comportamento atual, que não exige resumo — ver
  Assumptions do spec sobre não alterar regras de negócio existentes).
- `resolved → resolved`: **MUST** lançar `IncidentAlreadyResolvedError` (comportamento já existente,
  preservado por FR-012).
- Não há transição de volta para `open` (fora de escopo, não pedido).

## Extensão da porta `OpsStore` (`src/store/port.ts`)

```ts
export type IncidentListFilter = "open" | "resolved" | "all";

export interface OpsStore {
  // ...métodos existentes inalterados...

  /** Sem filtro ou "open": abertos (comportamento padrão). Sempre ordenado por `id`. */
  listIncidents(filter?: IncidentListFilter): Promise<readonly Incident[]>;

  /**
   * `undefined` quando o serviço existe mas não tem runbook cadastrado.
   * Lança `ServiceNotFoundError` quando o serviço não existe.
   */
  getRunbook(serviceId: string): Promise<Runbook | undefined>;
}
```

Ambos os métodos são implementados por `MemoryOpsStore` e `SqliteOpsStore` (paridade de contrato —
`SequelizeOpsStore` fica fora do escopo desta feature, ver Assumptions do spec).

## Seed — cenário "Mercadinho" (idempotente)

Fonte única em `src/store/seed-data.ts` (já existe `SEED_SERVICES`/`SEED_ALERTS`; adiciona
`SEED_RUNBOOKS`), reusada tanto pelo `MemoryOpsStore` quanto pelo seed do `SqliteOpsStore`:

- 5 serviços (já existentes: `checkout-api`, `payments-worker`, `auth-service`, `search-indexer`,
  `notification-gateway`; `catalog-service` já existe como 6º — a spec pede 5, então o seed do
  SQLite usa os 5 primeiros da lista atual salvo ajuste durante `/speckit-tasks`/implementação; a
  decisão final de quais 5 fica registrada em `tasks.md`)
- 6 alertas (já existentes em `SEED_ALERTS`: 3 `firing`, 3 `resolved`)
- Runbooks novos: `checkout-api`, `payments-worker`, `auth-service` (checkout/payments/auth, como
  pedido) — demais serviços do seed ficam sem runbook (caso de "ausência" coberto por FR-006).
