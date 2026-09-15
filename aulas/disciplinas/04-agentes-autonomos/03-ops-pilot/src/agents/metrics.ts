import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";

import type { ContextBreakdown } from "../context/tokens.js";
import { extractPromptTokens } from "../context/tokens.js";
import type { RunMetrics } from "../domain/strategy.js";

/**
 * Conta chamadas ao chat model por execução e acumula o uso real de tokens de
 * prompt (010, FR-001/FR-002). Vai em `config.callbacks` de cada
 * `invoke`/`stream` — nunca no construtor do modelo, que é compartilhado entre
 * estratégias e misturaria execuções.
 */
export class CallCounter extends BaseCallbackHandler {
  name = "ops-pilot-call-counter";
  #calls = 0;
  #promptTokens = 0;
  #sawUsage = false;

  handleChatModelStart(): void {
    this.#calls += 1;
  }

  /** Modelos que expõem a interface de LLM de texto em vez de chat. */
  handleLLMStart(): void {
    this.#calls += 1;
  }

  handleLLMEnd(output: LLMResult): void {
    const tokens = extractPromptTokens(output);
    if (tokens !== undefined) {
      this.#promptTokens += tokens;
      this.#sawUsage = true;
    }
  }

  get calls(): number {
    return this.#calls;
  }

  /** Soma do uso real visto até aqui; `undefined` se nenhuma chamada reportou uso (FR-005). */
  get promptTokensReal(): number | undefined {
    return this.#sawUsage ? this.#promptTokens : undefined;
  }
}

/**
 * Cronômetro + contador de uma execução. `snapshot()` pode ser chamado a
 * qualquer momento, inclusive num caminho de erro, e sempre devolve as métricas
 * acumuladas até ali (obrigações S5 e S6).
 */
export class RunTracker {
  readonly counter = new CallCounter();
  readonly #startedAt = Date.now();
  readonly #historyMessages: number;

  constructor(historyMessages = 0) {
    this.#historyMessages = historyMessages;
  }

  snapshot(contextBreakdown: ContextBreakdown, modelUsed?: string): RunMetrics {
    return {
      llmCalls: this.counter.calls,
      latencyMs: Date.now() - this.#startedAt,
      historyMessages: this.#historyMessages,
      promptTokensReal: this.counter.promptTokensReal,
      contextBreakdown,
      modelUsed,
    };
  }
}
