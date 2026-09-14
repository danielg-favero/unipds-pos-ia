import type { BaseMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";

import { errorMessage } from "../domain/errors.js";
import type {
  ReasoningStrategy,
  StrategyInput,
  StrategyRun,
  TraceEvent,
} from "../domain/strategy.js";
import { finishRun } from "../domain/strategy.js";
import { toTrace } from "./from-messages.js";
import { RunTracker } from "./metrics.js";
import { createModel } from "./model.js";
import { describeProviderError } from "./provider-errors.js";
import { makeMemoryTools, makeTools } from "./tools.js";

/** Teto rígido de passos executados, independente do limite de iterações (FR-023). */
export const MAX_STEPS = 8;

/** Par `[passo, resultado]` empurrado para `done` a cada execução. */
export type DoneStep = [string, string];

const PlanExecuteState = Annotation.Root({
  input: Annotation<string>(),
  plan: Annotation<string[]>({
    reducer: (_previous, next) => next,
    default: () => [],
  }),
  done: Annotation<DoneStep[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  answer: Annotation<string>({
    reducer: (_previous, next) => next,
    default: () => "",
  }),
  // Fora do esboço de referência, exigido pelo contrato ReasoningStrategy.
  events: Annotation<TraceEvent[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});

type State = typeof PlanExecuteState.State;

export const planSchema = z.object({
  steps: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_STEPS)
    .describe("passos curtos, ordenados, executáveis com as ferramentas disponíveis"),
});

export const replanSchema = z.object({
  decision: z
    .enum(["seguir", "ajustar", "encerrar"])
    .describe(
      "seguir: o plano restante continua válido; ajustar: reescreva os passos restantes; encerrar: nada mais falta",
    ),
  reasoning: z.string().describe("uma frase sobre o que já foi feito e o que falta"),
  steps: z
    .array(z.string().min(1))
    .max(MAX_STEPS)
    .default([])
    .describe("novos passos restantes — preencha apenas quando decision for 'ajustar'"),
  answer: z
    .string()
    .default("")
    .describe("resposta final ao plantonista — preencha apenas quando decision for 'encerrar'"),
});

const PLANNER_PROMPT = [
  "Você é o planejador do OpsPilot, copiloto de plantão de produção.",
  "Quebre o pedido do plantonista em passos curtos e ordenados, cada um resolvível com UMA ferramenta:",
  "list_alerts (lista alertas por status), open_incident (abre incidente para um serviço),",
  "resolve_incident (resolve incidente por id).",
  `Use no máximo ${MAX_STEPS} passos. Não invente dados: se falta informação, o primeiro passo é obtê-la.`,
].join(" ");

const EXECUTOR_PROMPT = [
  "Você é o executor do OpsPilot. Execute EXATAMENTE o passo pedido, nada além dele.",
  "Chame no máximo UMA ferramenta: a do passo atual. Não antecipe passos seguintes,",
  "mesmo que o pedido original os mencione — outro executor cuidará deles.",
  "Responda em português com o resultado obtido.",
  "Se uma ferramenta devolver erro, relate o erro — não contorne com dados fictícios.",
].join(" ");

const REPLANNER_PROMPT = [
  "Você é o replanejador do OpsPilot. Recebe o pedido original, os passos restantes e o que já foi executado.",
  "Decida: 'seguir' se o plano restante continua válido; 'ajustar' se ele precisa ser reescrito",
  "à luz do que foi observado; 'encerrar' se o pedido já foi plenamente atendido.",
  "Ao encerrar, escreva em 'answer' a resposta final ao plantonista, em português.",
].join(" ");

/** Orçamento efetivo de passos: o menor entre o pedido e o teto rígido de 8. */
export const stepBudget = (maxIterations: number): number =>
  Math.max(1, Math.min(maxIterations, MAX_STEPS));

/** Barreira própria de passos: independe do recursionLimit do LangGraph (FR-023). */
export const stepBudgetExhausted = (stepsTaken: number, budget: number): boolean =>
  stepsTaken >= budget;

/** O grafo encerra quando não restam passos pendentes. */
export const planExhausted = (remainingSteps: number): boolean => remainingSteps === 0;

/**
 * Cada passo consome executor + replanner; a folga de +4 garante que a barreira
 * própria dispare ANTES do LangGraph — só assim o estouro vira resposta parcial
 * com trace, em vez de GraphRecursionError sem prestação de contas.
 */
export const graphRecursionLimit = (maxIterations: number): number =>
  stepBudget(maxIterations) * 2 + 4;

/**
 * Passos restantes após a decisão do replanejador.
 *
 * `done` é usado como barreira anti-loop: um passo idêntico a um já executado
 * não volta ao plano. Sem isso, um passo que falha (resolver um incidente já
 * resolvido, por exemplo) é reproposto indefinidamente até estourar o limite.
 */
export const nextPlan = (
  decision: "seguir" | "ajustar" | "encerrar",
  revised: readonly string[],
  current: readonly string[],
  done: readonly DoneStep[] = [],
): string[] => {
  if (decision === "encerrar") return [];
  const chosen = decision === "ajustar" && revised.length > 0 ? revised : current;
  const executed = new Set(done.map(([step]) => step));
  return chosen.filter((step) => !executed.has(step));
};

const formatDone = (done: readonly DoneStep[]): string =>
  done.length === 0
    ? "(nada executado ainda)"
    : done.map(([step, result], index) => `${index + 1}. ${step} → ${result}`).join("\n");

export type PlanAndExecuteOptions = {
  readonly name?: string;
  /** Ablation para benchmark: pula o replanejador e executa o plano original em sequência. */
  readonly skipReplanner?: boolean;
};

export function createPlanAndExecuteStrategy(
  opts: PlanAndExecuteOptions = {},
): ReasoningStrategy {
  const skipReplanner = opts.skipReplanner ?? false;

  return {
    name: opts.name ?? "plan-and-execute",

    async run(input: StrategyInput): Promise<StrategyRun> {
      const history = input.history ?? [];
      const memories = input.memories ?? [];
      const tracker = new RunTracker(history.length);
      const runConfig = { callbacks: [tracker.counter] };
      const model = createModel();

      // Sem array de mensagens no grafo (state.input é uma string única):
      // memórias e histórico entram como transcript textual prefixado ao
      // pedido, visto por planner/executor/replanner via state.input, sem
      // novos nós no grafo.
      const memoryBlock =
        memories.length === 0
          ? []
          : ["Fatos memorizados sobre este usuário:", ...memories.map((fact) => `- ${fact}`), ""];
      const historyBlock =
        history.length === 0
          ? []
          : [
              "Histórico da conversa:",
              ...history.map(
                (message) => `${message.role === "user" ? "Plantonista" : "OpsPilot"}: ${message.content}`,
              ),
              "",
            ];
      const request =
        memoryBlock.length === 0 && historyBlock.length === 0
          ? input.request
          : [...memoryBlock, ...historyBlock, `Pedido atual: ${input.request}`].join("\n");

      // Sem retry de propósito: as respostas vazias observadas eram 429 de quota,
      // e retentar um 429 só queima cota e mascara a causa em um TypeError do SDK.
      const structured = <T extends z.ZodType>(schema: T) =>
        model.withStructuredOutput(schema);

      const memoryTools =
        input.memoryStore && input.userId ? makeMemoryTools(input.memoryStore, input.userId) : [];

      const executorAgent = createReactAgent({
        llm: model,
        tools: [...makeTools(input.store), ...memoryTools],
        prompt: EXECUTOR_PROMPT,
        version: "v2",
      });

      async function planner(state: State): Promise<Partial<State>> {
        const plan = await structured(planSchema).invoke(
          [
            ["system", PLANNER_PROMPT],
            ["user", state.input],
          ],
          runConfig,
        );
        // Revalidação na borda: saída estruturada é entrada externa.
        const { steps } = planSchema.parse(plan);
        return { plan: steps, events: [{ type: "plan", steps }] };
      }

      /** Resolve o passo do topo com as tools e empurra `[passo, resultado]` para `done`. */
      async function executor(state: State): Promise<Partial<State>> {
        const [step, ...rest] = state.plan;
        if (step === undefined) return {};

        let messages: BaseMessage[] = [];
        try {
          const stream = await executorAgent.stream(
            {
              messages: [
                {
                  role: "user",
                  content: [
                    `Pedido original do plantonista: ${state.input}`,
                    `Passo a executar agora: ${step}`,
                    `Já executado:\n${formatDone(state.done)}`,
                  ].join("\n\n"),
                },
              ],
            },
            { ...runConfig, streamMode: "values", recursionLimit: 6 },
          );
          for await (const value of stream) messages = value.messages;
        } catch (error) {
          const failure = `falhou: ${errorMessage(error)}`;
          return {
            plan: rest,
            done: [[step, failure]],
            events: [
              ...toTrace(messages).events,
              { type: "observation", ok: false, error: `Passo "${step}" ${failure}` },
            ],
          };
        }

        const { events, answer } = toTrace(messages);
        return { plan: rest, done: [[step, answer]], events: [...events] };
      }

      /** Decide entre seguir, ajustar ou encerrar. */
      async function replanner(state: State): Promise<Partial<State>> {
        const revised = replanSchema.parse(
          await structured(replanSchema).invoke(
            [
              ["system", REPLANNER_PROMPT],
              [
                "user",
                [
                  `Pedido original: ${state.input}`,
                  `Passos restantes: ${state.plan.join(" | ") || "(nenhum)"}`,
                  `Já executado:\n${formatDone(state.done)}`,
                ].join("\n\n"),
              ],
            ],
            runConfig,
          ),
        );

        const plan = nextPlan(revised.decision, revised.steps, state.plan, state.done);
        const events: TraceEvent[] = [
          { type: "critique", text: `[${revised.decision}] ${revised.reasoning}` },
        ];
        if (revised.decision === "ajustar" && plan.length > 0) {
          events.push({ type: "plan", steps: plan });
        }

        return {
          plan,
          answer: revised.decision === "encerrar" ? revised.answer : "",
          events,
        };
      }

      const budget = stepBudget(input.maxIterations);

      const afterExecute = (state: State): "replanner" | typeof END =>
        stepBudgetExhausted(state.done.length, budget) ? END : "replanner";

      const afterReplan = (state: State): "executor" | typeof END =>
        planExhausted(state.plan.length) ? END : "executor";

      /** Sem replanejador: segue o plano original passo a passo até esgotá-lo ou estourar o orçamento. */
      const afterExecuteNoReplanner = (state: State): "executor" | typeof END =>
        stepBudgetExhausted(state.done.length, budget) || planExhausted(state.plan.length)
          ? END
          : "executor";

      // Acumulado fora do try: se algo estourar, o trace parcial sobrevive.
      let final: State = { input: request, plan: [], done: [], answer: "", events: [] };

      try {
        // Nomes de nó não podem colidir com as chaves de estado ("plan", "answer"...).
        const builder = new StateGraph(PlanExecuteState)
          .addNode("planner", planner)
          .addNode("executor", executor)
          .addEdge(START, "planner")
          .addEdge("planner", "executor");

        const graph = skipReplanner
          ? builder.addConditionalEdges("executor", afterExecuteNoReplanner, ["executor", END]).compile()
          : builder
              .addNode("replanner", replanner)
              .addConditionalEdges("executor", afterExecute, ["replanner", END])
              .addConditionalEdges("replanner", afterReplan, ["executor", END])
              .compile();

        const stream = await graph.stream(
          { input: request },
          {
            ...runConfig,
            streamMode: "values",
            recursionLimit: graphRecursionLimit(input.maxIterations),
          },
        );
        for await (const state of stream) final = state;

        const exhausted =
          stepBudgetExhausted(final.done.length, budget) && !planExhausted(final.plan.length);

        // Sem replanejador, ninguém escreve `answer` — sintetizamos sem chamar o
        // modelo de novo, para não distorcer a comparação de llmCalls do bench.
        const answer = skipReplanner
          ? exhausted
            ? `Orçamento de ${budget} passos atingido antes de concluir. Executado até aqui:\n${formatDone(final.done)}`
            : `Plano concluído. Executado:\n${formatDone(final.done)}`
          : exhausted || final.answer === ""
            ? `Orçamento de ${budget} passos atingido antes de concluir. Executado até aqui:\n${formatDone(final.done)}`
            : final.answer;

        const concluded = skipReplanner ? !exhausted : final.answer !== "" && !exhausted;

        return finishRun(final.events, answer, !concluded, tracker.snapshot());
      } catch (error) {
        return finishRun(
          final.events,
          `Execução interrompida: ${describeProviderError(error)}\nExecutado até aqui:\n${formatDone(final.done)}`,
          true,
          tracker.snapshot(),
        );
      }
    },
  };
}

export const planAndExecuteStrategy: ReasoningStrategy = createPlanAndExecuteStrategy();
