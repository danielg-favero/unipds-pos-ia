# Data Model: Trace Persistido e Logs Estruturados

## Entidades

### `Request` (tabela `requests`)

Uma linha por requisição processada por `POST /chat`. Espelha `RunMetrics`
(`src/domain/strategy.ts`) mais os campos de correlação e status.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | TEXT PRIMARY KEY | `requestId` (UUID gerado por `randomUUID()`) |
| `conversation_id` | TEXT | id da conversa associada (FK lógica, sem `REFERENCES` — conversas não têm tabela própria, ver `conversation-schema.ts`) |
| `started_at` | TEXT | timestamp ISO 8601, preenchido no início do processamento |
| `finished_at` | TEXT | timestamp ISO 8601, preenchido ao concluir (sucesso, erro ou timeout) |
| `duration_ms` | INTEGER | `finished_at - started_at` em ms |
| `status` | TEXT | `'ok' \| 'error' \| 'timeout'` (CHECK) |
| `llm_calls` | INTEGER | de `RunMetrics.llmCalls` |
| `prompt_tokens_real` | INTEGER, nullable | de `RunMetrics.promptTokensReal` (ausente se provedor não reportou) |
| `model_used` | TEXT, nullable | de `RunMetrics.modelUsed` |
| `error` | TEXT, nullable | mensagem de erro, se `status != 'ok'` |

**Validation rules**:
- `id` é sempre um UUID válido gerado pelo servidor (FR-001).
- `status` restrito aos três valores acima (CHECK constraint, mesmo padrão de `alerts.status`/`incidents.status` em `schema.ts`).
- `finished_at`/`duration_ms` podem ficar `NULL` apenas se a escrita de trace falhar antes da atualização final (best-effort, ver research.md §5) — não bloqueia a leitura do restante do registro.

**State transitions**: `requests` não tem máquina de estados própria; é escrita uma vez no
início (linha criada com `started_at`, `status` provisório) e atualizada uma vez ao final
(status final, `finished_at`, métricas). Não há edição posterior.

### `TraceEvent` (tabela `trace_events`)

Uma linha por item do array `StrategyRun.trace` (tipo `TraceEvent` de
`src/domain/strategy.ts`) de uma requisição. Muitos-para-um com `requests`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | chave técnica |
| `request_id` | TEXT NOT NULL | FK lógica para `requests.id` |
| `seq` | INTEGER NOT NULL | posição do evento no array de trace (0-based), garante ordem estável na leitura |
| `node` | TEXT NOT NULL | nome da etapa/nó — deriva de `TraceEvent.type` (`thought`, `plan`, `action`, `observation`, `critique`, `answer`, `route`, `fallback`) |
| `payload` | TEXT NOT NULL | `JSON.stringify` do `TraceEvent` original completo (permite reconstruir o evento exato na leitura) |
| `created_at` | TEXT NOT NULL | timestamp ISO 8601 de quando o evento foi persistido |

**Validation rules**:
- `(request_id, seq)` deve ser único — não pode haver dois eventos na mesma posição para a
  mesma requisição (garante FR-005: recuperação na ordem exata).
- `node` sempre um dos valores de `TraceEvent["type"]` (documentado, não é CHECK por não
  duplicar a fonte de verdade em `domain/strategy.ts`, mas coberto por teste).

**State transitions**: apenas inserção (append-only); eventos nunca são atualizados ou
removidos após gravados.

### `LogLine` (não persistida — saída em stdout)

Representação efêmera de um evento para observabilidade em tempo real. Não é uma tabela;
é o formato JSON de cada linha emitida por `src/obs/logger.ts`.

| Campo | Tipo | Notas |
|---|---|---|
| `requestId` | string | mesmo id de `requests.id` |
| `node` | string | mesmo valor gravado em `trace_events.node` |
| `seq` | number | posição do evento (mesma de `trace_events.seq`) |
| `status` | `'ok' \| 'error'` | deriva do evento (`observation.ok`, presença de `error`, etc.); demais tipos de evento são sempre `'ok'` |
| `ts` | string | timestamp ISO 8601 de emissão |

**Validation rules**: nunca inclui `payload`/`args`/`result` completos (FR-008, SC-005) — é
estritamente o subconjunto de metadados acima.

## Relações

```text
requests (1) ──< trace_events (N)     via trace_events.request_id
requests (1) ──  conversation_id       referência lógica à conversa (sem FK física)
```

## Origem dos dados

`StrategyRun` (retorno de `ReasoningStrategy.run`, já existente) é a única fonte:

```text
StrategyRun.metrics  → uma linha em `requests`
StrategyRun.trace[i] → uma linha em `trace_events` (seq = i) + uma linha de log via obs/logger.ts
```

Nenhum dado novo é solicitado ao usuário ou à estratégia — esta feature apenas persiste e
expõe o que `StrategyRun` já produz hoje.
