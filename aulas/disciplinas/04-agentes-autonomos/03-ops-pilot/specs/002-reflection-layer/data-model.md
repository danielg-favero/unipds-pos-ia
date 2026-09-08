# Phase 1 — Data Model: Camada de Reflexão

**Feature**: `002-reflection-layer` | **Date**: 2026-09-08

Esta feature não introduz entidades de domínio persistidas (nenhuma tabela, nenhum alerta/incidente novo). Ela introduz tipos de orquestração em `src/agents/reflection.ts`, sobre os tipos já existentes de `src/domain/strategy.ts`.

---

## Tipos novos

### `ReflectionOptions`

```ts
type ReflectionOptions = {
  readonly maxReflection?: number; // default 2 (FR-007)
  readonly name?: string;          // default `reflect:${base.name}` (R-009)
};
```

| Campo | Regras |
|-------|--------|
| `maxReflection` | Inteiro ≥ 0. `0` desliga o crítico por completo (FR-015, R-010). Sem teto superior imposto pelo tipo — é orçamento do avaliador, não um limite de segurança do sistema (esse é `maxIterations`, já existente). |
| `name` | Quando omitido, `reflect:<base.name>` (R-009). |

### `Verdict` (saída estruturada do crítico)

```ts
type Verdict = {
  readonly approved: boolean;
  readonly feedback: string;
};
```

Origem: FR-004. `feedback` é obrigatório mesmo quando `approved: true` — vira o texto do evento `critique` de aprovação (ex.: "consistente com as observações").

### `ReflectionAttempt` (uso interno, não exportado)

Estrutura de acumulação dentro de `withReflection.run`, não faz parte de nenhum contrato público:

```ts
type ReflectionAttempt = {
  readonly run: StrategyRun;   // resultado completo da tentativa da base
  readonly verdict: Verdict;   // avaliação dessa tentativa
};
```

---

## Reaproveitamento de tipos existentes (sem alteração)

| Tipo | Arquivo | Uso nesta feature |
|------|---------|--------------------|
| `ReasoningStrategy` | `src/domain/strategy.ts:39` | `withReflection` recebe e devolve este tipo — é o contrato do decorator (R-001) |
| `StrategyInput` | `src/domain/strategy.ts:27` | Repassado a cada tentativa da base, com `request` possivelmente ampliado pelo feedback da tentativa anterior (R-006) — **nenhum campo novo** |
| `StrategyRun` | `src/domain/strategy.ts:33` | O que cada tentativa da base devolve, e o formato final devolvido por `withReflection` |
| `TraceEvent` (`critique`) | `src/domain/strategy.ts:19` | Reaproveitado para o veredito, com o resultado codificado no prefixo do texto — `[aprovado]` / `[reprovado]` (R-002) |
| `RunMetrics` | `src/domain/strategy.ts:22` | Somado através das tentativas (R-007) |
| `RunTracker` / `CallCounter` | `src/agents/metrics.ts` | Instanciado uma vez pelo decorator, só para a(s) chamada(s) do crítico |
| `finishRun` | `src/domain/strategy.ts:48` | **Não é chamado pelo decorator** quando `maxReflection: 0` (repassa o `StrategyRun` da base intacto); é usado nas demais saídas para fechar o trace acumulado em `answer` |

---

## Fluxo de estado dentro de `withReflection.run`

```
tentativa = 0
requestAtual = input.request
trace = []
metrics = { llmCalls: 0, latencyMs: 0 }

repetir:
  runBase = base.run({ ...input, request: requestAtual })
  trace += runBase.trace (sem o evento "answer" final da base — ele é
           reaberto pelo finishRun do decorator na saída)
  metrics.llmCalls += runBase.metrics.llmCalls

  se maxReflection == 0:
    devolver runBase sem chamar o crítico   # R-010

  verdict = avaliarCritico(input.request, runBase.answer, observações(runBase.trace))
  metrics.llmCalls += 1  # chamada do crítico
  trace += evento critique com o veredito

  se verdict.approved OU tentativa == maxReflection:
    devolver finishRun(trace, runBase.answer, !verdict.approved, metrics)

  requestAtual = `${input.request}\n\n[Revisão anterior] ${verdict.feedback}`
  tentativa += 1
```

Notas sobre o fluxo:

- `runBase.trace` já termina em seu próprio evento `answer` (obrigação S3 herdada — toda `StrategyRun` termina assim). O decorator não duplica esse evento: acumula os eventos anteriores a ele e deixa o `answer` final ser reescrito por `finishRun` na saída, para que a resposta e o último evento do trace do resultado final continuem coincidindo (mesma obrigação S3, agora satisfeita pela camada externa).
- "Observações" passadas ao crítico = filtro de `runBase.trace` para `type === "action" || type === "observation"` (R-005).
- Falha de configuração ou do provedor durante a chamada ao crítico (Edge Case da spec) é capturada no mesmo `try/catch` que já envolve cada tentativa — vira o mesmo tipo de resposta parcial que as estratégias base já produzem, com o trace acumulado até ali preservado.

## Invariantes desta feature (equivalentes às obrigações S1–S9 herdadas do contrato base)

| # | Invariante | Requisito |
|---|------------|-----------|
| RF1 | `withReflection(base).name` é `reflect:<base.name>` por padrão, ou `opts.name` | R-009 |
| RF2 | Toda execução termina com um evento `answer`, cujo texto é `StrategyRun.answer` (herdado de S3) | FR-002 |
| RF3 | Número de chamadas ao crítico ≤ `maxReflection + 1` (a última tentativa, se reprovada, não gera nova tentativa) | FR-007, SC-003 |
| RF4 | `maxReflection: 0` ⇒ zero eventos `critique` no trace, zero chamadas extra de `llmCalls` | FR-015 |
| RF5 | `metrics.llmCalls` do resultado final = soma de `llmCalls` de todas as tentativas da base + número de chamadas ao crítico | FR-010 |
| RF6 | Um veredito malformado nunca interrompe a execução — vira `{ approved: false, feedback: "<genérico>" }` e conta como uma tentativa reprovada normal | FR-014 |
