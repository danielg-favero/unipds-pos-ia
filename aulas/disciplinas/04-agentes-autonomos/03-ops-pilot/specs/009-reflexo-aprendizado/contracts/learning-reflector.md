# Contract: `reflectLearning`

Função interna (não HTTP) em `src/memory/learning-reflector.ts`, chamada por `src/http/server.ts`
depois de uma resposta bem sucedida do `/chat`.

```ts
function reflectLearning(input: ReflectLearningInput): Promise<void>;
```

## Comportamento

- Monta um prompt com a última mensagem do usuário (`request`) e a resposta do assistente (`answer`)
  como contexto, e chama `createModel().withStructuredOutput(learningVerdictSchema)`.
- Valida a saída do modelo com Zod (`learningVerdictSchema`) antes de usá-la — saída malformada é
  tratada como `{ hasLearned: false }`.
- Se `hasLearned` for `false`, ou `fact` estiver vazio/ausente: não faz nada (FR-009).
- Se `hasLearned` for `true` e houver um `fact` não vazio: chama `memoryStore.remember(userId,
  fact)`. A deduplicação por similaridade (>0.92, de 008) decide se isso gera uma memória nova.
- Nunca lança: qualquer erro (chamada ao modelo, parse, `remember`) é capturado internamente; a
  função sempre resolve (nunca rejeita) — quem chama pode invocá-la sem `await` com segurança
  (FR-006).
- O prompt do sistema usado na chamada estruturada instrui explicitamente:
  - Nunca tratar um pedido de ação pontual (ex.: "abra um incidente", "liste os alertas") como fato
    durável.
  - Nunca extrair senhas, segredos, tokens de acesso ou qualquer informação que o usuário sinalize
    como confidencial.
  - Quando a mensagem misturar pedido pontual e fato durável, extrair somente a parte durável.

---

# Contract: tool `forget_preference`

Nova tool LangChain, criada por `makeMemoryTools(memoryStore: MemoryStore, userId: string)` em
`src/agents/tools.ts`, seguindo o mesmo padrão de `asToolResult` das demais tools.

```ts
function makeMemoryTools(memoryStore: MemoryStore, userId: string): OpsTools; // [forget_preference]
```

## Entrada

```jsonc
{ "description": "string, obrigatório — descrição em linguagem natural do que esquecer" }
```

## Comportamento

- Chama `memoryStore.recall(userId, description, 3)`.
- Sem nenhum candidato: devolve `{ ok: false, error: "nenhuma preferência memorizada parece
  corresponder a essa descrição" }` — o agente deve pedir mais detalhes ao usuário, nunca inventar
  uma remoção.
- Exatamente um candidato acima do corte usual de relevância (0.3, herdado de 008): chama
  `memoryStore.forget(userId, candidato.id)` e devolve `{ ok: true, data: { forgotten:
  candidato.fact } }`.
- Mais de um candidato plausível: **não remove nada**; devolve `{ ok: true, data: { candidates:
  [...facts] } }` para o agente esclarecer com o usuário qual deles esquecer (edge case da spec:
  pedido ambíguo).
- Nunca lança: segue o mesmo padrão de `asToolResult` das demais tools (erro de domínio, se houver,
  vira resultado `{ ok: false, error }` legível pelo modelo).
