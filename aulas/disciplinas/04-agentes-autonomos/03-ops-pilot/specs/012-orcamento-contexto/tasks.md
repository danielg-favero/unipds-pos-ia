---

description: "Task list for Orçamento de Contexto por Seção"
---

# Tasks: Orçamento de Contexto por Seção

**Input**: Design documents from `/specs/012-orcamento-contexto/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/context-builder.md, quickstart.md

**Tests**: Incluídos — a constitution do projeto (`.specify/memory/constitution.md`, princípio IV) torna teste obrigatório para toda lógica nova.

**Organization**: Tasks agrupadas por user story (spec.md) para permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tasks incompletas)
- **[Story]**: US1, US2 ou US3, mapeando para spec.md
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único (Node/TypeScript). Novo código em `src/context/context-builder.ts` (+ teste ao lado); estratégias alteradas em `src/agents/react.ts` e `src/agents/plan-and-execute.ts`.

---

## Phase 1: Setup

**Purpose**: Criar os arquivos base do novo módulo

- [X] T001 Criar `src/context/context-builder.ts` vazio com os imports esperados (`ConversationMessage` de `../store/conversation-port.js`, `estimateTokens` de `./tokens.js`) e `src/context/context-builder.test.ts` vazio com `import { describe, it } from "node:test";` seguindo o padrão de `src/context/tokens.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos e constante compartilhados por todas as user stories — nenhuma story pode ser implementada sem isso

**⚠️ CRITICAL**: Bloqueia todas as user stories

- [X] T002 Definir em `src/context/context-builder.ts` os tipos `ContextBudget`, `ScoredMemory`, `PromptBuildInput` e `PromptSections` conforme `data-model.md`
- [X] T003 Definir `export const DEFAULT_CONTEXT_BUDGET: ContextBudget = { summary: 200, history: 1200, memory: 300 }` em `src/context/context-builder.ts`

**Checkpoint**: Tipos e default prontos — user stories podem começar

---

## Phase 3: User Story 1 - Prompt sempre cabe no orçamento configurado (Priority: P1) 🎯 MVP

**Goal**: `buildPromptSections` monta o prompt de qualquer estratégia respeitando um teto por seção (resumo, janela, memória), sem nunca cortar `system`/mensagem atual.

**Independent Test**: Chamar `buildPromptSections` com um `budget` fixo e entradas (resumo, histórico, memórias) maiores que os tetos; verificar que cada seção da saída respeita seu teto e que `systemPrompt`/`request` saem intactos.

### Tests for User Story 1 ⚠️

> Escrever estes testes primeiro, garantir que falham antes da implementação

- [X] T004 [P] [US1] Teste: resumo maior que `budget.summary` é truncado e cabe no teto, em `src/context/context-builder.test.ts`
- [X] T005 [P] [US1] Teste: histórico maior que `budget.history` mantém as mensagens mais recentes (sufixo contíguo, ordem cronológica preservada), em `src/context/context-builder.test.ts`
- [X] T006 [P] [US1] Teste: memórias com tamanho total maior que `budget.memory` mantêm as de maior `score`, em `src/context/context-builder.test.ts`
- [X] T007 [P] [US1] Teste: `systemPrompt` e `request` saem idênticos à entrada mesmo com `budget = { summary: 0, history: 0, memory: 0 }`, em `src/context/context-builder.test.ts`
- [X] T008 [P] [US1] Teste: entradas vazias (sem resumo, sem histórico, sem memórias) produzem `PromptSections` válido sem erro, em `src/context/context-builder.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Implementar corte de resumo (truncamento por `estimateTokens`, mantém o início) como função interna em `src/context/context-builder.ts` (depende de T002)
- [X] T010 [US1] Implementar corte de janela de histórico (remove mensagens mais antigas primeiro até caber em `budget.history`) como função interna em `src/context/context-builder.ts` (depende de T002)
- [X] T011 [US1] Implementar corte de memórias (ordena por `score` decrescente, inclui até estourar `budget.memory`) como função interna em `src/context/context-builder.ts` (depende de T002)
- [X] T012 [US1] Implementar `export function buildPromptSections(input: PromptBuildInput): PromptSections` compondo T009-T011, preservando `systemPrompt`/`request` sem alteração, em `src/context/context-builder.ts` (depende de T009, T010, T011)
- [X] T013 [US1] Substituir a montagem manual de `initialMessages`/`memoryMessage`/`summaryMessage` em `src/agents/react.ts` por uma chamada a `buildPromptSections`, mantendo o formato de mensagem `{ role, content }` já usado (depende de T012)
- [X] T014 [US1] Substituir a montagem manual de `memoryBlock`/`historyBlock`/`contextBlock` em `src/agents/plan-and-execute.ts` por uma chamada a `buildPromptSections`, mantendo o formato de texto concatenado já usado (depende de T012)

**Checkpoint**: `buildPromptSections` funcional e integrado às duas estratégias — MVP entregável e testável isoladamente

---

## Phase 4: User Story 2 - Corte na ordem correta sob tetos agressivos (Priority: P1)

**Goal**: Sob tetos extremamente baixos, o corte é determinístico e previsível — sem erros, sem ambiguidade de ordem.

**Independent Test**: Configurar tetos menores que uma única mensagem/memória e verificar que a seção é omitida sem lançar erro; configurar memórias com score empatado e verificar desempate estável.

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] Teste: `budget.history` menor que o tamanho de qualquer mensagem individual resulta em `history: []`, sem lançar, em `src/context/context-builder.test.ts`
- [X] T016 [P] [US2] Teste: `budget.memory` menor que o tamanho de qualquer memória individual resulta em `memories: []`, sem lançar, em `src/context/context-builder.test.ts`
- [X] T017 [P] [US2] Teste: duas memórias com o mesmo `score` — a que aparece primeiro em `input.memories` é preservada quando só uma cabe no teto (desempate estável), em `src/context/context-builder.test.ts`
- [X] T018 [P] [US2] Teste: resultado é idêntico em duas chamadas repetidas com a mesma entrada e o mesmo `budget` (determinismo), em `src/context/context-builder.test.ts`

### Implementation for User Story 2

- [X] T019 [US2] Revisar as funções de corte de T010/T011 para garantir que um item que sozinho já excede o teto restante é descartado (não incluído parcialmente) e que o `sort` de memórias usa comparação estável por score decrescente sem critério de desempate adicional, em `src/context/context-builder.ts` (depende de T010, T011)

**Checkpoint**: Corte determinístico e seguro sob qualquer teto, incluindo extremos — validado por testes de estresse

---

## Phase 5: User Story 3 - Configuração dos tetos via variáveis de ambiente (Priority: P2)

**Goal**: Operador ajusta os tetos por ambiente via `CONTEXT_BUDGET_SUMMARY`/`_HISTORY`/`_MEMORY`, sem alterar código.

**Independent Test**: Chamar `readBudgetFromEnv` com um objeto `env` simulado contendo valores customizados, ausentes e inválidos, e verificar o `ContextBudget` resultante em cada caso.

### Tests for User Story 3 ⚠️

- [X] T020 [P] [US3] Teste: `readBudgetFromEnv({})` retorna `DEFAULT_CONTEXT_BUDGET` (200/1200/300), em `src/context/context-builder.test.ts`
- [X] T021 [P] [US3] Teste: `readBudgetFromEnv` com `CONTEXT_BUDGET_SUMMARY`/`_HISTORY`/`_MEMORY` numéricos válidos retorna exatamente esses valores, em `src/context/context-builder.test.ts`
- [X] T022 [P] [US3] Teste: `readBudgetFromEnv` com valor não numérico ou negativo em qualquer uma das três variáveis cai no default correspondente, mantendo as outras customizadas, em `src/context/context-builder.test.ts`

### Implementation for User Story 3

- [X] T023 [US3] Implementar `export function readBudgetFromEnv(env: NodeJS.ProcessEnv = process.env): ContextBudget` em `src/context/context-builder.ts`, usando `DEFAULT_CONTEXT_BUDGET` como fallback por campo (depende de T003)
- [X] T024 [US3] Tornar `input.budget` opcional em `buildPromptSections`, usando `readBudgetFromEnv()` quando omitido, em `src/context/context-builder.ts` (depende de T012, T023)
- [X] T025 [US3] Atualizar as chamadas a `buildPromptSections` em `src/agents/react.ts` e `src/agents/plan-and-execute.ts` para não passar `budget` explícito (usam o default via env), em `src/agents/react.ts` e `src/agents/plan-and-execute.ts` (depende de T013, T014, T024)

**Checkpoint**: Todas as três user stories funcionais — tetos configuráveis por ambiente, com defaults corretos

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validação final e garantias de regressão

- [X] T026 [P] Rodar `npx tsx --test src/agents/react.test.ts` e `npx tsx --test src/agents/plan-and-execute.test.ts` e confirmar que nenhum teste existente quebrou com a integração do builder
- [X] T027 Rodar `npm run typecheck && npm test` na raiz do projeto e confirmar suíte completa verde (constitution, princípio IV)
- [X] T028 Executar os passos de `specs/012-orcamento-contexto/quickstart.md` manualmente para validar end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — bloqueia todas as user stories
- **User Story 1 (Phase 3)**: depende do Foundational — nenhuma dependência de outra story
- **User Story 2 (Phase 4)**: depende do Foundational; T019 refina as funções de corte criadas em T010/T011 (US1) — sequencial após US1 na prática, mas testável de forma independente
- **User Story 3 (Phase 5)**: depende do Foundational; T024/T025 dependem de `buildPromptSections` (T012, US1) já existir
- **Polish (Phase 6)**: depende de todas as stories desejadas estarem completas

### Within Each User Story

- Testes antes da implementação (devem falhar primeiro)
- Funções de corte internas antes de `buildPromptSections`
- `buildPromptSections` antes da integração em `react.ts`/`plan-and-execute.ts`

### Parallel Opportunities

- T004-T008 (testes US1) podem rodar em paralelo entre si (mesmo arquivo de teste, mas casos independentes — marcar [P] apenas se o ambiente de execução de tarefas permitir edição concorrente segura; caso contrário, tratar como uma sequência rápida no mesmo arquivo)
- T015-T018 (testes US2) e T020-T022 (testes US3), mesma observação acima
- T013 (react.ts) e T014 (plan-and-execute.ts) podem ser feitas em paralelo por serem arquivos diferentes, ambas dependendo apenas de T012

---

## Parallel Example: User Story 1

```bash
# Testes de US1 (mesmo arquivo de teste, casos independentes):
Task: "Teste: resumo truncado ao teto em src/context/context-builder.test.ts"
Task: "Teste: histórico cortado mantendo mais recentes em src/context/context-builder.test.ts"
Task: "Teste: memórias cortadas por maior score em src/context/context-builder.test.ts"

# Integração nas duas estratégias, arquivos diferentes:
Task: "Integrar buildPromptSections em src/agents/react.ts"
Task: "Integrar buildPromptSections em src/agents/plan-and-execute.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational
3. Completar Phase 3: User Story 1 — `buildPromptSections` funcional, integrado a `react.ts` e `plan-and-execute.ts`, com teto padrão hardcoded (sem env ainda)
4. **Parar e validar**: testar US1 isoladamente (T004-T008 passando, T026 sem regressão)

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → MVP: prompts respeitam teto (com defaults fixos) → validar
3. US2 → hardening: corte determinístico sob tetos extremos → validar
4. US3 → configuração via env → validar
5. Polish → suíte completa + quickstart

## Notes

- [P] = arquivos diferentes ou casos de teste independentes sem dependência entre si
- Cada task de teste deve falhar antes da implementação correspondente (T004-T008 antes de T009-T012; T015-T018 antes de T019; T020-T022 antes de T023)
- Comitar após cada task ou grupo lógico, conforme constitution ("cada tarefa cabe em um commit")
