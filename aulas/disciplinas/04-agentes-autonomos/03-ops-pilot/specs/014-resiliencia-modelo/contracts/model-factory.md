# Contract: Fábrica de Modelo Resiliente (`src/agents/model.ts`)

Esta feature não expõe uma nova interface HTTP/CLI externa; o contrato relevante é o módulo interno consumido pelas estratégias de raciocínio (`react`, `plan-and-execute`, `reflection`, `production-graph`). Documentado aqui como "contrato" porque é a fronteira que as demais camadas (Princípio I) dependem.

## Função existente (inalterada): `createModel()`

```ts
function createModel(): ChatOpenAI
```

- Continua sem retry/fallback embutido. Usada por consumidores que só precisam do modelo primário puro (ex.: sumarização de histórico, reflexão de aprendizado em segundo plano).
- Contrato de erro inalterado: lança `ConfigError` se `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` ausentes.

## Função nova: `createResilientModel()`

```ts
function createResilientModel(): {
  readonly runnable: Runnable; // ChatOpenAI com .withRetry() + .withFallbacks([...]) aplicados
  readonly primaryModel: string;
  readonly fallbackModel: string | undefined;
}
```

- **Pré-condições**: mesmas de `createModel()` para `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`. `OPENROUTER_MODEL_FALLBACK` é opcional.
- **Comportamento**:
  - Sempre aplica `.withRetry({ stopAfterAttempt: N })` (N pequeno, ex. 2–3) ao modelo primário.
  - Se `fallbackModel` estiver definido, compõe `.withFallbacks([modeloReservaComRetry])` sobre o primário; caso contrário, `runnable` é apenas o primário com retry (FR-008).
  - Não lança exceção na criação por ausência de `OPENROUTER_MODEL_FALLBACK` — apenas na ausência das variáveis obrigatórias (mesmo contrato de erro de `createModel()`).
- **Pós-condições / uso pelo chamador**:
  - O chamador (estratégia/roteador) invoca `runnable` normalmente, como faria com o `ChatOpenAI` retornado por `createModel()`.
  - Após uma invocação bem-sucedida, o chamador pode comparar o nome do modelo reportado em `response_metadata` da resposta contra `primaryModel`/`fallbackModel` para determinar `metrics.modelUsed` e, se diferente do primário, emitir o `TraceEvent` do tipo `"fallback"`.
  - Se todas as tentativas (primário + reserva, cada um com seu próprio retry) falharem, a exceção do último fallback é propagada ao chamador, que deve tratá-la como falha de interação (US3), passando-a por `describeProviderError` (ou equivalente) antes de expor ao usuário/HTTP.

## Não-objetivos deste contrato

- Não altera o formato de request/response HTTP de `/chat` nem outros endpoints — `metrics.modelUsed` e o evento `"fallback"` ficam disponíveis internamente em `StrategyRun`/trace, e sua exposição (ou não) via HTTP é decisão de uma feature futura, fora do escopo aqui.
- Não introduz múltiplos modelos de reserva em cascata (apenas um, conforme Assumptions do spec).
