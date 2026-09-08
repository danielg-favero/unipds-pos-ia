# Contrato: withReflection

**Módulo**: `src/agents/reflection.ts`.

Origem: FR-001 a FR-015 da spec; tipos em [data-model.md](../data-model.md).

## Assinatura

```ts
export type ReflectionOptions = {
  readonly maxReflection?: number; // default 2
  readonly name?: string;          // default `reflect:${base.name}`
};

export function withReflection(
  base: ReasoningStrategy,
  opts?: ReflectionOptions,
): ReasoningStrategy;
```

`withReflection(base, opts).run` tem exatamente a assinatura de `ReasoningStrategy.run` — `(input: StrategyInput) => Promise<StrategyRun>` — e nenhuma outra forma de chamada.

## Obrigações

Numeração própria desta feature; reafirma e estende as obrigações S1–S9 de `specs/001-reasoning-strategies-core/contracts/strategy.md`, que continuam válidas (RF2 = S3 herdada).

| # | Obrigação | Requisito |
|---|-----------|-----------|
| RF1 | `withReflection(base)` não modifica `base` nem lê/grava estado fora do que `base.run` já faz — é composição pura de função | FR-001, SC-005 |
| RF2 | O último evento do trace devolvido é sempre `answer`, e `answer.text` é idêntico a `StrategyRun.answer` do resultado (herdado de S3) | FR-002 |
| RF3 | Ao menos uma execução da estratégia base sempre ocorre, mesmo com `maxReflection: 0` | FR-001, FR-015 |
| RF4 | O crítico só é chamado quando `maxReflection > 0`; com `maxReflection: 0`, `run` devolve exatamente o `StrategyRun` produzido pela base, sem inserir evento `critique` | FR-015 |
| RF5 | Quando o crítico aprova, `run` encerra imediatamente — nenhuma tentativa adicional é feita | FR-006 |
| RF6 | O número de tentativas adicionais (regenerações após reprovação) nunca excede `maxReflection` (default 2) | FR-007, SC-003 |
| RF7 | Ao esgotar `maxReflection` sem aprovação, `run` devolve a resposta da **última** tentativa, com `partial: true` | FR-008 |
| RF8 | Todo evento produzido por toda tentativa da base aparece no trace final, na ordem em que ocorreu, incluindo tentativas descartadas por reprovação | FR-009, SC-002 |
| RF9 | Cada avaliação do crítico gera exatamente um evento `type: "critique"` no trace, na posição em que ocorreu, com o veredito codificado no início do texto (`[aprovado] ...` / `[reprovado] ...`) | FR-009 |
| RF10 | `metrics.llmCalls` do resultado = soma de `llmCalls` de todas as tentativas da base + uma chamada por avaliação do crítico realizada | FR-010 |
| RF11 | `metrics.latencyMs` do resultado é medido de ponta a ponta de `withReflection(...).run`, não a soma das latências individuais | FR-010 |
| RF12 | A regeneração após reprovação usa o `maxIterations` e o `store` originais do `StrategyInput` recebido, sem subdividir `maxIterations` entre tentativas | FR-011, R-008 |
| RF13 | Um veredito do crítico que falhe ao ser interpretado (schema inválido, campo ausente) é tratado como `{ approved: false, feedback: "<mensagem genérica>" }` — nunca lança, nunca aprova por omissão | FR-014 |
| RF14 | Falha de configuração ou do provedor durante a chamada ao crítico produz o mesmo tipo de resposta parcial que as estratégias base já produzem em falha — nunca perde o trace acumulado até ali | Edge case "Falha de configuração..." |

## O que o crítico recebe e devolve

**Entrada** (mensagens do prompt do crítico, não um tipo exportado):

- O pedido original (`input.request`, sem o feedback de tentativas anteriores concatenado).
- A resposta da tentativa avaliada (`StrategyRun.answer`).
- As observações dessa tentativa: os eventos `action` e `observation` do `StrategyRun.trace`, formatados com `formatTrace` de `src/domain/trace.ts` (determinístico, já usado pela arena).

**Saída estruturada** (`Verdict`, ver [data-model.md](../data-model.md)):

```ts
{ approved: boolean; feedback: string }
```

`feedback` é obrigatório mesmo quando `approved: true`.

## Regeneração

Quando o crítico reprova e ainda há orçamento (`tentativa < maxReflection`):

- A tentativa seguinte roda `base.run` com um novo `StrategyInput` cujo `request` é `${input.request}\n\n[Revisão anterior] ${verdict.feedback}` — nenhum campo novo é adicionado a `StrategyInput` (R-006).
- `maxIterations` e `store` são os mesmos do `input` original — o mesmo `store`, para que efeitos colaterais já persistidos (ex. um incidente aberto por uma tentativa anterior) sejam visíveis à tentativa seguinte.

## Catálogo

**Módulo**: `src/agents/registry.ts` (existente, editado).

```ts
export const strategies: Readonly<Record<string, ReasoningStrategy>> = {
  [reactStrategy.name]: reactStrategy,
  [planAndExecuteStrategy.name]: planAndExecuteStrategy,
  "reflect:react": withReflection(reactStrategy),
  "reflect:plan-and-execute": withReflection(planAndExecuteStrategy),
};
```

`strategyNames()` e `resolveStrategies()` não mudam — continuam operando sobre o mapa (FR-013, SC-004). Nenhuma mudança em `src/arena.ts` é necessária: a arena já resolve estratégias pelo nome vindo de `--strategies`.
