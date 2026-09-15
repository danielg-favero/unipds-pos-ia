# Contract: `ReasoningStrategy` interna `"production"` (`src/agents/production-graph.ts`)

Contrato de módulo (não HTTP): como o resto do código (registry, testes, `server.ts`) interage com
o grafo unificado.

## Export principal

```ts
export const productionStrategy: ReasoningStrategy; // name: "production"
```

Implementa a interface já existente em `src/domain/strategy.ts`:

```ts
export interface ReasoningStrategy {
  readonly name: string;
  run(input: StrategyInput): Promise<StrategyRun>;
}
```

## Extensão de `StrategyInput` consumida (via campo opcional já previsto por design, não requer
mudança de tipo em `src/domain/strategy.ts` além de documentação)

O grafo lê, além dos campos já existentes de `StrategyInput`, um campo adicional opcional:

```ts
overrideRoute?: string; // nome de uma estratégia-base do catálogo de roteamento
```

- Ausente/`undefined`: o nó `router` decide automaticamente.
- Presente: deve ser um nome válido dentre as estratégias-base roteáveis (`react`,
  `plan-and-execute`); `server.ts` é responsável por validar isso *antes* de chamar
  `productionStrategy.run(...)`, reaproveitando o mesmo `UnknownStrategyError` já lançado hoje pelo
  lookup em `deps.strategies` (contrato de erro inalterado — ver `contracts/chat-endpoint.md`).

## Garantias do `run()`

1. **Nunca rejeita** — mesma obrigação já vigente em `react.ts`/`plan-and-execute.ts`/
   `reflection.ts`: qualquer falha (do roteador ou da estratégia-base escolhida) vira uma resposta
   parcial via `finishRun(..., partial: true, ...)`.
2. O `trace` retornado contém **exatamente um** evento `{ type: "route", ... }`, seguido pelos
   eventos produzidos pela estratégia-base efetivamente executada, seguido pelo evento final
   `{ type: "answer", ... }` (via `finishRun`).
3. `metrics` (`RunMetrics`) é agregada de forma equivalente ao que a estratégia-base escolhida já
   produz hoje quando chamada diretamente — `llmCalls` inclui a chamada extra do roteador quando
   ela ocorre (decisão automática), mas não quando há override (`manual: true`, sem chamada ao
   modelo para decidir).
4. `productionStrategy.name === "production"` é a chave usada em `src/agents/registry.ts` para
   registrá-la no catálogo (`strategies["production"]`), permitindo `reflect:production` pelo mesmo
   mecanismo genérico já existente (`withReflection(productionStrategy)`), caso necessário no
   futuro — não é exigido por esta feature, mas não deve ser quebrado.

## Uso esperado em `src/http/server.ts`

```ts
const resolvedOverride = strategyName; // do corpo da requisição, já validado contra deps.strategies
const target = reflect ? withReflection(productionStrategy) : productionStrategy;

const result = await target.run({
  // ...campos já existentes (request, maxIterations, store, history, memories, historySummary, userId, memoryStore)
  overrideRoute: resolvedOverride, // undefined quando strategy não veio no corpo
});
```

`deps.strategies` continua existindo como catálogo (para validar nomes de override e para o
lookup de erro 422), mas a *execução* de `/chat` passa a sempre atravessar `productionStrategy`
(diretamente, ou decorada por `withReflection`) em vez de despachar direto para `react`/
`plan-and-execute` por nome.
