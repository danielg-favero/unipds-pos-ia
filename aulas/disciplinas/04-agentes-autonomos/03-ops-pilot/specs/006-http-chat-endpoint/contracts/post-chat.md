# Contract: `POST /chat`

## Request

```
POST /chat
Content-Type: application/json
```

Body (JSON):

```json
{
  "message": "quais incidentes estão abertos?",
  "strategy": "react",
  "reflect": false
}
```

- `message` (string, obrigatório, não vazia)
- `strategy` (string, opcional; default `"react"`; deve ser uma chave conhecida do registry de estratégias)
- `reflect` (boolean, opcional; default `false`; quando `true`, resolve para a variante `reflect:<strategy>` do registry)

## Responses

### 200 OK — execução concluída

```json
{
  "answer": "Há 2 incidentes abertos: INC-1 (checkout, high), INC-2 (auth, medium).",
  "trace": [
    { "type": "action", "tool": "list_incidents", "args": { "filter": "open" } },
    { "type": "observation", "ok": true, "result": { "incidents": ["..."] } },
    { "type": "answer", "text": "Há 2 incidentes abertos...", "partial": false }
  ],
  "metrics": { "llmCalls": 2, "latencyMs": 843 }
}
```

Formato de `trace` e `metrics`: ver `TraceEvent` e `RunMetrics` em `src/domain/strategy.ts` (reutilizados sem transformação).

### 400 Bad Request — corpo inválido

Disparado quando o corpo não passa na validação Zod (`message` ausente/vazio, tipos errados, `reflect` não booleano, campos desconhecidos, JSON malformado).

```json
{
  "error": "corpo inválido",
  "issues": [
    { "path": ["message"], "message": "String must contain at least 1 character(s)", "code": "too_small" }
  ]
}
```

`issues` é o array nativo produzido por `ZodError.issues` (ou `.format()`/`.flatten()` equivalente) — sem transformação adicional.

### 422 Unprocessable Entity — estratégia desconhecida

Disparado quando `strategy` é uma string válida sintaticamente, mas não existe no catálogo de estratégias.

```json
{
  "error": "estratégia desconhecida",
  "requested": "made-up-strategy",
  "available": ["plan-and-execute", "react", "reflect:plan-and-execute", "reflect:react"]
}
```

Corresponde a `UnknownStrategyError` (`src/domain/errors.ts`), já usado pelo `arena.ts`.

### 504 Gateway Timeout — execução excedeu 180s

Disparado quando `strategy.run(...)` não resolve dentro de 180.000ms.

```json
{
  "error": "tempo limite excedido (180s)"
}
```

## Notas de contrato

- Content-Type de resposta: `application/json` em todos os casos.
- Nenhum outro método (`GET /chat`, etc.) é definido por esta feature.
- Erros de execução da estratégia não cobertos pelos casos acima (ex.: falha do provedor de modelo) não fazem parte do escopo de status codes desta spec; devem, no mínimo, não vazar detalhes internos (stack trace) no corpo da resposta — tratado como responsabilidade geral de borda da constitution ("Erros são de Domínio"), não como um novo contrato de status specific.
