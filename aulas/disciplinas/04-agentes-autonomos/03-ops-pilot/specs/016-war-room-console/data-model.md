# Data Model: War Room Console

## Conversation (existente, sem alteração de schema)

Já persistida via `ConversationStore`. Reaproveitada como está pelo frontend (`conversation` id trocado
entre chamadas de `/chat`).

## Message (frontend, estado em memória do `web/`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | gerado no cliente (ex. `crypto.randomUUID()`) para key de lista/React |
| `role` | `"operator" \| "agent"` | |
| `text` | string | vazio enquanto a resposta do agente está pendente |
| `status` | `"sending" \| "done" \| "error"` | drive dos estados visuais (FR-003, FR-004) |
| `trace` | `TraceEvent[]` \| undefined | presente só em mensagens do agente com sucesso (200) |
| `pendingApproval` | `PendingApproval` \| undefined | presente quando a resposta do agente foi um 202 |
| `requestId` | string | id retornado pelo backend, usado para `POST /chat/:requestId/decision` |

## TraceEvent (backend, já existente — `src/domain/strategy.ts`)

Union discriminado por `type`, reaproveitado tal qual pelo frontend (nenhuma transformação de schema,
só de apresentação):

- `thought { text }`
- `plan { steps: string[] }`
- `action { tool, args, callId? }`
- `observation { callId?, ok, result?, error? }`
- `critique { text }`
- `answer { text, partial }`
- `route { route, reason, manual }`
- `fallback { primaryModel, fallbackModel, reason }`

## PendingApproval (novo, backend + frontend)

Representa uma ação sensível aguardando decisão humana antes de ser executada (FR-008–FR-011).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | igual ao `requestId` da chamada `/chat` que a originou (chave de correlação) |
| `tool` | `"open_incident" \| "resolve_incident"` | ações sensíveis sujeitas a guardrail (research.md §2) |
| `args` | `Record<string, unknown>` | argumentos que seriam passados à tool, para exibir na descrição |
| `description` | string | frase pronta para exibição (gerada no backend, ex. "Resolver incidente INC-42") |
| `status` | `"pending" \| "approved" \| "denied"` | transição única: `pending → approved` ou `pending → denied`; nunca volta a `pending` |
| `result` | `unknown` \| undefined | preenchido após `approved` com o retorno da tool executada |
| `decidedAt` | string (ISO datetime) \| undefined | presente quando `status !== "pending"` |

### Transições de estado

```text
pending --(decision: approve)--> approved  [executa a tool; result preenchido]
pending --(decision: deny)-----> denied    [tool nunca é chamada]
approved/denied --(qualquer decisão nova)--> 409 (rejeitada; estado não muda) — SC-005
```

## ApiSettings (frontend, persistido em `localStorage`)

| Campo | Tipo | Notas |
|---|---|---|
| `apiUrl` | string (URL absoluta) | validada antes de salvar (FR-013); default `window.location.origin` |

## Validation rules (resumo, ver contracts/ para o schema formal)

- `PendingApproval.tool` restrito à allow-list de ações sensíveis — qualquer outra tool nunca gera 202,
  sempre executa direto (comportamento atual preservado).
- Uma decisão só é aceita quando `PendingApproval.status === "pending"`; caso contrário 409 com o estado
  atual (idempotência, sem duplicar execução da tool).
- `ApiSettings.apiUrl` deve ser uma URL absoluta válida (`http`/`https`); URLs relativas ou strings
  vazias são rejeitadas na UI antes de persistir.
