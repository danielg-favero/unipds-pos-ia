# Implementation Plan: Medição de Consumo de Contexto

**Branch**: `010-medicao-contexto` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-medicao-contexto/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`src/context/tokens.ts` ganha `estimateTokens(text)` (chars/4, determinístico e sem dependência de
tokenizador) e um extrator de uso real de tokens a partir da resposta do LangChain
(`AIMessage.usage_metadata.input_tokens`, o campo padrão do `@langchain/core` para qualquer chat
model). `RunMetrics` (`src/domain/strategy.ts`) ganha `promptTokensReal?: number` (soma do uso real
de todas as chamadas da interação; `undefined` quando o provedor nunca reporta) e
`contextBreakdown: ContextBreakdown` (estimativa sempre presente, por histórico/memórias/instruções
fixas/mensagem atual). `RunTracker`/`CallCounter` (`src/agents/metrics.ts`) acumulam o uso real via
`handleLLMEnd`; cada estratégia (`react.ts`, `plan-and-execute.ts`, `reflection.ts`) monta o
`contextBreakdown` com `estimateTokens` sobre as fontes que já tem em mãos. Puramente observabilidade
— nenhuma mudança de comportamento de resposta do `/chat`.

## Technical Context

**Language/Version**: TypeScript ESM (Node 24 LTS, `strict: true`)

**Primary Dependencies**: `@langchain/core` (tipos `LLMResult`/`AIMessage`/`UsageMetadata`, já
transitivo via `@langchain/openai`); nenhuma dependência nova

**Storage**: N/A — métricas são calculadas por interação e devolvidas na resposta do `/chat`, sem
persistência

**Testing**: `node:test` via `tsx` (`npm test`), com `LLMResult`/`AIMessage` de exemplo construídos à
mão (sem chamar um provedor real) para testar o extrator de uso real e o acumulador

**Target Platform**: mesmo servidor HTTP Node existente

**Project Type**: serviço web único (Express) — sem frontend

**Performance Goals**: `estimateTokens` é `O(n)` no tamanho do texto (uma divisão inteira sobre o
comprimento) — custo desprezível por requisição

**Constraints**: a extração do uso real nunca deve lançar nem bloquear a resposta (FR-005/FR-006) —
provedor sem `usage_metadata` é um caminho normal, não uma falha

**Scale/Scope**: uma decomposição por interação, com no mínimo 4 fontes fixas (histórico, memórias,
instruções fixas do assistente, mensagem atual); soma de uso real cobre todas as chamadas de uma
mesma interação (incluindo `reflect:*`, que roda o crítico + possíveis regenerações)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas Explícitas**: `src/context/tokens.ts` é utilitário puro, sem I/O, usado pelas
  estratégias (`src/agents/*`); `src/http/server.ts` apenas repassa `RunMetrics` (já faz isso hoje) —
  nenhuma camada nova cruzando `http` → `service` → `store`. **PASS**
- **II. Validações na Fronteira**: não há entrada externa nova nesta feature (é observabilidade de
  saída); nada a validar com Zod além do que já existe. **PASS**
- **III. Erros são de Domínio**: ausência de uso real de tokens não é erro — é um estado normal
  representado por `promptTokensReal: undefined` (FR-005), nunca uma exceção. **PASS**
- **IV. Teste é Parte da Tarefa**: `estimateTokens`, o extrator de uso real, o acumulador em
  `RunTracker`, e o `contextBreakdown` de cada estratégia recebem teste determinístico (sem rede).
  **PASS**
- **V. Segurança por Padrão**: nenhum dado novo exposto além de contagens numéricas; nenhum texto de
  fontes (histórico, memórias) é incluído na resposta, só o tamanho estimado. **PASS**
- **VI. Funções Puras**: `estimateTokens` e o extrator de uso real de uma `LLMResult` são funções
  puras; o único estado (acumulação por interação) fica isolado no `RunTracker`, já existente e já
  isolado por execução (regra de que ele nunca é reaproveitado entre execuções). **PASS**

Nenhuma violação a justificar em `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/010-medicao-contexto/
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
├── context/
│   ├── tokens.ts                # estimateTokens(text), extractPromptTokens(LLMResult), ContextBreakdown
│   └── tokens.test.ts
├── agents/
│   ├── metrics.ts                # RunTracker/CallCounter acumulam uso real via handleLLMEnd
│   ├── metrics.test.ts
│   ├── react.ts                  # monta contextBreakdown com estimateTokens
│   ├── plan-and-execute.ts       # idem
│   └── reflection.ts             # soma promptTokensReal entre tentativas; repassa contextBreakdown
└── domain/
    └── strategy.ts                # RunMetrics ganha promptTokensReal?/contextBreakdown
```

**Structure Decision**: projeto único (sem frontend), continuação de 006/008/009. `src/context/`
é um módulo novo e isolado (paralelo a `src/memory/`) por ser puro e reutilizável por qualquer
estratégia; a integração de fato acontece dentro de `src/agents/` (onde `RunTracker` e cada
estratégia já vivem) e em `src/domain/strategy.ts` (contrato de `RunMetrics`). `src/http/server.ts`
não muda: já repassa `result.metrics` inteiro na resposta do `/chat`.

## Complexity Tracking

Nenhuma violação da Constitution Check acima — seção não se aplica.
