# Data Model: Resiliência do Modelo de Linguagem

Esta feature não introduz persistência nova (sem tabelas/DDL). As "entidades" abaixo são tipos de domínio/valores em memória, válidos durante uma única interação.

## ModelConfig (interno à fábrica, não exportado como tipo público)

Representa a configuração lida do ambiente para montar o modelo resiliente.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `primaryModel` | `string` | sim | Valor de `OPENROUTER_MODEL`. |
| `fallbackModel` | `string \| undefined` | não | Valor de `OPENROUTER_MODEL_FALLBACK`, se definido. |
| `apiKey` | `string` | sim | Valor de `OPENROUTER_API_KEY` (nunca logado/exposto). |

**Regras de validação**:
- `primaryModel` e `apiKey` seguem a validação já existente em `EnvSchema` (`z.string().min(1)`).
- `fallbackModel`, quando presente na env, também deve ser não vazio; ausência da variável é um estado válido (FR-008), não um erro de configuração.

## TraceEvent (extensão do tipo existente em `src/domain/strategy.ts`)

Novo variante da união discriminada `TraceEvent`:

| Campo | Tipo | Descrição |
|---|---|---|
| `type` | `"fallback"` | Discriminador do evento. |
| `primaryModel` | `string` | Nome do modelo primário que falhou/esgotou tentativas. |
| `fallbackModel` | `string` | Nome do modelo de reserva que assumiu a chamada. |
| `reason` | `string` | Descrição curta e sem segredos do motivo da troca (ex.: mensagem tratada por `describeProviderError`). |

**Regras**:
- Emitido no máximo uma vez por interação (a primeira vez em que o modelo de reserva responde com sucesso após o primário se esgotar). Chamadas subsequentes dentro da mesma interação que já estão "usando" o modelo de reserva não geram novos eventos duplicados.
- `reason` nunca contém valores de `OPENROUTER_API_KEY` (FR-007) — deve reaproveitar a função de saneamento já usada em `provider-errors.ts`.

## RunMetrics (extensão do tipo existente em `src/domain/strategy.ts`)

Novo campo na estrutura já existente:

| Campo | Tipo | Descrição |
|---|---|---|
| `modelUsed` | `string \| undefined` | Nome do modelo que efetivamente produziu a resposta final da interação. `undefined` apenas se a interação falhou antes de qualquer modelo responder (não deveria ocorrer em caminho de sucesso). |

**Regras**:
- Quando não há troca de modelo, `modelUsed` é igual a `primaryModel`.
- Quando há troca (evento `fallback` presente no trace), `modelUsed` é igual a `fallbackModel`.

## Erro de Falha Total (US3)

Não é uma nova classe de erro de domínio dedicada — reaproveita a hierarquia de erros já existente (`src/domain/errors.ts` / `describeProviderError`), garantindo que, quando o runnable composto (`withRetry` + `withFallbacks`) esgota todas as opções, o erro que sobe à borda:

- É tratado por `describeProviderError` (ou equivalente) antes de virar resposta HTTP/CLI, sem vazar segredos.
- É acompanhado, no trace da interação, de um evento que reflita a falha (reaproveitando `type: "answer"` com erro tratado na borda, ou um evento de observação de erro já suportado pela união `TraceEvent` — nenhum tipo novo é necessário para este caso, apenas garantir que `reason` do último evento relevante não fique vazio).
