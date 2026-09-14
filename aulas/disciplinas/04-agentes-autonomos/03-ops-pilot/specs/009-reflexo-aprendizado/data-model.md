# Data Model: Reflexo de Aprendizado Automático

Nenhuma tabela nova: esta feature reaproveita a tabela `memories` de
[008-memoria-semantica](../008-memoria-semantica/data-model.md) sem alterar seu schema. Os "dados"
introduzidos aqui são tipos de orquestração (não persistidos como entidades próprias).

## Tipos TypeScript

```ts
// src/memory/learning-reflector.ts
export type LearningVerdict = {
  readonly hasLearned: boolean;
  readonly fact?: string; // presente somente quando hasLearned é true
};

export type ReflectLearningInput = {
  readonly request: string; // última mensagem do usuário
  readonly answer: string; // resposta do assistente, como contexto
  readonly userId: string;
  readonly memoryStore: MemoryStore; // de src/memory/memory-store.ts (008)
};

/** Nunca lança: falha do modelo/provedor vira hasLearned: false silencioso. */
export type LearningReflectorFn = (
  request: string,
  answer: string,
) => Promise<LearningVerdict>;
```

```ts
// src/agents/tools.ts (tool nova)
export const forgetPreferenceSchema = z.object({
  description: z
    .string()
    .min(1)
    .describe("Descrição em linguagem natural do que o usuário quer esquecer."),
});
```

## Fluxo de dados (sem nova entidade persistida)

1. `POST /chat` responde ao usuário (como já fazia em 008).
2. Sem `await` bloqueando a resposta: `reflectLearning({ request: message, answer: result.answer,
   userId, memoryStore: deps.memoryStore })` roda em segundo plano.
3. Se `hasLearned` for `true`, `memoryStore.remember(userId, fact)` é chamado com o fato distilado
   (não mais a mensagem crua do usuário, como em 008) — sujeito à mesma deduplicação por similaridade
   já existente.
4. Independente do passo 2/3, se o usuário pedir para esquecer algo durante a conversa, o agente pode
   chamar a tool `forget_preference`, que usa `memoryStore.recall` para achar candidatos e
   `memoryStore.forget` para remover o escolhido.

## Invariantes

- Uma reflexão nunca produz mais de um fato por chamada (`fact` é uma string única, não uma lista) —
  consistente com FR-001/FR-005 (analisar a última mensagem, extrair o fato durável dela).
- `reflectLearning` nunca lança: qualquer erro (rede, parse, validação) é capturado e tratado como
  `{ hasLearned: false }` (FR-006, FR-009).
- `forget_preference` nunca remove mais de uma memória por chamada, e nunca remove nada quando há
  ambiguidade (mais de um candidato plausível) — nesse caso devolve os candidatos para o agente
  esclarecer com o usuário, sem apagar.
