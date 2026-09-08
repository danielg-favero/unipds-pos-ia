---

description: "Task list for feature implementation"
---

# Tasks: Camada de Reflexão (Self-Critique)

**Input**: Design documents from `/specs/002-reflection-layer/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/reflection.md](contracts/reflection.md)

**Tests**: Incluídos — a spec exige comportamento determinístico e sem rede (herdado de FR-030/FR-031 da feature 001, constitution princípio IV), e o quickstart (Cenário 1) trata a suíte com crítico mockado como a garantia primária, já que a validação ao vivo depende de cota do OpenRouter.

**Organization**: Tarefas agrupadas por user story. US1 e US2 são ambas P1 e habitam o mesmo arquivo (`reflection.ts`) — US1 entrega o laço de aprovação/regeneração, US2 entrega os guardrails que o tornam seguro para produção. Cada uma é testável isoladamente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[Story]**: US1, US2 ou US3
- Caminhos exatos de arquivo em cada descrição

## Path Conventions

Extensão da estrutura da feature 001: tudo novo entra em `src/agents/`, mesmo nível de `react.ts`/`plan-and-execute.ts`. Nenhum diretório novo. Teste ao lado do código: `src/agents/reflection.test.ts`.

---

## Phase 1: Setup

**Purpose**: Confirmar que não há nada a instalar ou configurar — a feature reaproveita 100% da infraestrutura da 001.

- [X] T001 Confirmar que `src/agents/reflection.ts` e `src/agents/reflection.test.ts` não existem ainda e que `npm run typecheck`/`npm test` da feature 001 seguem verdes antes de começar (linha de base limpa)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Os tipos e o schema que tanto US1 quanto US2 precisam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T002 Definir `ReflectionOptions`, `Verdict` e `VerdictSchema` (`z.object({ approved: z.boolean(), feedback: z.string().min(1) })`) em `src/agents/reflection.ts`, conforme `specs/002-reflection-layer/data-model.md`
- [X] T003 Implementar `observationsOf(trace: readonly TraceEvent[]): TraceEvent[]` em `src/agents/reflection.ts` — filtra o trace de uma tentativa para `type === "action" || type === "observation"`, conforme R-005; é o que o crítico recebe, nunca o trace inteiro
- [X] T004 Implementar o prompt do crítico e a chamada `createModel().withStructuredOutput(VerdictSchema)` (sem `.withRetry`, conforme R-003) em `src/agents/reflection.ts`, recebendo pedido original, resposta da tentativa e `formatTrace(observationsOf(trace))`
- [X] T005 Implementar o fallback de veredito malformado em `src/agents/reflection.ts`: `safeParse` do resultado bruto do crítico, e em caso de falha devolver `{ approved: false, feedback: "<mensagem genérica>" }` em vez de propagar a exceção (RF13, FR-014)

**Checkpoint**: tipos e a chamada ao crítico prontos, isolados numa função testável (`critique(...)`), antes de montar o laço.

---

## Phase 3: User Story 1 — Obter uma resposta revisada antes de confiar nela (Priority: P1) 🎯 MVP

**Goal**: `withReflection(base).run(input)` executa a base, chama o crítico, e se aprovado na primeira passagem, entrega a resposta com um evento `critique` de aprovação no trace. Se reprovado, regenera uma vez com o feedback e, se a segunda tentativa for aprovada, encerra ali.

**Independent Test**: Com um crítico mockado que aprova de primeira, `withReflection(base).run(input)` devolve exatamente a resposta da base mais um evento `critique` `[aprovado]`. Com um crítico mockado que reprova uma vez e aprova na segunda, o trace mostra duas tentativas da base e dois vereditos, e a resposta final é da segunda tentativa.

- [X] T006 [US1] Implementar o esqueleto de `withReflection(base, opts?): ReasoningStrategy` em `src/agents/reflection.ts`: `name` (`opts.name ?? \`reflect:${base.name}\``) e a primeira chamada a `base.run(input)`, acumulando `trace` (sem o `answer` da base) e `metrics.llmCalls`, conforme o fluxo de `specs/002-reflection-layer/data-model.md`
- [X] T007 [US1] Implementar a chamada ao crítico após cada tentativa e a inserção do evento `critique` no trace acumulado, com o veredito codificado no prefixo do texto (`[aprovado] ...` / `[reprovado] ...`), conforme R-002
- [X] T008 [US1] Implementar o caminho de aprovação: quando `verdict.approved`, encerrar via `finishRun(trace, runBase.answer, false, metrics)` sem nova tentativa (RF5, FR-006)
- [X] T009 [US1] Implementar a regeneração: quando reprovado e ainda há orçamento, montar o próximo `StrategyInput` com `request` igual a `${input.request}\n\n[Revisão anterior] ${verdict.feedback}`, mesmo `maxIterations` e `store` do `input` original, e rodar `base.run` de novo (R-006, R-008, RF12)
- [X] T010 [US1] Escrever os testes de `src/agents/reflection.test.ts` para o caminho feliz: aprovação na primeira tentativa (nenhuma regeneração, `llmCalls` = base + 1) e reprovação seguida de aprovação na segunda (duas tentativas da base, dois vereditos no trace, resposta final da segunda tentativa), usando uma `ReasoningStrategy` e um crítico mockados por injeção de dependência — sem rede

**Checkpoint**: MVP entregue — uma estratégia envolvida em reflexão aprova de primeira ou se autocorrige em uma segunda tentativa.

---

## Phase 4: User Story 2 — Nunca ficar preso revisando indefinidamente (Priority: P1)

**Goal**: O laço de US1 nunca excede `maxReflection` (padrão 2), sempre entrega uma resposta mesmo esgotando o orçamento (marcada como parcial), e um veredito malformado do crítico é tratado como reprovação normal — nunca trava, nunca aprova por acidente, nunca perde o trace já produzido.

**Independent Test**: Com um crítico mockado que sempre reprova, `withReflection(base, { maxReflection: 2 }).run(input)` executa exatamente 3 tentativas da base e 3 vereditos, encerra com a resposta da terceira tentativa marcada `partial: true`, e nunca faz uma quarta chamada. Com um crítico mockado cuja saída bruta não bate com `VerdictSchema`, a execução trata como reprovação e segue o mesmo caminho, sem lançar.

- [X] T011 [US2] Implementar o teto de tentativas em `src/agents/reflection.ts`: contar tentativas e, ao atingir `opts.maxReflection ?? 2` sem aprovação, encerrar via `finishRun(trace, runBase.answer, true, metrics)` com a resposta da última tentativa (RF6, RF7, FR-007, FR-008)
- [X] T012 [US2] Implementar o desvio `maxReflection: 0`: `run` devolve `base.run(input)` diretamente, sem chamar o crítico e sem inserir evento `critique` (RF4, FR-015)
- [X] T013 [US2] Envolver a chamada ao crítico (T004/T005) em tratamento de falha do provedor: erro de configuração ou do provedor durante a avaliação vira o mesmo padrão de resposta parcial já usado em `react.ts`/`plan-and-execute.ts` (`describeProviderError`, trace acumulado preservado), conforme RF14 e o edge case correspondente da spec
- [X] T014 [US2] Escrever os testes de `src/agents/reflection.test.ts` para os guardrails: esgotamento do orçamento padrão (3 tentativas, não 4), limite customizado via `opts.maxReflection`, `maxReflection: 0` (zero chamadas ao crítico), veredito malformado tratado como reprovação sem lançar, e falha do crítico virando resposta parcial com trace preservado

**Checkpoint**: as duas user stories P1 completas — a camada de reflexão é segura para uso não supervisionado (custo e tempo sempre limitados).

---

## Phase 5: User Story 3 — Comparar estratégias com e sem revisão automática (Priority: P2)

**Goal**: `reflect:react` e `reflect:plan-and-execute` aparecem no catálogo e podem ser comparadas na arena lado a lado com `react` e `plan-and-execute`, sem qualquer edição em `arena.ts` ou `cli/args.ts`.

**Independent Test**: `npm run arena -- --strategies react,reflect:react "<pedido>"` imprime dois blocos, ambos válidos; `npm run arena -- --strategies reflect:inexistente "x"` continua sendo recusado listando os nomes válidos, agora incluindo os dois novos.

- [X] T015 [US3] Registrar `"reflect:react": withReflection(reactStrategy)` e `"reflect:plan-and-execute": withReflection(planAndExecuteStrategy)` em `src/agents/registry.ts`, ao lado das entradas existentes, conforme `specs/002-reflection-layer/contracts/reflection.md`
- [X] T016 [US3] Validar `npm run typecheck` e que `strategyNames()` passa a listar as quatro chaves em ordem alfabética, sem editar `src/arena.ts` nem `src/cli/args.ts`
- [X] T017 [US3] Validar ao vivo (best-effort, sujeito à cota do OpenRouter) os Cenários 2, 6 e 7 de `specs/002-reflection-layer/quickstart.md`: `reflect:react` sozinho, comparação `react` vs `reflect:react` mostrando diferença de `llmCalls` quando há reprovação, e `reflect:inexistente` recusado

**Checkpoint**: a camada de reflexão é avaliável na prática — todas as três user stories entregues.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: As verificações finais de qualidade, alinhadas ao padrão que a feature 001 já estabeleceu.

- [X] T018 [P] Auditar que o prompt do crítico (T004) nunca inclui `OPENROUTER_API_KEY` nem qualquer segredo — apenas pedido, resposta e observações do trace
- [X] T019 Rodar `npm run typecheck` e `npm test`, e repetir a suíte 10 vezes confirmando resultado idêntico (mesmo padrão de determinismo da feature 001, SC-002/SC-003 desta feature)
- [X] T020 Percorrer o checklist de saída de `specs/002-reflection-layer/quickstart.md` e marcar cada item, documentando explicitamente quais cenários ao vivo não puderam ser executados por falta de cota (se for o caso), sem tratar isso como tarefa incompleta

---

## Dependencies

### Ordem entre fases

```
Phase 1 (Setup)
   ↓
Phase 2 (Foundational)  ← bloqueia tudo
   ↓
Phase 3 (US1 · P1) ──→ Phase 4 (US2 · P1) ──→ Phase 5 (US3 · P2)
                                                      ↓
                                              Phase 6 (Polish)
```

### Dependências entre user stories

- **US1** depende apenas da Fase 2 (tipos, `observationsOf`, `critique`). É o MVP.
- **US2** depende de US1 — estende o mesmo laço com os guardrails; não é uma fatia independente do arquivo, mas é um incremento de comportamento independentemente testável (crítico que sempre reprova vs. crítico que aprova/reprova uma vez).
- **US3** depende de US1 e US2 completas — só faz sentido comparar na arena uma camada de reflexão que já é segura.

### Dependências notáveis dentro das fases

- T003 e T004 dependem de T002; T005 depende de T004.
- T007 depende de T006; T008 e T009 dependem de T007.
- T011 e T012 dependem de T009 (o laço de regeneração precisa existir antes de limitá-lo).
- T013 depende de T004/T005.
- T015 depende de T006–T013 completos (a implementação precisa estar pronta antes de entrar no catálogo).

---

## Parallel Execution Examples

**Fase 2** — T003 e T004 tocam o mesmo arquivo (`reflection.ts`) mas funções distintas sem dependência entre si; ainda assim, por serem o mesmo arquivo, tratar como sequencial evita conflito de edição. Não há paralelismo real nesta feature: quase tudo cai em `reflection.ts`.

**Fase 6** — T018 é independente (é auditoria, não edição de código) e pode rodar em paralelo com a preparação de T019:

```
T018 (auditoria do prompt)  ‖  T019 (typecheck + suíte 10x)
```

---

## Implementation Strategy

### MVP (entrega mínima com valor)

**Fases 1 + 2 + 3 (T001–T010)**. Ao fim, `withReflection` aprova respostas consistentes de primeira e se autocorrige uma vez quando reprovado — o valor central da spec, já demonstrável isoladamente (sem precisar do catálogo nem da arena).

### Incrementos seguintes

1. **+ Fase 4 (T011–T014)**: os guardrails que tornam a camada segura para uso sem supervisão — teto de tentativas, `maxReflection: 0`, veredito malformado, falha do provedor. Sem esta fase, US1 sozinha é um risco operacional (spec User Story 2, "tão fundamental quanto a própria revisão").
2. **+ Fase 5 (T015–T017)**: `reflect:react` e `reflect:plan-and-execute` no catálogo — o que torna a camada avaliável na arena, comparável com as estratégias cruas.
3. **+ Fase 6 (T018–T020)**: auditoria de segredo e determinismo, mesmo padrão de fechamento da feature 001.

### Nota de sequenciamento

Diferente da feature 001, aqui quase todo o trabalho cai em um único arquivo novo (`reflection.ts`) — não há paralelismo real entre tarefas de implementação, só entre implementação e auditoria (Fase 6). US1 e US2 são ambas P1 porque a spec trata o limite de tentativas como tão essencial quanto a revisão em si; a divisão em duas fases existe para permitir testar e validar o laço básico antes de empilhar os guardrails, não porque sejam entregas de valor independentes uma da outra.
