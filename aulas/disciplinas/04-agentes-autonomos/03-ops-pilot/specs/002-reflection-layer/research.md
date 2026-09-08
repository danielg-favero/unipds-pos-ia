# Phase 0 — Research: Camada de Reflexão

**Feature**: `002-reflection-layer` | **Date**: 2026-09-08

Todas as decisões foram verificadas contra o código já implementado da feature 001 (`src/domain/strategy.ts`, `src/agents/react.ts`, `src/agents/registry.ts`, `src/agents/metrics.ts`, `src/agents/model.ts`), não contra memória.

---

## R-001: Decorator sobre `ReasoningStrategy`, não uma nova estratégia

**Decision**: `withReflection(base: ReasoningStrategy, opts?: ReflectionOptions): ReasoningStrategy` em `src/agents/reflection.ts`. Devolve um objeto que satisfaz a mesma interface — `name` + `run(input): Promise<StrategyRun>`.

**Rationale**: `ReasoningStrategy` (`src/domain/strategy.ts:39`) já é a única superfície que o catálogo e o arena conhecem. Envolver em vez de estender preserva FR-001/FR-002/SC-005 sem tocar `react.ts` ou `plan-and-execute.ts`. É o mesmo padrão já usado por `finishRun`: uma função pura que fecha o formato do contrato.

**Alternatives considered**: subclasse ou flag `withReflection?: boolean` dentro de cada estratégia — replicaria a lógica de retry em dois arquivos e violaria FR-001 ("sem exigir mudanças na estratégia envolvida").

---

## R-002: Reaproveitar o tipo `critique` do trace, não criar um novo

**Decision**: O evento de crítica usa o tipo `critique` que **já existe** em `TraceEvent` (`src/domain/strategy.ts:19`: `{ type: "critique"; text: string }`), com o veredito codificado no início do texto: `"[aprovado] ..."` ou `"[reprovado] ..."` — mesma convenção que `plan-and-execute.ts` já usa para `[seguir]`/`[ajustar]`/`[encerrar]`.

**Rationale**: `TraceEvent` é uma união fechada; adicionar um campo `approved` ao caso `critique` mudaria a assinatura para *todo* consumidor existente (`formatTrace`, os testes de `plan-and-execute`), risco desnecessário para uma feature que só precisa se comunicar por texto. O prefixo já é um padrão validado no código.

**Alternatives considered**: novo tipo de evento `verdict`. Rejeitado — o pedido original já nomeia o evento como `"critique"`, e a união não teria mais essa forma sem editar todo lugar que faz *pattern match* nela.

---

## R-003: Saída estruturada do crítico via `withStructuredOutput`, sem retry automático

**Decision**: `createModel().withStructuredOutput(VerdictSchema)`, chamado sem `.withRetry(...)`.

**Rationale**: `plan-and-execute.ts` já usa exatamente esse padrão para o planner e o replanner. A feature 001 chegou a adicionar `.withRetry({ stopAfterAttempt: 3 })` a essas chamadas e **removeu** depois de descobrir que a causa real de respostas vazias era 429 de cota do OpenRouter, não ruído transiente — retry só queimava cota e mascarava `describeProviderError` (ver `src/agents/provider-errors.ts`, `plan-and-execute.ts` comentário "Sem retry de propósito"). A reflexão herda essa lição: sem retry.

**Alternatives considered**: retry customizado só para o crítico. Rejeitado pela mesma causa raiz — não é o tipo de falha que retry resolve.

---

## R-004: Veredito malformado vira reprovação, tratado como resultado — não como exceção

**Decision**: `VerdictSchema = z.object({ approved: z.boolean(), feedback: z.string().min(1) }).catch({ approved: false, feedback: "..." })` ou equivalente via `safeParse` com fallback explícito no código do decorator (não no schema `.catch`, que esconderia o motivo do log).

**Rationale**: FR-014 exige que um veredito malformado seja reprovação silenciosa-para-o-usuário mas **nunca** falha que aborta. Isso é resultado de domínio, não exceção — indistinguível de qualquer outro parse de saída estruturada já feito em `plan-and-execute.ts` (`planSchema.parse(raw)`, `replanSchema.parse(raw)`), que ali *propagam* o erro porque planner/replanner são etapas obrigatórias do grafo. Aqui a semântica é oposta: falhar em entender o crítico não deve impedir uma resposta.

**Alternatives considered**: deixar o erro de parse subir e ser capturado pelo `catch` externo de `run` (viraria `answer` parcial). Rejeitado — FR-014 explicitamente proíbe que isso interrompa a execução; teria que ser tratado como reprovação normal, com uma tentativa a mais, não como fim de linha.

---

## R-005: O que o crítico recebe como contexto

**Decision**: O prompt do crítico recebe (a) o pedido original (`input.request`), (b) a resposta da tentativa (`StrategyRun.answer`), e (c) as observações do trace dessa tentativa — apenas os eventos `action`/`observation`, formatados com `formatTrace` (já determinístico, já usado pela arena). Pensamentos, planos e críticas anteriores **não** entram no que o crítico avalia, só as ações e seus resultados, conforme a spec ("compara a resposta final com o que foi de fato observado").

**Rationale**: Passar o trace inteiro (incluindo raciocínio) arrisca o crítico aprovar/reprovar por estilo em vez de fatos, contrariando a Assumption "não envolve critérios de estilo ou formatação, apenas consistência factual". Filtrar para `action`/`observation` é barato porque `TraceEvent` já discrimina por `type`.

**Alternatives considered**: mandar o trace completo. Rejeitado pela Assumption acima.

---

## R-006: Nova tentativa = nova execução completa da estratégia base, com feedback como mensagem adicional

**Decision**: `StrategyInput` (`src/domain/strategy.ts:27`) não tem um canal de "contexto extra" — é `{ request, maxIterations, store }`. A forma sem tocar o contrato é concatenar o feedback ao `request` da tentativa seguinte: `\`${input.request}\n\n[Revisão anterior] ${feedback}\``. Cada tentativa roda a estratégia base do zero (novo `agent`/`graph`), sobre o **mesmo** `store` (para que ações já feitas — como um incidente aberto — sejam visíveis à tentativa seguinte, igual ao comportamento real do `JsonOpsStore`).

**Rationale**: FR-002 exige que a estratégia envolvida continue aceitando o mesmo `StrategyInput` — não dá para adicionar um campo sem quebrar esse contrato para as estratégias não envolvidas. Concatenar ao texto do pedido é a forma que não exige mudar `StrategyInput` nem `react.ts`/`plan-and-execute.ts`. Reusar o mesmo `store` é obrigatório: nesta arquitetura, "regenerar do zero" não significa desfazer efeitos colaterais já persistidos.

**Alternatives considered**: adicionar `context?: string` opcional a `StrategyInput`. Rejeitado — mesmo opcional, expande a superfície que toda estratégia existente e futura precisa saber ignorar; a spec (FR-002) pede que o contrato *não mude*.

---

## R-007: Contagem de chamadas do crítico via o `CallCounter` existente

**Decision**: Cada tentativa de revisão cria seu próprio `RunTracker`/`CallCounter` (mesma classe de `src/agents/metrics.ts`) só para a chamada ao crítico; o `llmCalls` final é a soma de `RunMetrics.llmCalls` de cada `StrategyRun` da base **mais** o counter do decorator. A latência final é `Date.now() - inícioGlobal`, não a soma das latências individuais (que incluiriam overhead duplicado).

**Rationale**: `RunTracker.snapshot()` já é chamado "a qualquer momento, inclusive num caminho de erro" (comentário em `metrics.ts:31`) — o decorator só precisa somar o que cada `StrategyRun` já devolve, sem reimplementar contagem. FR-010 pede soma de chamadas e latência ponta a ponta, exatamente essa combinação.

**Alternatives considered**: instrumentar `callbacks` compartilhados entre todas as tentativas. Rejeitado — cada estratégia base já gerencia seu próprio `RunTracker` internamente e não expõe um jeito de injetar um externo sem mudar `react.ts`/`plan-and-execute.ts` (violaria R-001).

---

## R-008: Orçamento de iterações compartilhado entre tentativas e crítico

**Decision**: `withReflection` não subdivide `maxIterations` entre as tentativas — cada tentativa da estratégia base recebe o `maxIterations` completo do `StrategyInput` recebido pelo decorator (a estratégia base já tem sua própria barreira interna, ex. `stepBudget` do Plan-and-Execute). O que a camada de reflexão limita é o **número de tentativas adicionais** (`maxReflection`, default 2), um eixo diferente e ortogonal ao `maxIterations` de cada tentativa individual.

**Rationale**: FR-011 pede que a soma de tentativas e chamadas ao crítico não ultrapasse o orçamento "de forma descontrolada" — isso é atendido pelo teto duro de `maxReflection`, não por fatiar `maxIterations`. Fatiar seria pior: uma estratégia complexa (Plan-and-Execute) ganharia menos iterações a cada tentativa, degradando a correção justamente na tentativa de correção.

**Alternatives considered**: `maxIterations / (maxReflection + 1)` por tentativa. Rejeitado pelo motivo acima — e nenhuma parte da spec pede isso; FR-011 fala em não ultrapassar de forma descontrolada, e `maxReflection` finito com valor padrão pequeno (2) já garante isso.

---

## R-009: Nomenclatura no catálogo — prefixo `reflect:`

**Decision**: `src/agents/registry.ts` ganha `"reflect:react": withReflection(reactStrategy)` e `"reflect:plan-and-execute": withReflection(planAndExecuteStrategy)`, ao lado das entradas originais. `withReflection` também aceita um `name` custom via `opts.name`, mas o registro usa o padrão `reflect:<base.name>`.

**Rationale**: O pedido original já nomeia exatamente essas duas chaves (`reflect:react`, `reflect:plan-and-execute`); a spec (FR-013, Assumptions) deixou o nome exato para o plano. `strategyNames()` já ordena alfabeticamente e `resolveStrategies` já lança `UnknownStrategyError` — nada nesses dois muda.

**Alternatives considered**: sufixo (`react-reflect`). Rejeitado — o pedido do usuário já fixou o formato `reflect:`.

---

## R-010: `maxReflection: 0` não chama o crítico

**Decision**: `withReflection(base, { maxReflection: 0 }).run(input)` executa a base uma vez e devolve o `StrategyRun` dela diretamente (sem envolver em `finishRun` de novo, sem inserir evento `critique`).

**Rationale**: FR-015 e o Edge Case correspondente exigem exatamente isso: zero chamadas ao crítico. Como `StrategyRun.trace` já termina em `answer` (obrigação S3 do contrato original), basta repassar o resultado.

**Alternatives considered**: nenhuma — é a leitura direta do requisito.

---

## Dívidas técnicas registradas

| Item | Origem | Ação futura |
|------|--------|-------------|
| Feedback concatenado ao texto do pedido (R-006) | Contrato `StrategyInput` não tem canal de contexto extra | Se `StrategyInput` ganhar um campo de contexto estruturado no futuro, migrar para lá |
| Prefixo de veredito em texto livre no `critique.text` (R-002) | `TraceEvent` é união fechada, evitar migração de todos os consumidores | Se o `approved` precisar ser consumido programaticamente por outra camada além do `formatTrace`, promover para campo estruturado |
