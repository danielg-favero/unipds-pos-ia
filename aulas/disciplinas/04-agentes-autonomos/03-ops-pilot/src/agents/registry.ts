import { UnknownStrategyError } from "../domain/errors.js";
import type { ReasoningStrategy } from "../domain/strategy.js";
import { planAndExecuteStrategy } from "./plan-and-execute.js";
import { productionStrategy, routableStrategies } from "./production-graph.js";
import { reactStrategy } from "./react.js";
import { withReflection } from "./reflection.js";

/**
 * Catálogo nomeado de estratégias. Adicionar uma estratégia é adicionar uma
 * entrada aqui — o arena não muda. As variantes `reflect:*` envolvem as
 * estratégias base em autocrítica (src/agents/reflection.ts) sem alterá-las.
 *
 * `"production"` (013) é o grafo unificado (src/agents/production-graph.ts):
 * roteia automaticamente entre `react`/`plan-and-execute`/`reflect`, ou
 * executa uma rota forçada via override manual de `/chat`. `/chat` a usa como
 * default quando `strategy` não é informado no corpo da requisição.
 */
export const strategies: Readonly<Record<string, ReasoningStrategy>> = {
  [reactStrategy.name]: reactStrategy,
  [planAndExecuteStrategy.name]: planAndExecuteStrategy,
  "reflect:react": withReflection(reactStrategy),
  "reflect:plan-and-execute": withReflection(planAndExecuteStrategy),
  // Alias de catálogo para a rota interna "reflect" do grafo unificado (013),
  // usado apenas para validar overrides explícitos de `strategy` em /chat.
  reflect: routableStrategies.reflect,
  [productionStrategy.name]: productionStrategy,
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
