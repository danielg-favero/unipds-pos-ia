# Implementation Plan: Resiliência do Modelo de Linguagem

**Branch**: `014-resiliencia-modelo` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-resiliencia-modelo/spec.md`

## Summary

Tornar a fábrica de modelo (`src/agents/model.ts`) resiliente a falhas do modelo primário: repetir a chamada automaticamente (retry) no modelo configurado em `OPENROUTER_MODEL` e, se as tentativas se esgotarem, cair para o modelo de reserva configurado em `OPENROUTER_MODEL_FALLBACK` (novo, opcional). A troca é registrada como um `TraceEvent` do tipo `"fallback"` e o modelo efetivamente usado é reportado em `RunMetrics.modelUsed`. Se ambos os modelos falharem, a interação termina em erro claro, tratado na borda, sem vazar credenciais. Abordagem técnica: usar os métodos nativos `.withRetry()` e `.withFallbacks()` do `Runnable` de `@langchain/core`, já disponíveis no `ChatOpenAI` de `@langchain/openai`, evitando lógica de retry/fallback escrita à mão.

## Technical Context

**Language/Version**: TypeScript (ESM, `strict: true`) sobre Node 24 LTS

**Primary Dependencies**: `@langchain/core` (^1.2.9, para `.withRetry()`/`.withFallbacks()` do `Runnable`), `@langchain/openai` (^1.5.10, `ChatOpenAI`), `@langchain/langgraph` (grafo de produção existente), `zod` (validação de env)

**Storage**: N/A (sem persistência nova; feature é puramente de comportamento em runtime)

**Testing**: `node:test` via `tsx` (padrão do repositório), com fakes/stubs de `Runnable`/`ChatOpenAI` para simular falha transitória, falha esgotada e falha total sem chamadas reais ao OpenRouter

**Target Platform**: Servidor Node.js (mesmo runtime do restante do OpsPilot — HTTP server + CLI/MCP)

**Project Type**: Serviço único (backend Node/TypeScript), sem frontend — segue a estrutura "Single project" já existente no repositório

**Performance Goals**: Sem meta de performance nova; a única restrição é não introduzir atraso perceptível em caminho feliz (sem falhas) — o `withRetry`/`withFallbacks` não deve adicionar overhead quando a primeira chamada já ter sucesso

**Constraints**: Número de tentativas de retry deve ser pequeno (poucas, ex. 2–3) para não atrasar demais a resposta ao usuário em caso de falha real; nenhuma credencial (`OPENROUTER_API_KEY`) pode aparecer em eventos de trace, métricas ou mensagens de erro (Princípio V / FR-007)

**Scale/Scope**: Escopo restrito à fábrica de modelo (`src/agents/model.ts`) e aos pontos que produzem a resposta final de uma interação (`react.ts`, `plan-and-execute.ts`, `reflection.ts`, `production-graph.ts`, tipos `TraceEvent`/`RunMetrics` em `domain/strategy.ts`); tarefas de fundo que também usam `createModel()` (sumarização de histórico, reflexão de aprendizado) ficam fora de escopo (ver research.md R5)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Camadas Explícitas | PASS — toda a lógica de resiliência fica encapsulada na fábrica (`model.ts`); estratégias e o roteador continuam apenas invocando o `Runnable` retornado, sem conhecer detalhes de retry/fallback. |
| II. Validações na Fronteira | PASS — `OPENROUTER_MODEL_FALLBACK` é validado com o mesmo padrão Zod já usado para as demais variáveis de ambiente da fábrica. Não há nova entrada externa de usuário nesta feature. |
| III. Erros são de Domínio | PASS — a falha total (US3) propaga um erro que passa pela tradução já existente (`describeProviderError`/`ConfigError`) antes de virar resposta na borda HTTP/CLI. |
| IV. Teste é Parte da Tarefa | PASS (gate a cumprir na implementação) — cada cenário (US1/US2/US3) tem teste correspondente planejado em quickstart.md, usando fakes determinísticos (sem rede real). `typecheck`/`test` devem ficar verdes antes de prosseguir. |
| V. Segurança por Padrão | PASS — FR-007 exige explicitamente que nenhum evento/métrica/erro exponha `OPENROUTER_API_KEY`; validado por teste dedicado no Cenário 3 do quickstart. |
| VI. Funções Puras | PASS — a composição do `Runnable` (retry + fallback) é um efeito isolado dentro da fábrica (já é a camada de infraestrutura que constrói o cliente HTTP do modelo); as estratégias continuam recebendo o `Runnable` pronto, sem novo estado mutável espalhado. |

Nenhuma violação identificada; **Complexity Tracking** não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/014-resiliencia-modelo/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md        # Fase 1 (/speckit-plan)
├── quickstart.md        # Fase 1 (/speckit-plan)
├── contracts/
│   └── model-factory.md # Fase 1 (/speckit-plan)
└── tasks.md             # Fase 2 (/speckit-tasks — não criado por este comando)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── model.ts              # Fábrica: adiciona createResilientModel() (withRetry + withFallbacks)
│   ├── model.test.ts         # NOVO: testes de retry/fallback/falha total (US1/US2/US3)
│   ├── react.ts               # Passa a consumir createResilientModel() para a resposta final
│   ├── plan-and-execute.ts    # Idem
│   ├── reflection.ts          # Idem
│   ├── production-graph.ts    # Emite TraceEvent "fallback" e popula RunMetrics.modelUsed
│   └── provider-errors.ts     # Reaproveitado para sanear mensagem de erro na falha total
├── domain/
│   └── strategy.ts            # Estende TraceEvent com variante "fallback" e RunMetrics com modelUsed
└── memory/
    ├── history-summarizer.ts  # Inalterado (continua usando createModel())
    └── learning-reflector.ts  # Inalterado (continua usando createModel())

tests/ (dentro de src/**/*.test.ts, padrão já usado no repo)
```

**Structure Decision**: Projeto único (backend TypeScript/Node), sem separação frontend/backend. Mudanças concentradas na camada `agents` (fábrica + estratégias) e no tipo compartilhado `domain/strategy.ts`, seguindo o padrão de colocalização de testes (`*.test.ts` ao lado do módulo) já usado no restante do repositório (ex.: `metrics.test.ts`, `reflection.test.ts`).
