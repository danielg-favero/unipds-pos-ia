# HTTP Contracts: Trace Persistido e Logs Estruturados

Extensões ao serviço HTTP existente (`src/http/server.ts`). Não altera o contrato de
entrada de nenhuma rota já existente — apenas acrescenta campos de saída em `/chat` e uma
rota nova.

## `POST /chat` (alterado — apenas saída)

Corpo de entrada: sem mudança (`chatRequestSchema`, `src/http/schemas.ts`).

**Response headers (novo)**:

```
X-Request-Id: <uuid>
```

**Response body 200 (campo novo `requestId`, demais campos inalterados)**:

```json
{
  "answer": "string",
  "trace": [ /* TraceEvent[], inalterado */ ],
  "metrics": { /* RunMetrics, inalterado */ },
  "conversation": "string",
  "requestId": "uuid"
}
```

- `requestId` é sempre um UUID novo, gerado pelo servidor no início do processamento.
- O mesmo valor aparece no header `X-Request-Id` e no corpo, em toda resposta (200, 422,
  400, 500, 504) — inclusive em respostas de erro, para permitir correlação mesmo quando a
  requisição falha (US1).

## `GET /requests/:id` (novo)

**Path params**:

| Nome | Tipo | Regra |
|---|---|---|
| `id` | string | não vazio (validado via Zod) |

**Response 200** — requisição encontrada:

```json
{
  "request": {
    "id": "uuid",
    "conversationId": "string",
    "startedAt": "2026-09-16T12:00:00.000Z",
    "finishedAt": "2026-09-16T12:00:02.340Z",
    "durationMs": 2340,
    "status": "ok",
    "llmCalls": 3,
    "promptTokensReal": 1842,
    "modelUsed": "gpt-...",
    "error": null
  },
  "trace": [
    {
      "seq": 0,
      "node": "thought",
      "event": { "type": "thought", "text": "..." },
      "createdAt": "2026-09-16T12:00:00.500Z"
    }
  ]
}
```

- `trace` sempre ordenado por `seq` ascendente (FR-005).
- `request.promptTokensReal`, `request.modelUsed`, `request.error` podem ser `null` quando
  ausentes na origem (mesma semântica opcional de `RunMetrics`).

**Response 404** — nenhum registro com esse `id`:

```json
{ "error": "requisição não encontrada" }
```

**Response 400** — `id` inválido (ex.: vazio):

```json
{ "error": "query inválida", "issues": [ /* ZodIssue[] */ ] }
```

## Formato de linha de log (`src/obs/logger.ts`)

Não é uma rota HTTP — é o contrato da linha JSON escrita em `stdout`, uma por
`TraceEvent` processado durante uma requisição:

```json
{"requestId":"uuid","seq":0,"node":"thought","status":"ok","ts":"2026-09-16T12:00:00.500Z"}
```

Garantias:
- Exatamente uma linha JSON por evento (sem quebras de linha internas).
- Nenhuma chave além de `requestId`, `seq`, `node`, `status`, `ts` — em particular, nunca os
  campos de payload (`text`, `args`, `result`, `steps`, etc.) do `TraceEvent` original
  (FR-008, SC-005).
