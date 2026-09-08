import { UnknownStrategyError } from "../domain/errors.js";
import type { ReasoningStrategy } from "../domain/strategy.js";
import { planAndExecuteStrategy } from "./plan-and-execute.js";
import { reactStrategy } from "./react.js";
import { withReflection } from "./reflection.js";

/**
 * Catálogo nomeado de estratégias. Adicionar uma estratégia é adicionar uma
 * entrada aqui — o arena não muda. As variantes `reflect:*` envolvem as
 * estratégias base em autocrítica (src/agents/reflection.ts) sem alterá-las.
 */
export const strategies: Readonly<Record<string, ReasoningStrategy>> = {
  [reactStrategy.name]: reactStrategy,
  [planAndExecuteStrategy.name]: planAndExecuteStrategy,
  "reflect:react": withReflection(reactStrategy),
  "reflect:plan-and-execute": withReflection(planAndExecuteStrategy),
};

export const strategyNames = (): string[] => Object.keys(strategies).toSorted();

export function resolveStrategies(names: readonly string[]): ReasoningStrategy[] {
  const available = strategyNames();
  return names.map((name) => {
    const strategy = strategies[name];
    if (strategy === undefined) throw new UnknownStrategyError(name, available);
    return strategy;
  });
}
