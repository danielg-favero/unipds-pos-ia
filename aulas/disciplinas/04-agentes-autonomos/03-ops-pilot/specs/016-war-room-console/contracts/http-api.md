# Contract: OpsPilot HTTP API (consumido pelo War Room Console)

Base path: `/opspilot` (research.md §4). Todos os caminhos abaixo são relativos a ele
(ex.: `POST /opspilot/chat`). CORS habilitado para a origem configurada em `OPSPILOT_WEB_ORIGIN`
(research.md §3).

## POST /chat

Igual ao contrato existente (`src/http/schemas.ts::chatRequestSchema`), com um novo status de resposta.

**Request body**:

```json
{
  "message": "string, min 1",
  "userId": "string, min 1",
  "strategy": "string, opcional",
  "reflect": "boolean, opcional, default false",
  "conversation": "string, opcional"
}
```

**Response — 200 (sucesso, sem aprovação pendente)**: inalterado.

```json
{
  "answer": "string",
  "trace": [/* TraceEvent[] */],
  "metrics": {/* RunMetrics */},
  "conversation": "string",
  "requestId": "string"
}
```

**Response — 202 (ação pendente de aprovação humana)** — NOVO:

```json
{
  "requestId": "string",
  "conversation": "string",
  "pendingApproval": {
    "id": "string (== requestId)",
    "tool": "open_incident | resolve_incident",
    "args": { "...": "..." },
    "description": "string",
    "status": "pending"
  }
}
```

**Response — 400 / 422 / 504 / 500**: inalterados (corpo inválido, estratégia desconhecida, timeout,
erro interno).

## POST /chat/:requestId/decision — NOVO

Retoma uma execução que parou em `pendingApproval`.

**Path param**: `requestId` — o mesmo `requestId`/`pendingApproval.id` recebido no 202.

**Request body**:

```json
{ "decision": "approve | deny" }
```

**Response — 200 (decisão aceita, execução concluída)**: mesmo shape do `/chat` 200 (`answer`, `trace`,
`metrics`, `conversation`, `requestId`). Quando `decision: "deny"`, `trace` contém um evento
`observation` com `ok: false` e `error` indicando negação, e a tool sensível nunca é chamada.

**Response — 404**: `requestId` não corresponde a uma aprovação pendente conhecida.

```json
{ "error": "aprovação não encontrada", "requestId": "string" }
```

**Response — 409**: a aprovação já havia sido decidida (idempotência, SC-005).

```json
{
  "error": "decisão já registrada",
  "pendingApproval": {
    "id": "string",
    "status": "approved | denied",
    "decidedAt": "string (ISO datetime)"
  }
}
```

**Response — 400**: corpo inválido (`decision` ausente ou fora do enum).

## GET /requests/:id (existente, sem alteração)

Usado opcionalmente pelo frontend para recarregar o trace completo de uma resposta antiga após reload
(edge case da spec: raciocínio deve continuar acessível). Shape inalterado
(`RequestTraceStore.getRequestWithTrace`).

## CORS

- `Access-Control-Allow-Origin`: valor de `OPSPILOT_WEB_ORIGIN` (uma origem, não `*`).
- `Access-Control-Allow-Methods`: `GET, POST, OPTIONS`.
- Sem `Access-Control-Allow-Credentials` (não há cookies/sessão nesta feature).

## Frontend-only contract: ApiSettings (localStorage)

Não é uma chamada HTTP, mas parte do contrato da feature (FR-012–FR-015):

- Chave: `opspilot:apiUrl`.
- Valor: string, URL absoluta `http(s)://...`.
- Toda chamada a `/chat` e `/chat/:id/decision` usa `new URL("/opspilot/...", apiUrl)` como base.
