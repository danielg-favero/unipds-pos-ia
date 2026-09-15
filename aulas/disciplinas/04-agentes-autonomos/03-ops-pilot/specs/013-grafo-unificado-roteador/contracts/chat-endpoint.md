# Contract: `POST /chat` (roteamento automático + override)

Este contrato descreve apenas o que muda no comportamento observável de `POST /chat` em relação ao
existente (`src/http/schemas.ts`, `src/http/server.ts`). O formato do corpo da requisição **não
muda** — `chatRequestSchema` continua a mesma.

## Request (sem mudança de schema)

```jsonc
{
  "message": "string (obrigatório)",
  "userId": "string (obrigatório)",
  "strategy": "string (opcional) — quando presente, é override manual",
  "reflect": "boolean (opcional, default false)",
  "conversation": "string (opcional)"
}
```

## Comportamento

### Sem `strategy` no corpo (novo comportamento — roteamento automático)

- O servidor chama a estratégia interna `"production"` (grafo unificado) em vez de assumir
  `"react"` como default fixo.
- O grafo decide automaticamente, com base em `message`, qual estratégia-base
  (`react` | `plan-and-execute`) processa o pedido.
- `reflect: true` continua aplicável: a estratégia efetivamente executada é decorada com
  `withReflection(...)`, assim como hoje ocorre para uma estratégia nomeada explicitamente.
- A resposta (200) inclui, dentro de `trace`, exatamente um evento `{ "type": "route", "route": "<nome>", "reason": "<justificativa>", "manual": false }`, aparecendo antes dos eventos produzidos pela estratégia escolhida.
- Se a decisão automática falhar ou for ambígua, o `route` do evento reflete a estratégia padrão de
  fallback e `reason` começa com `"fallback: "` — a requisição não falha por causa disso.

### Com `strategy` no corpo (comportamento existente + sinalização nova)

- Igual ao comportamento atual: `strategy` (+ `reflect`) resolve para um nome de estratégia
  (`"<strategy>"` ou `"reflect:<strategy>"`); se esse nome não existir no catálogo, a resposta
  continua sendo **422** com o mesmo formato de erro já existente
  (`{ "error": "...", "requested": "...", "available": [...] }`).
- Quando o nome existe, a execução passa pelo grafo unificado com o override aplicado: o nó
  `router` é pulado e o evento de trace é
  `{ "type": "route", "route": "<strategy>", "reason": "override manual via /chat", "manual": true }`.
- O restante da resposta (200: `answer`, `trace`, `metrics`, `conversation`) mantém o mesmo formato
  já documentado — nenhum campo novo fora do evento `route` dentro de `trace`.

## Erros (sem mudança)

- `400`: corpo inválido (Zod) — inalterado.
- `422`: `strategy` explícito não existe no catálogo — inalterado.
- `504`: timeout de 180s — inalterado; o tempo do nó `router` conta dentro desse orçamento.
- `500`: erro inesperado — inalterado.

## Exemplo — roteamento automático

**Request**
```json
{ "message": "Qual o status do serviço de pagamentos?", "userId": "u1" }
```

**Response 200 (trecho do trace)**
```json
{
  "trace": [
    { "type": "route", "route": "react", "reason": "Pergunta pontual e direta, resolúvel com poucas consultas.", "manual": false },
    { "type": "action", "tool": "get_service_status", "args": { "service": "pagamentos" } },
    { "type": "observation", "ok": true, "result": "..." },
    { "type": "answer", "text": "...", "partial": false }
  ]
}
```

## Exemplo — override manual

**Request**
```json
{ "message": "Investigue a causa raiz da degradação de hoje", "userId": "u1", "strategy": "plan-and-execute" }
```

**Response 200 (trecho do trace)**
```json
{
  "trace": [
    { "type": "route", "route": "plan-and-execute", "reason": "override manual via /chat", "manual": true },
    { "type": "plan", "steps": ["...", "..."] },
    { "type": "answer", "text": "...", "partial": false }
  ]
}
```
