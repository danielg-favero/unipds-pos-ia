# Contract: `POST /chat` (extensão)

Contrato base definido em `006-http-chat-endpoint`. Este documento cobre apenas o incremento desta
feature: o campo `conversation`.

## Request

```jsonc
{
  "message": "e o serviço de pagamentos, também foi afetado?",
  "strategy": "react",       // opcional, default "react" (inalterado)
  "reflect": false,          // opcional, default false (inalterado)
  "conversation": "b6e4b7c0-..." // opcional — novo nesta feature
}
```

- `conversation` ausente ou omitido → uma nova conversa é criada; seu id volta em
  `response.conversation`.
- `conversation` presente → usado como identificador da conversa. Se não existir ainda nenhuma
  mensagem gravada sob esse id, é tratado como uma conversa nova com esse id (sem erro).
- Corpo inválido (ex.: `conversation` como string vazia) → `400`, mesmo formato de erro já existente
  (`{ error, issues }` do Zod).

## Response — 200

```jsonc
{
  "answer": "...",
  "trace": [ /* TraceEvent[] — inalterado */ ],
  "metrics": {
    "llmCalls": 3,
    "latencyMs": 842,
    "historyMessages": 6   // novo — quantidade de mensagens de histórico usadas no prompt (máx. 12)
  },
  "conversation": "b6e4b7c0-..."  // novo — sempre presente, id efetivamente usado
}
```

## Response — 400 / 422 / 504 / 500

Inalterados em relação ao contrato base (`006-http-chat-endpoint`). Nenhum desses caminhos grava
mensagens na conversa (ver research.md §5) nem precisa incluir `conversation` no corpo de erro.

## Efeito colateral (não visível na resposta, visível em requisições subsequentes)

Após um `200`, a mensagem do usuário (`message`) e a resposta do assistente (`answer`) são gravadas,
nessa ordem, na conversa identificada por `response.conversation`. Uma requisição seguinte com o mesmo
`conversation` verá essas duas mensagens nas 12 mais recentes usadas para compor o contexto (FR-006).
