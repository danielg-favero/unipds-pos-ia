import type { ConversationMessage } from "../store/conversation-port.js";
import { estimateTokens } from "./tokens.js";

export type ContextBudget = {
  readonly summary: number;
  readonly history: number;
  readonly memory: number;
};

export type ScoredMemory = {
  readonly fact: string;
  readonly score: number;
};

export type PromptBuildInput = {
  readonly systemPrompt: string;
  readonly request: string;
  readonly historySummary?: string;
  readonly history: readonly ConversationMessage[];
  readonly memories: readonly ScoredMemory[];
  readonly budget?: ContextBudget;
};

export type PromptSections = {
  readonly systemPrompt: string;
  readonly request: string;
  readonly historySummary?: string;
  readonly history: readonly ConversationMessage[];
  readonly memories: readonly ScoredMemory[];
};

/** FR-003/004/005: valores padrão quando `CONTEXT_BUDGET_*` está ausente ou inválido. */
export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  summary: 200,
  history: 1200,
  memory: 300,
};

/** Trunca `text` (mantém o início) até caber em `budget` tokens estimados (FR-003). */
function fitSummary(text: string | undefined, budget: number): string | undefined {
  if (text === undefined || text.length === 0 || budget <= 0) return undefined;
  if (estimateTokens(text) <= budget) return text;

  const maxChars = budget * 4;
  return text.slice(0, maxChars);
}

/**
 * Remove mensagens mais antigas primeiro até a soma caber em `budget` (FR-004, FR-006).
 * Preserva a ordem cronológica relativa das mensagens restantes.
 */
function fitHistory(
  history: readonly ConversationMessage[],
  budget: number,
): readonly ConversationMessage[] {
  if (budget <= 0) return [];

  const kept: ConversationMessage[] = [];
  let total = 0;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i]!;
    const size = estimateTokens(message.content);
    if (total + size > budget) break;
    kept.unshift(message);
    total += size;
  }

  return kept;
}

/**
 * Ordena por `score` decrescente (sort estável — desempate pela ordem de entrada,
 * research.md §3) e inclui do maior para o menor até estourar `budget` (FR-005, FR-007).
 */
function fitMemories(
  memories: readonly ScoredMemory[],
  budget: number,
): readonly ScoredMemory[] {
  if (budget <= 0) return [];

  const sorted = [...memories].sort((a, b) => b.score - a.score);
  const kept: ScoredMemory[] = [];
  let total = 0;

  for (const memory of sorted) {
    const size = estimateTokens(memory.fact);
    if (total + size > budget) continue;
    kept.push(memory);
    total += size;
  }

  return kept;
}

/**
 * Lê `CONTEXT_BUDGET_SUMMARY`/`_HISTORY`/`_MEMORY` de `env`; cada campo cai no default
 * (`DEFAULT_CONTEXT_BUDGET`) quando ausente ou quando o valor não é um inteiro >= 0 (FR-008/FR-009).
 */
export function readBudgetFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ContextBudget {
  const parse = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : fallback;
  };

  return {
    summary: parse(env.CONTEXT_BUDGET_SUMMARY, DEFAULT_CONTEXT_BUDGET.summary),
    history: parse(env.CONTEXT_BUDGET_HISTORY, DEFAULT_CONTEXT_BUDGET.history),
    memory: parse(env.CONTEXT_BUDGET_MEMORY, DEFAULT_CONTEXT_BUDGET.memory),
  };
}

/**
 * Monta as seções do prompt aplicando o orçamento por seção. `systemPrompt` e `request`
 * nunca são cortados (FR-001/FR-002); nunca lança (FR-011), sempre total.
 */
export function buildPromptSections(input: PromptBuildInput): PromptSections {
  const budget = input.budget ?? readBudgetFromEnv();

  return {
    systemPrompt: input.systemPrompt,
    request: input.request,
    historySummary: fitSummary(input.historySummary, budget.summary),
    history: fitHistory(input.history, budget.history),
    memories: fitMemories(input.memories, budget.memory),
  };
}
