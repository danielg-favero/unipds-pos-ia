import { z } from "zod";

import type {
  ReasoningStrategy,
  RunMetrics,
  StrategyInput,
  StrategyRun,
  TraceEvent,
} from "../domain/strategy.js";
import { finishRun } from "../domain/strategy.js";
import { formatTrace } from "../domain/trace.js";
import { createModel } from "./model.js";
import { describeProviderError } from "./provider-errors.js";

export const DEFAULT_MAX_REFLECTION = 2;

export type ReflectionOptions = {
  readonly maxReflection?: number;
  readonly name?: string;
};

export const verdictSchema = z.object({
  approved: z.boolean(),
  feedback: z
    .string()
    .min(1)
    .describe("Se reprovado: o que corrigir, de forma específica e acionável"),
});

export type Verdict = z.infer<typeof verdictSchema>;

const CRITIC_PROMPT = [
  "Você é o crítico do OpsPilot. Avalie a resposta de um copiloto de plantão",
  "comparando-a APENAS com o pedido original e as observações do trace —",
  "as ações executadas e seus resultados. Não julgue estilo, tom ou formatação.",
  "Reprove se a resposta afirmar algo que as observações não sustentam,",
  "contradisser um erro retornado por uma ferramenta, ou ignorar uma",
  "observação relevante para o pedido. Aprove quando a resposta for",
  "consistente com o que foi de fato observado.",
].join(" ");

/** As observações de uma tentativa: só ações e seus resultados, nunca pensamentos ou críticas anteriores (R-005). */
export const observationsOf = (trace: readonly TraceEvent[]): TraceEvent[] =>
  trace.filter((event) => event.type === "action" || event.type === "observation");

const GENERIC_FEEDBACK =
  "O crítico devolveu um veredito que não pôde ser interpretado; tratando como reprovação por segurança.";

/**
 * Avalia uma tentativa contra suas próprias observações. Nunca lança: uma
 * saída malformada do crítico vira reprovação com feedback genérico (RF13),
 * e uma falha do provedor vira reprovação identificando o problema — a
 * chamada externa decide o que fazer com isso, `critique` nunca aborta a
 * execução por conta própria.
 */
export async function critique(
  request: string,
  run: Pick<StrategyRun, "answer" | "trace">,
): Promise<Verdict> {
  try {
    const raw = await createModel()
      .withStructuredOutput(verdictSchema)
      .invoke([
        ["system", CRITIC_PROMPT],
        [
          "user",
          `Pedido: ${request}\nObservações: ${formatTrace(observationsOf(run.trace))}\nResposta: ${run.answer}`,
        ],
      ]);

    const parsed = verdictSchema.safeParse(raw);
    return parsed.success ? parsed.data : { approved: false, feedback: GENERIC_FEEDBACK };
  } catch (error) {
    return { approved: false, feedback: `Crítico indisponível: ${describeProviderError(error)}` };
  }
}

const verdictText = (verdict: Verdict): string =>
  `[${verdict.approved ? "aprovado" : "reprovado"}] ${verdict.feedback}`;

const withFeedback = (request: string, feedback: string): string =>
  `${request}\n\n[Revisão anterior] ${feedback}`;

/** Todos os eventos de uma tentativa exceto seu `answer` final — reaberto pelo `finishRun` externo (ver data-model.md). */
const withoutFinalAnswer = (trace: readonly TraceEvent[]): TraceEvent[] =>
  trace.at(-1)?.type === "answer" ? trace.slice(0, -1) : [...trace];

export type CriticFn = typeof critique;

/**
 * Núcleo testável de `withReflection`, com o crítico injetado — é o que
 * permite cobrir o laço de aprovação/regeneração e os guardrails com um
 * crítico mockado, sem rede (FR-030/FR-031 herdados, ver reflection.test.ts).
 * `withReflection` é `runReflection` fechado sobre o crítico real.
 */
export function runReflection(
  base: ReasoningStrategy,
  criticFn: CriticFn,
  opts: ReflectionOptions = {},
): ReasoningStrategy {
  const maxReflection = opts.maxReflection ?? DEFAULT_MAX_REFLECTION;

  return {
    name: opts.name ?? `reflect:${base.name}`,

    async run(input: StrategyInput): Promise<StrategyRun> {
      const startedAt = Date.now();
      let llmCalls = 0;
      let promptTokensReal: number | undefined;
      let sawPromptTokens = false;
      const trace: TraceEvent[] = [];
      let request = input.request;
      let lastRun: StrategyRun | undefined;
      const historyMessages = input.history?.length ?? 0;

      // Soma promptTokensReal de cada tentativa, tratando `undefined` como
      // ausente (não como 0) — o total final só é `undefined` se nenhuma
      // tentativa reportou uso real (010, FR-002/FR-005).
      const accumulate = (tokens: number | undefined): void => {
        if (tokens === undefined) return;
        promptTokensReal = (promptTokensReal ?? 0) + tokens;
        sawPromptTokens = true;
      };
      const metricsFor = (contextBreakdown: RunMetrics["contextBreakdown"]): RunMetrics => ({
        llmCalls,
        latencyMs: Date.now() - startedAt,
        historyMessages,
        promptTokensReal: sawPromptTokens ? promptTokensReal : undefined,
        contextBreakdown,
      });

      for (let attempt = 0; attempt <= maxReflection; attempt += 1) {
        const runBase = await base.run({ ...input, request });
        llmCalls += runBase.metrics.llmCalls;
        accumulate(runBase.metrics.promptTokensReal);
        trace.push(...withoutFinalAnswer(runBase.trace));
        lastRun = runBase;

        // maxReflection: 0 nunca chama o crítico (FR-015, RF4).
        if (maxReflection === 0) return runBase;

        const verdict = await criticFn(input.request, runBase);
        llmCalls += 1;
        trace.push({ type: "critique", text: verdictText(verdict) });

        const exhausted = attempt === maxReflection;
        if (verdict.approved || exhausted) {
          return finishRun(
            trace,
            runBase.answer,
            !verdict.approved,
            metricsFor(runBase.metrics.contextBreakdown),
          );
        }

        request = withFeedback(input.request, verdict.feedback);
      }

      // Inatingível: o laço sempre retorna dentro de si (maxReflection >= 0).
      // Mantido para satisfazer o typechecker sem lançar em produção.
      const fallback = lastRun!;
      return finishRun(trace, fallback.answer, true, metricsFor(fallback.metrics.contextBreakdown));
    },
  };
}

/**
 * Decora qualquer `ReasoningStrategy` com uma passagem de autocrítica: executa
 * a base, um crítico avalia a resposta contra as observações do trace, e se
 * reprovar, regenera com o feedback no pedido da tentativa seguinte — até
 * aprovar ou esgotar `maxReflection` (padrão 2). Não modifica `base` nem exige
 * mudanças nela (FR-001, SC-005).
 */
export function withReflection(
  base: ReasoningStrategy,
  opts: ReflectionOptions = {},
): ReasoningStrategy {
  return runReflection(base, critique, opts);
}
