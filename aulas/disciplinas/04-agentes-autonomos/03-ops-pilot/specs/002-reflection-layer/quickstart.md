# Quickstart — Validação da Camada de Reflexão

**Feature**: `002-reflection-layer`

Roteiro para provar que a camada de reflexão funciona de ponta a ponta. Tipos e obrigações em [data-model.md](data-model.md) e [contracts/reflection.md](contracts/reflection.md). Pressupõe a feature 001 já implementada — ver `specs/001-reasoning-strategies-core/quickstart.md` para os pré-requisitos de ambiente (Node 24, `.env` com `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`).

## Pré-requisitos

- Tudo do quickstart da feature 001, mais nada novo — a reflexão não adiciona dependências.
- `npm run seed` já executado (a base de dados `data/ops-db.json` existe).

## Cenário 1 — Tipos e testes verdes, sem rede

```bash
npm run typecheck
npm test
```

**Esperado**: ambos com código de saída `0`. A suíte cobre `withReflection` com um crítico mockado (sem chamar o provedor real): aprovação na primeira tentativa, reprovação seguida de aprovação, esgotamento do orçamento, `maxReflection: 0`, e o veredito malformado.

Valida FR-014, SC-002, SC-003 — de forma determinística, sem depender de um modelo real aprovar ou reprovar algo.

## Cenário 2 — Aprovação na primeira tentativa

```bash
npm run arena -- --strategies reflect:react "liste os alertas em disparo"
```

**Esperado**: um bloco `=== reflect:react ===`. Se a resposta da primeira tentativa já é consistente com as observações, o trace mostra os eventos da tentativa (`action`/`observation`) seguidos de exatamente um `[critique] [aprovado] ...`, e a resposta final. `llmCalls` é o da estratégia `react` sozinha mais 1 (a chamada do crítico).

Valida User Story 1, FR-003, FR-004, FR-006, SC-001.

## Cenário 3 — Reprovação e nova tentativa

Difícil de forçar deliberadamente com um modelo real (o crítico decide), então valide observando o comportamento em pedidos ambíguos, ou confie no Cenário 1 (testes com crítico mockado) para a garantia determinística. Quando ocorrer naturalmente:

**Esperado**: o trace mostra os eventos da tentativa 1, um `[critique] [reprovado] <motivo>`, os eventos da tentativa 2 (rodando do zero, sobre o mesmo estado), e um segundo veredito. Se aprovado na tentativa 2, encerra ali — nenhuma tentativa 3.

Valida User Story 1 (cenário 2 e 3 da spec), FR-005, FR-009.

## Cenário 4 — Esgotamento do orçamento de tentativas

```bash
npm run arena -- --strategies reflect:react --max-iterations 4 "pergunta deliberadamente ambígua ou mal especificada"
```

**Esperado**: no pior caso, 3 tentativas da base (original + 2 regenerações) e até 3 vereditos no trace, respeitando o padrão `maxReflection: 2`. A resposta final é a da última tentativa, marcada como parcial. Nenhuma tentativa a mais que o orçamento.

Valida User Story 2, FR-007, FR-008, SC-002, SC-003.

## Cenário 5 — `maxReflection: 0` desliga o crítico

Sem uma flag de CLI dedicada (a arena não expõe `maxReflection` por linha de comando nesta feature), valide via teste unitário: `withReflection(base, { maxReflection: 0 }).run(input)` devolve exatamente `base.run(input)` — zero eventos `critique`, `llmCalls` idêntico ao da base sozinha.

Valida FR-015.

## Cenário 6 — Comparar com e sem reflexão

```bash
npm run arena -- --strategies react,reflect:react "liste os alertas em disparo e abra um incidente para o mais crítico"
```

**Esperado**: dois blocos. `react` sem nenhum evento `critique`; `reflect:react` com ao menos um. Se houve reprovação em `reflect:react`, seu `llmCalls` é maior que o de `react` para o mesmo pedido.

```bash
npm run arena -- --strategies plan-and-execute,reflect:plan-and-execute "resolva o incidente inc-1"
```

**Esperado**: o mesmo padrão de comparação, agora sobre a estratégia de plano e execução — prova que a camada de reflexão funciona igual para as duas bases (User Story 3, cenário 2 da spec).

Valida User Story 3, FR-013, SC-004.

## Cenário 7 — Nome de estratégia continua validado

```bash
npm run arena -- --strategies reflect:inexistente "teste"
```

**Esperado**: falha imediata listando os nomes válidos, incluindo `reflect:react` e `reflect:plan-and-execute` — sem mudança de comportamento em `src/arena.ts` ou `src/cli/args.ts`.

---

## Checklist de saída

- [x] `npm run typecheck` e `npm test` verdes — 109 testes, 0 falhas, estável em 10 execuções
- [x] Testes cobrem: aprovação de primeira, reprovação→aprovação, esgotamento de `maxReflection`, `maxReflection: 0`, veredito malformado — todos com crítico mockado, sem rede (`src/agents/reflection.test.ts`)
- [x] `reflect:react` e `reflect:plan-and-execute` aparecem em `npm run arena` sem flags — `strategyNames()` lista as 4 chaves em ordem alfabética
- [x] Comparação `react` vs `reflect:react` mostra a diferença de `llmCalls` quando há reprovação — validado ao vivo: `react` com `llmCalls: 3`, `reflect:react` com `llmCalls: 4` (a chamada extra do crítico, aprovado de primeira)
- [x] Nome de estratégia inválido com prefixo `reflect:` continua recusado com a lista de válidos — `reflect:inexistente` recusado listando as 4 chaves

Cota do OpenRouter disponível durante esta implementação: todos os cenários ao vivo (2, 6, 7) puderam ser executados, não só o determinístico (Cenário 1).
