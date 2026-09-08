import { BaseCallbackHandler } from "@langchain/core/callbacks/base";

import type { RunMetrics } from "../domain/strategy.js";

/**
 * Conta chamadas ao chat model por execução. Vai em `config.callbacks` de cada
 * `invoke`/`stream` — nunca no construtor do modelo, que é compartilhado entre
 * estratégias e misturaria execuções.
 */
export class CallCounter extends BaseCallbackHandler {
  name = "ops-pilot-call-counter";
  #calls = 0;

  handleChatModelStart(): void {
    this.#calls += 1;
  }

  /** Modelos que expõem a interface de LLM de texto em vez de chat. */
  handleLLMStart(): void {
    this.#calls += 1;
  }

  get calls(): number {
    return this.#calls;
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

  snapshot(): RunMetrics {
    return {
      llmCalls: this.counter.calls,
      latencyMs: Date.now() - this.#startedAt,
    };
  }
}
