# Implementation Plan: Reflexo de Aprendizado Automático

**Branch**: `009-reflexo-aprendizado` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-reflexo-aprendizado/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Depois de cada resposta do `/chat`, um passo de reflexão (`withStructuredOutput` sobre um schema
`{ hasLearned, fact }`) analisa a última mensagem do usuário e destila, no máximo, um fato durável —
nunca um pedido pontual, nunca informação sensível. Quando há fato, ele é memorizado via
`memoryStore.remember`, disparado sem `await` (fire-and-forget) para nunca atrasar a resposta já
enviada (FR-006). Uma nova tool `forget_preference`, exposta ao agente ReAct/executor, permite ao
usuário pedir para esquecer uma preferência em linguagem natural durante a própria conversa — a tool
usa `recall` para achar a memória candidata e `forget` para removê-la, pedindo esclarecimento ao
modelo quando a descrição for ambígua. Constrói sobre a memória semântica de 008 (remember/recall/
forget já existentes) sem alterar seu contrato.

## Technical Context

**Language/Version**: TypeScript ESM (Node 24 LTS, `strict: true`)

**Primary Dependencies**: `@langchain/core` (`withStructuredOutput`, `tool`), `zod` (schema do
veredito de aprendizado e da tool nova); nenhuma dependência nova além das já usadas em 008
(`@huggingface/transformers` via `MemoryStore`)

**Storage**: mesma tabela `memories` de 008 (SQLite via `node:sqlite`); esta feature não altera o
schema, só como e quando `remember`/`forget` são chamados

**Testing**: `node:test` via `tsx` (`npm test`), com um crítico/refletor mockável (mesmo padrão de
`CriticFn`/`critique` em `src/agents/reflection.ts`) para cobrir a lógica sem chamar um provedor real

**Target Platform**: mesmo servidor HTTP Node existente (sem mudança de plataforma)

**Project Type**: serviço web único (Express) — sem frontend

**Performance Goals**: o aprendizado NUNCA deve atrasar a resposta ao usuário (FR-006) — por isso é
disparado sem `await` após a resposta já ter sido enviada, não soma latência ao orçamento existente
do `/chat`

**Constraints**: a chamada de reflexão é assíncrona e best-effort — falha ou timeout dela nunca
aparece como erro ao usuário nem interrompe a conversa (Assumptions da spec)

**Scale/Scope**: no máximo um fato distilado por troca de mensagem (a mensagem do usuário mais
recente); volume de chamadas de reflexão é 1:1 com respostas do `/chat`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas Explícitas** (`http` → `service` → `store`): o refletor de aprendizado
  (`src/memory/learning-reflector.ts`) é infraestrutura de agente, chamada por `src/http/server.ts`
  (mesmo nível de onde `remember` já é chamado hoje); a tool `forget_preference` fica em
  `src/agents/tools.ts` ao lado das demais tools, recebendo `MemoryStore`/`userId` por injeção, como
  as outras tools recebem `OpsStore`. **PASS**
- **II. Validações na Fronteira**: a saída estruturada do refletor (`{ hasLearned, fact }`) e da tool
  nova são validadas por Zod antes de qualquer gravação — mesmo padrão de `verdictSchema` em
  `reflection.ts`. **PASS**
- **III. Erros são de Domínio**: falha do refletor (provedor indisponível, saída malformada) vira
  "nada aprendido" silencioso, nunca uma exceção que sobe para o usuário (FR-006, Assumptions).
  **PASS**
- **IV. Teste é Parte da Tarefa**: refletor e tool novos recebem teste com crítico/modelo mockado
  (sem chamada de rede real), inclusive os casos de pedido pontual, informação sensível e mistura dos
  dois. **PASS**
- **V. Segurança por Padrão**: a exclusão de informação sensível é reforçada no prompt do refletor;
  nenhum segredo é logado ou persistido — se o refletor decidir (erroneamente) que algo sensível é
  fato durável, isso é um risco de qualidade de prompt, não de segurança de infraestrutura (mesma
  categoria de risco que already existe em qualquer resposta do agente). **PASS**
- **VI. Funções Puras**: a decisão de "o que é pedido pontual vs. fato durável vs. sensível" depende
  do modelo (não é pura), mas a orquestração ao redor dela (chamar refletor, decidir se chama
  `remember`, resolver qual memória `forget`) é isolada em funções pequenas e testáveis com o
  crítico/modelo injetado. **PASS**

Nenhuma violação a justificar em `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/009-reflexo-aprendizado/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── memory/
│   └── learning-reflector.ts       # withStructuredOutput({hasLearned, fact}) + reflectLearning()
│   └── learning-reflector.test.ts
├── agents/
│   └── tools.ts                    # + makeMemoryTools(memoryStore, userId) -> [forget_preference]
│   └── tools.test.ts               # (arquivo já existente; cobre a tool nova)
├── domain/
│   └── strategy.ts                 # StrategyInput ganha userId?/memoryStore? (para a tool nova)
│   └── strategy.test.ts
├── agents/
│   ├── react.ts                    # inclui forget_preference nas tools do agente
│   └── plan-and-execute.ts         # idem, no executorAgent
└── http/
    └── server.ts                   # troca `remember(userId, message)` pela reflexão fire-and-forget
```

**Structure Decision**: continua o projeto único de 008 (sem frontend). O refletor fica em
`src/memory/` ao lado de `embeddings.ts`/`memory-store.ts` (é lógica de memória, não de agente); a
tool nova fica em `src/agents/tools.ts`, mesmo arquivo das demais tools, para reaproveitar
`asToolResult` e o padrão de injeção de dependência já usado por `makeTools(store)`.

## Complexity Tracking

Nenhuma violação da Constitution Check acima — seção não se aplica.
