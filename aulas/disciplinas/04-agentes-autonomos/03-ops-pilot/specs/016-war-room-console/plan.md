# Implementation Plan: War Room Console

**Branch**: `016-war-room-console` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-war-room-console/spec.md`

## Summary

Nova aplicação web (`web/`, Vite + React + TS) que consome `POST /chat` do OpsPilot: envia mensagens,
renderiza o `trace` tipado já retornado hoje sob um botão "ver raciocínio", e trata uma ação pendente de
aprovação como um cartão aprovar/negar. Como o backend hoje não tem noção de "ação pendente de aprovação"
(FR-008–FR-011), nem CORS, nem caminho de base (FR-016, FR-018), o plano inclui uma extensão mínima e
retrocompatível do backend: um mecanismo de aprovação humana para `open_incident`/`resolve_incident`
exposto via HTTP 202 + endpoint de decisão, CORS configurável, e montagem do servidor sob `/opspilot`.

## Technical Context

**Language/Version**: TypeScript 5 (ESM, `strict: true`) em todo o repo — backend (Node 24 LTS) e frontend (browser via Vite)

**Primary Dependencies**: Backend: Express 5, Zod 4 (já em uso). Frontend novo: React 18, Vite, `fetch` nativo para HTTP — sem cliente HTTP externo (evitar dependência extra para uma API pequena e já tipada)

**Storage**: SQLite via `node:sqlite` (já em uso, `OpsStore`); ações pendentes de aprovação são persistidas na mesma store para sobreviver a reload (spec: edge case "ação pendente ainda visível após reload")

**Testing**: Backend: `node:test` via `tsx` (`npm test`), mantendo o padrão do projeto. Frontend: Vitest + Testing Library (mesmo executor de build do Vite, evita configurar um segundo bundler de teste)

**Target Platform**: Backend: servidor Node HTTP (já existente). Frontend: navegador moderno (última versão de Chrome/Firefox/Safari), servido como SPA estática

**Project Type**: Web application (frontend `web/` + backend `src/` existente)

**Performance Goals**: Sem meta de throughput nova — herda o timeout de 180s já existente em `/chat` (SC-001: primeira resposta em <1min corresponde à UX, não à latência do modelo, que está fora de controle desta feature)

**Constraints**: Interface usável totalmente por teclado e com contraste AA em claro/escuro (design instructions, FR-017, SC-006); nenhuma duplicação/perda de decisão de aprovação sob falha de rede (SC-005) → decisão enviada de forma idempotente

**Scale/Scope**: Uso interno por poucos operadores simultâneos por instância; sem requisito de escala além do que o backend Express já atende

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como este plano cumpre |
|---|---|
| I. Camadas Explícitas | Backend: rota HTTP chama serviço de aprovação → `OpsStore`; nenhuma lógica de domínio na rota. Frontend: componentes de UI não fazem parsing de contrato — um módulo `api/` único encapsula `fetch` e tipagem das respostas. |
| II. Validações na Fronteira | Novo corpo de `POST /chat/:requestId/decision` validado com Zod, seguindo o padrão de `schemas.ts`. Frontend valida a URL da API antes de persistir (FR-013). |
| III. Erros são de Domínio | Incidente inexistente/já resolvido continua usando os erros de domínio já existentes (`errorMessage`, etc.); decisão duplicada/expirada vira um novo erro de domínio (`ApprovalNotPendingError`) traduzido para 409 na borda. |
| IV. Teste é Parte da Tarefa | Toda rota nova e todo componente de UI com lógica (envio de mensagem, render do trace, cartão de decisão, validação de URL) ganha teste antes de fechar a tarefa; `typecheck`/`test` verdes nos dois projetos. |
| V. Segurança por Padrão | CORS é allow-list explícita (origem configurável via env, não `*` sob credenciais), não introduz segredos no `web/` (a URL da API é a única config, guardada no navegador do operador). A aprovação humana é justamente o guardrail que falta hoje para `open_incident`/`resolve_incident`. |
| VI. Funções Puras | Formatação do trace tipado em texto/estrutura de UI e validação de URL são funções puras, testáveis sem DOM. |

Nenhuma violação; nada a registrar em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/016-war-room-console/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/                              # backend existente (OpsPilot) — alterações pontuais
├── domain/
│   └── approval.ts               # NOVO: tipos/erros de "ação pendente de aprovação"
├── store/
│   └── port.ts                   # + métodos de aprovação na OpsStore (create/get/decide)
│   └── sqlite/sqlite-ops-store.ts
└── http/
    ├── server.ts                 # + rota POST /chat/:requestId/decision, CORS, mount em /opspilot
    └── schemas.ts                # + decisionRequestSchema

web/                               # NOVO: War Room Console
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── app.tsx
│   ├── api/
│   │   └── ops-pilot-client.ts   # fetch tipado para /chat e /chat/:id/decision
│   ├── config/
│   │   └── api-settings.ts       # leitura/escrita da URL da API (persistida no navegador)
│   ├── chat/
│   │   ├── chat-view.tsx
│   │   ├── message-list.tsx
│   │   └── message-composer.tsx
│   ├── trace/
│   │   ├── trace-panel.tsx
│   │   └── trace-event.tsx       # render por tipo de TraceEvent (thought/plan/action/...)
│   ├── approval/
│   │   └── approval-card.tsx
│   └── settings/
│       └── settings-panel.tsx    # engrenagem → URL da API
└── tests/
    ├── api/
    ├── trace/
    └── approval/
```

**Structure Decision**: Web application (Opção 2 do template) — backend em `src/` (já existente,
alterado de forma mínima e aditiva) e frontend novo em `web/`, na raiz do repositório, como projeto Vite
independente com seu próprio `package.json`/`tsconfig` (evita acoplar o build do browser ao `tsconfig.json`
Node ESM do backend).
