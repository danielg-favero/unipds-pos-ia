# Contrato: Ferramentas de plantão e porta de store

**Módulos**: `src/agents/tools.ts` (tools), `src/store/port.ts` (porta).

Origem: FR-012 a FR-018.

## Porta `OpsStore`

```ts
export interface OpsStore {
  listAlerts(status?: AlertStatus): Promise<readonly Alert[]>;
  listServices(): Promise<readonly Service[]>;
  openIncident(input: { title: string; serviceId: string; severity: Severity }): Promise<Incident>;
  resolveIncident(id: string): Promise<Incident>;
  getIncident(id: string): Promise<Incident | undefined>;
}
```

Três adaptadores, mesmo contrato e mesmos erros de domínio:

- `JsonOpsStore` (`src/store/json.ts`) — **padrão do arena**; lê e escreve `data/ops-db.json`, então o modelo enxerga o que já existe e o que ele cria persiste. Escritas são serializadas numa fila interna para que duas ferramentas concorrentes não se sobrescrevam.
- `MemoryOpsStore` (`src/store/memory.ts`) — efêmero, sem I/O; é o adaptador dos testes.
- `SequelizeOpsStore` (`src/store/sequelize/store.ts`) — MySQL, opt-in via `--store mysql`.

`listAlerts` devolve os alertas em ordem estável de `id` — condição para os testes determinísticos.

## Ferramentas expostas ao modelo

Exatamente três (FR-012). Schemas Zod v4 declarados uma vez e reutilizados pelos testes.

### `list_alerts`

```ts
z.object({ status: z.enum(["firing", "resolved", "all"]).default("firing") })
```

- `status: "all"` (ou omitido, caindo no default `firing`) cobre FR-014; `all` devolve todos os alertas.
- Retorno: JSON com `{ alerts: [{ id, serviceId, severity, status, summary }] }`.
- Nunca falha por estado vazio: devolve `{ alerts: [] }`.

### `open_incident`

```ts
z.object({
  title: z.string().min(1).max(160),
  service: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
})
```

- `service` não cadastrado → `ServiceNotFoundError` (FR-015).
- Retorno: `{ id, title, service, severity, status: "open" }` — o `id` do incidente criado.

### `resolve_incident`

```ts
z.object({ id: z.string().min(1) })
```

- `id` inexistente → `IncidentNotFoundError`; incidente já resolvido → `IncidentAlreadyResolvedError` (FR-016).
- Nenhum dos dois altera o estado.
- Retorno: `{ id, status: "resolved" }`.

## Regras comuns

| # | Regra | Requisito |
|---|-------|-----------|
| T1 | Argumentos validados pelo schema **antes** de qualquer efeito; inválidos → `ValidationError` e estado intacto | FR-013 |
| T2 | Erro de domínio vira `observation` com `ok: false` e a mensagem do erro — a execução continua dentro do limite de iterações | FR-013, edge case de contrato quebrado |
| T3 | A decisão é pura; todo efeito colateral fica no adaptador de store | FR-017, constitution VI |
| T4 | Ferramenta desconhecida pedida pelo modelo → `observation` com `ok: false` listando as ferramentas válidas, sem abortar | edge case da spec |
| T5 | As tools são construídas por `makeTools(store: OpsStore)`; nenhuma delas captura estado global | FR-017, constitution I |
