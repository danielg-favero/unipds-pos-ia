# Quickstart: Medição de Consumo de Contexto

## Pré-requisitos

- Nenhuma dependência nova; mesma configuração de ambiente do `/chat` (`OPENROUTER_API_KEY` etc.)
  para a validação manual com o provedor real.

## Rodando os testes automatizados (validação principal)

```bash
npm test
```

Cobre, no mínimo (ver [contracts/context-metrics.md](./contracts/context-metrics.md)):

- `estimateTokens("")` é `0`; `estimateTokens` de um texto de N caracteres é `Math.ceil(N/4)`.
- `extractPromptTokens` soma `usage_metadata.input_tokens` de um `LLMResult` de exemplo com uma ou
  mais generations; devolve `undefined` para um `LLMResult` sem `usage_metadata` em nenhuma
  generation.
- `RunTracker`/`CallCounter`: após duas chamadas simuladas com uso real diferente cada, o snapshot
  soma os dois; sem nenhuma chamada reportando uso, `promptTokensReal` é `undefined`.
- Cada estratégia (`react`, `plan-and-execute`) devolve `contextBreakdown` com as quatro fontes,
  refletindo histórico/memórias vazios como `0` quando ausentes.
- `reflect:<strategy>`: `promptTokensReal` soma as tentativas (base + crítico); `contextBreakdown`
  reflete a última tentativa executada.
- `POST /chat`: o campo `metrics` da resposta sempre inclui `contextBreakdown`; `promptTokensReal`
  está ausente do JSON quando a estratégia fake de teste não reporta uso.

## Validação manual end-to-end (`/chat`)

```bash
npm run http
```

```bash
curl -s http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"userId":"u1","message":"quais alertas estão disparando?"}' | jq '.metrics'
```

Confirme que a saída inclui `contextBreakdown` (quatro números) e, quando o provedor configurado
reporta uso (a maioria dos modelos via OpenRouter reporta), `promptTokensReal` com um valor plausível
(maior que a soma de `contextBreakdown`, já que o provedor conta tokens reais do tokenizer do modelo,
não a estimativa de caracteres).

## Expected Outcomes

- Toda resposta bem-sucedida do `/chat` traz `contextBreakdown` (SC-002) e, quando disponível,
  `promptTokensReal` (SC-001).
- Nenhuma resposta falha ou fica incompleta por ausência de uso real reportado (SC-004).
- Interações com `reflect: true` reportam um único `promptTokensReal` consistente com a soma das
  chamadas envolvidas (SC-005).
