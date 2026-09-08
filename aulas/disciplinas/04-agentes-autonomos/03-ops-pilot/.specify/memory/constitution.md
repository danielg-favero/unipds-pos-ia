# OpsPilot Constitution

## Core Principles

### I. Camadas Explícitas
Dependências fluem `http`/`cli` → `service` → `store`. Domínio não faz I/O.

### II. Validações na Fronteira
Toda entrada externa é validada com Zod antes de virar domínio.

### III. Erros são de Domínio
Falhas previsíveis viram classes de erro, traduzidas em status/saída na borda.

### IV. Teste é Parte da Tarefa (NON-NEGOTIABLE)
Nenhuma lógica nova entra sem teste. `typecheck` e `test` devem estar verdes antes de seguir.

### V. Segurança por Padrão
Sem segredos no repo, nunca ler `.env`. Ações destrutivas passam por guardrails (deny list), não pela confiança no modelo.

### VI. Funções Puras
Funções puras por padrão; efeitos colaterais ficam isolados na camada de store/infra.

## Stack

Node 24 LTS, TypeScript ESM (`strict: true`), Zod, `node:test` via `tsx`, Express com MySQL (Sequelize), LangChain/LangGraph sobre OpenRouter.

## Fluxo de Desenvolvimento

Mudanças relevantes passam por `/specs.specify` → `/plan` → `/task` → `/implement`, com revisão humana entre as fases. Specs devem ser versionadas. Cada tarefa cabe em um commit (pequeno e reversível).

## Governance

Esta constitution é a referência máxima do projeto e supersede outras práticas. Alterações exigem documentação da mudança, aprovação humana e atualização de `specs/constitution.md` em paralelo. Todo PR/spec deve verificar conformidade com estes princípios.

**Version**: 1.0.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-27
