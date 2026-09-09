# Contract: OpsPilot MCP Server

**Server name**: `opspilot`
**Transport**: stdio (JSON-RPC 2.0 framed, per MCP spec)

## `tools/list`

Request: padrão MCP (`ListToolsRequest`), sem parâmetros específicos do OpsPilot.

Response: array com exatamente 3 tools, nesta forma (nomes e descrições reaproveitados de `src/agents/tools.ts`):

| name | inputSchema (campos) |
|---|---|
| `list_alerts` | `status?: "firing" \| "resolved" \| "all"` (default `"firing"`) |
| `open_incident` | `title: string (1..160)`, `service: string (min 1)`, `severity: Severity` (enum de `SEVERITIES`) |
| `resolve_incident` | `id: string (min 1)` |

## `tools/call` — `list_alerts`

**Input**: `{ status?: "firing" | "resolved" | "all" }`

**Output (content, texto JSON)**:
- Sucesso: `{ "ok": true, "data": { "alerts": Alert[] } }`
- Entrada inválida (status fora do enum): resposta MCP com `isError: true` (validação de schema do SDK, rejeitada antes de chegar ao handler).

## `tools/call` — `open_incident`

**Input**: `{ title: string, service: string, severity: Severity }`

**Output**:
- Sucesso: `{ "ok": true, "data": { "id": string, "title": string, "service": string, "severity": Severity, "status": "open" } }`
- Serviço inexistente: `{ "ok": false, "error": string }` (erro de domínio, não exceção de protocolo).
- Campos inválidos (`title` vazio/>160 chars, `severity` fora do enum, `service` vazio): resposta MCP com `isError: true`.

## `tools/call` — `resolve_incident`

**Input**: `{ id: string }`

**Output**:
- Sucesso: `{ "ok": true, "data": { "id": string, "status": "resolved" } }`
- Id inexistente ou já resolvido: `{ "ok": false, "error": string }` (erro de domínio).
- `id` vazio: resposta MCP com `isError: true`.

## Invariantes de transporte

- Todo byte escrito em `stdout` do processo pertence ao framing JSON-RPC do MCP; nenhuma outra escrita (log, print de debug) ocorre nesse canal.
- Diagnóstico (se necessário) é escrito exclusivamente em `stderr`.
- Uma tool desconhecida em `tools/call` retorna o erro padrão de "tool not found" do protocolo MCP, sem detalhes de implementação internos.
