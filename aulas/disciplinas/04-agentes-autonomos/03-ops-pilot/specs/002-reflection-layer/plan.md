# Implementation Plan: Camada de Reflexão (Self-Critique)

**Branch**: `002-reflection-layer` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-reflection-layer/spec.md`

## Summary

Adicionar `withReflection(strategy, opts)` — um decorator puro que envolve qualquer `ReasoningStrategy` já existente com uma passagem de autocrítica: executa a base, um crítico (mesmo modelo, saída estruturada `{ approved, feedback }`) avalia a resposta contra as observações do trace, e se reprovar, regenera a partir do feedback, até aprovar ou esgotar `maxReflection` (padrão 2). Registrado no catálogo como `reflect:react` e `reflect:plan-and-execute`, ao lado das estratégias originais — sem tocar `react.ts`, `plan-and-execute.ts` ou `arena.ts`.

A decisão central (R-001, R-002) é reaproveitar 100% do que a feature 001 já construiu: o mesmo contrato `ReasoningStrategy`, o mesmo tipo `TraceEvent` (o veredito vai no evento `critique` já existente, com o resultado codificado no prefixo do texto), a mesma fábrica de modelo, o mesmo `RunTracker`/`CallCounter`, e o mesmo padrão "sem retry" que a feature 001 já validou e documentou (a causa de saída estruturada vazia era cota do OpenRouter, não ruído — retry mascarava isso). Nada nesta feature introduz uma nova estratégia de raciocínio, uma nova ferramenta, ou uma nova forma de armazenamento.

## Technical Context

**Language/Version**: TypeScript 7 (ESM, `strict: true`, `module: NodeNext`) sobre Node 24 — igual à feature 001, sem mudança

**Primary Dependencies**: Nenhuma nova. Reaproveita `@langchain/core` (`withStructuredOutput`, `BaseCallbackHandler`), `zod` e o próprio código de `src/agents/` e `src/domain/` da feature 001

**Storage**: Nenhuma nova. `withReflection` recebe o `OpsStore` já resolvido pelo `StrategyInput` e o repassa intacto a cada tentativa da base — não decide qual adaptador usar

**Testing**: `node:test` via `tsx`, mesmo padrão da feature 001 — `src/agents/reflection.test.ts`, com um crítico mockado por injeção de dependência (ver R-003/RF13) para que a suíte permaneça determinística e sem rede (FR herdado de 001: SC-007)

**Target Platform**: CLI Node 24 — sem mudança

**Project Type**: Extensão de biblioteca de domínio + CLI existente (sem HTTP, sem nova superfície de infraestrutura)

**Performance Goals**: Nenhum alvo novo. `metrics.latencyMs` e `metrics.llmCalls` continuam sendo *medidos*, agora somando o custo das tentativas extras (FR-010) — o próprio propósito da feature é tornar esse custo visível para decisão do avaliador (SC-004), não minimizá-lo

**Constraints**: `maxReflection` finito (padrão 2, FR-007); nenhuma tentativa além do orçamento (SC-003); nenhuma execução perde trace ou métricas mesmo esgotando o orçamento (SC-002); `withReflection` não modifica a estratégia envolvida (SC-005); zero dependência nova

**Scale/Scope**: 1 módulo novo (`src/agents/reflection.ts` + teste), 1 edição em `src/agents/registry.ts` (duas entradas novas no catálogo), zero edição em `react.ts`, `plan-and-execute.ts`, `arena.ts`, `cli/args.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como o design atende | Pré-Fase 0 | Pós-Fase 1 |
|-----------|----------------------|:---:|:---:|
| **I. Camadas Explícitas** | `withReflection` vive em `src/agents/` (service), como `react.ts` e `plan-and-execute.ts`. Não importa de `store/` diretamente — recebe o `OpsStore` já resolvido via `StrategyInput`, repassado intacto às tentativas da base. Nenhuma dependência nova entre camadas. | ✅ | ✅ |
| **II. Validações na Fronteira** | A saída do crítico é validada por Zod (`VerdictSchema`) antes de virar `Verdict` de domínio; um veredito que falha a validação vira reprovação com feedback genérico (RF13), nunca é usado cru. | ✅ | ✅ |
| **III. Erros são de Domínio** | Falha do provedor durante a chamada ao crítico é tratada com o mesmo padrão já usado em `react.ts`/`plan-and-execute.ts` (`describeProviderError`, trace parcial preservado) — nenhuma exceção nova escapa de `run`. | ✅ | ✅ |
| **IV. Teste é Parte da Tarefa** | `src/agents/reflection.test.ts` cobre as 5 obrigações centrais (aprovação de primeira, reprovação→aprovação, esgotamento, `maxReflection: 0`, veredito malformado) com um crítico mockado — determinístico, sem rede, alinhado ao Cenário 1 do quickstart. | ✅ | ✅ |
| **V. Segurança por Padrão** | Nenhuma leitura nova de `.env`; a credencial continua fluindo só pela fábrica única (`createModel`) já auditada na feature 001. Nenhum segredo passa a aparecer em `feedback` ou no trace. | ✅ | ✅ |
| **VI. Funções Puras** | `withReflection` é composição pura: recebe uma estratégia, devolve outra, sem estado module-level. O efeito colateral (chamar o modelo, tocar o store) continua isolado dentro de `base.run` e da chamada ao crítico — nada novo migra para fora dessas fronteiras. | ✅ | ✅ |

**Resultado**: portão aprovado nas duas avaliações, sem violações. Tabela de Complexity Tracking vazia — removida.

## Project Structure

### Documentation (this feature)

```text
specs/002-reflection-layer/
├── plan.md              # Este arquivo
├── spec.md              # Especificação (/speckit-specify)
├── research.md          # Fase 0 — 10 decisões (R-001 a R-010)
├── data-model.md         # Fase 1 — tipos novos, fluxo de estado, invariantes RF1–RF6
├── quickstart.md        # Fase 1 — 7 cenários de validação
├── contracts/
│   └── reflection.md    # Assinatura de withReflection, obrigações RF1–RF14, catálogo
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec
└── tasks.md              # Fase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/
├── domain/                    # Inalterado — TraceEvent.critique já existe e é reaproveitado
├── store/                     # Inalterado
├── agents/
│   ├── model.ts                # Inalterado — createModel() reaproveitado pelo crítico
│   ├── metrics.ts               # Inalterado — RunTracker/CallCounter reaproveitados
│   ├── provider-errors.ts       # Inalterado — describeProviderError reaproveitado
│   ├── tools.ts                 # Inalterado
│   ├── from-messages.ts         # Inalterado
│   ├── react.ts                 # Inalterado — envolvido por withReflection, não editado
│   ├── plan-and-execute.ts      # Inalterado — envolvido por withReflection, não editado
│   ├── reflection.ts            # NOVO — withReflection, ReflectionOptions, Verdict, VerdictSchema
│   ├── reflection.test.ts       # NOVO — crítico mockado, cobre RF1–RF14
│   └── registry.ts               # EDITADO — duas entradas novas: reflect:react, reflect:plan-and-execute
├── cli/
│   └── args.ts                  # Inalterado — nenhuma flag nova nesta feature (ver quickstart Cenário 5)
├── scripts/                     # Inalterado
└── arena.ts                     # Inalterado — resolve por nome, já aceita qualquer chave do catálogo
```

**Structure Decision**: Extensão mínima da estrutura já estabelecida pela feature 001 — um arquivo novo na camada `agents/` (mesmo nível de `react.ts`/`plan-and-execute.ts`, mesmo padrão de decorator puro que `finishRun` já demonstra em `domain/strategy.ts`) e uma edição pontual ao catálogo. Nenhum diretório novo, nenhuma camada nova, nenhuma alteração em `arena.ts`/`cli/args.ts` — a prova de que o catálogo é o único ponto de extensão (SC-005) é não precisar tocar neles.

## Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Cota do OpenRouter esgotada durante validação ao vivo (já ocorreu na feature 001) | Cenários 2–4 e 6 do quickstart não são verificáveis ao vivo | A suíte determinística (Cenário 1) com crítico mockado cobre as 5 obrigações centrais sem depender de cota; validação ao vivo é best-effort documentado, não bloqueante |
| Crítico aprovar respostas erradas ou reprovar respostas corretas (qualidade do julgamento, não do código) | Fora do controle desta feature — é comportamento do modelo, não um bug a corrigir | R-005 restringe o contexto do crítico às observações (não ao raciocínio), reduzindo superfície de julgamento subjetivo; fora de escopo medir taxa de acerto do crítico nesta feature |
| `feedback` do crítico vazar informação sensível do trace (improvável, mas o texto é gerado pelo modelo) | Baixo — mesmo risco já presente em qualquer resposta de modelo no sistema | Nenhuma mitigação nova necessária: a auditoria de segredo da feature 001 (grep por `OPENROUTER_API_KEY`) continua válida, pois o crítico nunca recebe a credencial no prompt |
