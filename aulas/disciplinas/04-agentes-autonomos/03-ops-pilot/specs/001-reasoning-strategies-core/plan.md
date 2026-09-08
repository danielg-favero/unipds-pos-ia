# Implementation Plan: Núcleo de Raciocínio (Reasoning Strategies Core)

**Branch**: `001-reasoning-strategies-core` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-reasoning-strategies-core/spec.md`

## Summary

Entregar o núcleo de raciocínio do OpsPilot: um contrato único `ReasoningStrategy` (nome + `run` → resposta, trace tipado, métricas), duas implementações intercambiáveis (ReAct pré-construído do LangGraph e um grafo Plan-and-Execute com planner/executor/replanner), três ferramentas de plantão validadas por Zod sobre um store com estado pré-populado, e um arena de linha de comando que roda uma ou mais estratégias sobre o mesmo pedido e imprime traces e métricas lado a lado.

A decisão técnica central é uma **porta `OpsStore` com dois adaptadores** — em memória e Sequelize/MySQL. Ela resolve a contradição do pedido original ("store in-memory pré-populado" *e* "banco mysql com sequelize"), permite testes determinísticos sem rede (FR-031) e mantém a stack da constitution. As demais decisões — `createReactAgent` deprecado porém sem substituto instalado, contagem de LLM por callback de execução, dupla barreira de iterações — estão em [research.md](research.md), todas verificadas contra o `node_modules` do repositório.

## Technical Context

**Language/Version**: TypeScript 7 (ESM, `strict: true`, `module: NodeNext`) sobre Node 24.16.0

**Primary Dependencies**: `@langchain/langgraph` 1.4.13 (`createReactAgent`, `StateGraph`), `@langchain/core` 1.2.9 (`tool`, callbacks), `@langchain/openai` 1.5.10 (`ChatOpenAI` apontado ao OpenRouter), `zod` 4.4.3, `sequelize` 6.37.8 + `mysql2` 3.24.2

**Storage**: Porta `OpsStore` com adaptador em memória (padrão; testes e arena) e adaptador Sequelize/MySQL (script de seed e `--store mysql`)

**Testing**: `node:test` via `tsx` — `node --import tsx --test src/**/*.test.ts`; testes em `src/<camada>/*.test.ts` (ver R-009)

**Target Platform**: CLI Node 24 em Linux/macOS

**Project Type**: Biblioteca de domínio + CLI (sem HTTP nesta feature)

**Performance Goals**: Não há alvo de throughput. A latência é dominada pelo provedor de modelo e é *medida*, não otimizada (`metrics.latencyMs`)

**Constraints**: `temperature: 0` em todas as chamadas; teto rígido de 8 passos no Plan-and-Execute; testes sem rede e sem banco; nenhuma leitura direta de `.env`; credencial nunca impressa nem no trace

**Scale/Scope**: ~15 módulos novos em `src/`, 5 serviços e 6 alertas de seed, 2 estratégias, 3 ferramentas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como o design atende | Pré-Fase 0 | Pós-Fase 1 |
|-----------|----------------------|:---:|:---:|
| **I. Camadas Explícitas** | `src/arena.ts` e `src/scripts/seed.ts` (cli) → `src/agents/*` (service) → `src/store/*` (store). `src/domain/*` é puro e não importa nada das camadas de cima. Nenhuma dependência invertida. | ✅ | ✅ |
| **II. Validações na Fronteira** | Flags do arena validadas por Zod em `src/arena.ts`; argumentos de ferramenta validados por Zod antes de qualquer efeito (T1); env do modelo validada por Zod em `src/agents/model.ts`. | ✅ | ✅ |
| **III. Erros são de Domínio** | `DomainError` e sete subclasses em `src/domain/errors.ts`; traduzidas em `observation.ok:false` (borda modelo↔ferramenta) e em mensagem + exit code (borda CLI). | ✅ | ✅ |
| **IV. Teste é Parte da Tarefa** | Store e formatação de trace com testes determinísticos (FR-030/031); `typecheck` e `test` como portão do quickstart (Cenário 1). | ✅ | ✅ |
| **V. Segurança por Padrão** | Nenhum módulo lê `.env`; `OPENROUTER_API_KEY` só é lida em um ponto e nunca entra em log, trace ou mensagem de erro (S9, FR-011). Sem secrets no repo. | ✅ | ✅ |
| **VI. Funções Puras** | `formatTrace`, `fromMessages`, os schemas Zod e `seed-data.ts` são puros. O efeito colateral fica confinado aos adaptadores de store e à chamada do modelo. | ✅ | ✅ |

**Resultado**: portão aprovado nas duas avaliações, sem violações. A tabela de Complexity Tracking fica vazia e foi removida.

Um ponto de atenção, não violação: a porta com dois adaptadores é uma indireção a mais que um store único. Justificada porque nenhum adaptador sozinho satisfaz simultaneamente FR-031 (testes sem rede) e a stack MySQL da constitution — ver R-001.

## Project Structure

### Documentation (this feature)

```text
specs/001-reasoning-strategies-core/
├── plan.md              # Este arquivo
├── spec.md              # Especificação (/speckit-specify)
├── research.md          # Fase 0 — 10 decisões técnicas verificadas
├── data-model.md        # Fase 1 — entidades, erros, schema, dados do seed
├── quickstart.md        # Fase 1 — 7 cenários de validação
├── contracts/
│   ├── strategy.md      # ReasoningStrategy, TraceEvent, formatTrace, catálogo
│   ├── tools.md         # Porta OpsStore e as 3 ferramentas
│   └── cli.md           # Flags do arena, script de seed, variáveis de ambiente
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec
└── tasks.md             # Fase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/
├── domain/                    # Puro, sem I/O — não importa de agents/, store/ ou cli
│   ├── types.ts               # Service, Alert, Incident, Severity, AlertStatus, IncidentStatus
│   ├── errors.ts              # DomainError + 7 subclasses
│   ├── strategy.ts            # ReasoningStrategy, TraceEvent, RunMetrics, StrategyInput/Run
│   ├── trace.ts               # formatTrace (pura, determinística)
│   └── trace.test.ts
├── store/
│   ├── port.ts                # interface OpsStore
│   ├── seed-data.ts           # 5 serviços + 6 alertas — fonte única de verdade
│   ├── memory.ts              # MemoryOpsStore (padrão do arena e dos testes)
│   ├── memory.test.ts
│   └── sequelize/
│       ├── connection.ts      # Sequelize a partir de DATABASE_URL / MYSQL_*
│       ├── models.ts          # services, alerts, incidents (InferAttributes)
│       └── store.ts           # SequelizeOpsStore
├── agents/                    # Camada service
│   ├── model.ts               # Fábrica única: OPENROUTER_API_KEY/MODEL, temperature 0
│   ├── metrics.ts             # CallCounter (handleChatModelStart) + cronômetro
│   ├── tools.ts               # makeTools(store): list_alerts, open_incident, resolve_incident
│   ├── from-messages.ts       # BaseMessage[] → TraceEvent[] (pura)
│   ├── from-messages.test.ts
│   ├── react.ts               # Estratégia ReAct sobre createReactAgent
│   ├── plan-and-execute.ts    # StateGraph: planner → executor → replanner
│   └── registry.ts            # Catálogo nomeado de estratégias
├── scripts/
│   └── seed.ts                # npm run seed — idempotente, MySQL
├── arena.ts                   # CLI: --strategies, --max-iterations, --store
└── index.ts                   # Já existe (vazio)
```

**Structure Decision**: Projeto único com as camadas da constitution materializadas em diretórios de `src/`. `domain/` no centro (puro), `store/` como única fronteira de I/O de dados, `agents/` como camada de serviço que orquestra modelo e ferramentas, e `arena.ts`/`scripts/seed.ts` como as duas entradas de CLI. Não há `tests/` separado: os testes ficam ao lado do código em `src/<camada>/*.test.ts`, formato exigido pelo glob do script `test` existente (R-009). `src/index.ts` permanece intocado nesta feature — a API HTTP está fora de escopo.

## Alterações fora de `src/`

Uma única, mínima: adicionar `"seed": "tsx src/scripts/seed.ts"` aos scripts do `package.json` (FR-019). Nenhuma dependência nova é necessária — tudo já está instalado.

## Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| MySQL indisponível na máquina (verificado: porta 3306 fechada) | Cenário 6 do quickstart não roda | Caminho MySQL é opt-in; núcleo e testes usam o store em memória (R-010) |
| Modelo do OpenRouter sem suporte a tool calling | Ambas as estratégias falham | Documentar em `.env.example` que `OPENROUTER_MODEL` precisa suportar function calling; falha aparece como erro claro |
| `createReactAgent` deprecado | Ruído de deprecação hoje, remoção futura | Adaptador de trace isolado em `from-messages.ts`; migração para `createAgent` é troca de uma linha (R-002) |
| Planner devolvendo passos vagos demais para executar | Plan-and-Execute gasta iterações sem avançar | Teto rígido de 8 passos + `answer` parcial explícita (R-007) |
