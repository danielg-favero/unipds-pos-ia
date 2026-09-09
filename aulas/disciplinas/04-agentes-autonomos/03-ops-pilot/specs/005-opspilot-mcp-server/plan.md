# Implementation Plan: Servidor MCP do OpsPilot

**Branch**: `005-opspilot-mcp-server` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-opspilot-mcp-server/spec.md`

## Summary

Expor `list_alerts`, `open_incident` e `resolve_incident` como um servidor MCP (`opspilot`) via transporte stdio, reaproveitando diretamente os schemas Zod (`listAlertsSchema`, `openIncidentSchema`, `resolveIncidentSchema`) e as regras de negócio já implementadas em `src/agents/tools.ts` sobre a mesma interface `OpsStore`. Nenhum código de validação ou de acesso a dados é duplicado — o servidor MCP é uma camada de transporte fina sobre o que já existe.

## Technical Context

**Language/Version**: Node 24 LTS, TypeScript ESM (`strict: true`), executado via `tsx`.

**Primary Dependencies**: `@modelcontextprotocol/sdk` (`^1.30.0`, `McpServer` + `StdioServerTransport`), `zod` (já usado pelos schemas existentes).

**Storage**: Mesmo `OpsStore` do restante do sistema (`MemoryOpsStore` por padrão; `SqliteOpsStore` quando `OPSPILOT_DB`/store sqlite estiver configurado) — nenhuma persistência nova.

**Testing**: `node:test` via `tsx --import tsx --test "src/**/*.test.ts"` (padrão do projeto). Teste do servidor conecta um `Client` MCP em memória (`InMemoryTransport` do próprio SDK) ao servidor e valida `listTools()`.

**Target Platform**: Processo Node local, invocado por um cliente MCP via stdio (não exposto em rede).

**Project Type**: Extensão de um CLI/agent existente — novo entrypoint de processo (`src/mcp/server.ts`), sem novo projeto/pacote.

**Performance Goals**: N/A — carga é de um único cliente MCP local por processo; sem requisito de throughput.

**Constraints**: `stdout` do processo é exclusivo do protocolo MCP (JSON-RPC framed); qualquer log/diagnóstico vai para `stderr`. Isso é reforçado tanto por convenção de código (nenhum `console.log`) quanto verificado no teste automatizado.

**Scale/Scope**: 3 ferramentas expostas; reaproveita 100% da validação e lógica de negócio já existente em `src/agents/tools.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Camadas Explícitas (`http`/`cli` → `service` → `store`) | PASS — `src/mcp/server.ts` é uma nova borda de transporte (equivalente a `cli`/`http`), chama as tools existentes (camada de serviço), que chamam `OpsStore`. Nenhuma lógica de negócio nova no servidor. |
| II. Validações na Fronteira (Zod) | PASS — os handlers MCP usam os mesmos schemas Zod já existentes (`listAlertsSchema`, `openIncidentSchema`, `resolveIncidentSchema`), sem redefinição. |
| III. Erros são de Domínio | PASS — `asToolResult` já traduz `DomainError` em um resultado `{ ok: false, error }`; o servidor MCP repassa esse resultado como conteúdo da resposta da ferramenta, sem deixar excecões escaparem para o transporte. |
| IV. Teste é Parte da Tarefa | PASS (gate) — task obrigatória de teste do servidor (`listTools`) faz parte do plano; `typecheck`/`test` devem ficar verdes. |
| V. Segurança por Padrão | PASS — sem segredos novos; stdio local, sem rede; regra crítica de não escrever no stdout é uma requisito funcional (FR-011) com verificação em teste. |
| VI. Funções Puras | PASS — nenhuma função pura nova introduzida; o servidor é fiação (wiring) de I/O sobre as tools existentes. |

Nenhuma violação. Não é necessário preencher "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/005-opspilot-mcp-server/
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
├── agents/
│   ├── tools.ts          # Fonte única de verdade: schemas Zod + makeTools(store) (reaproveitado, não alterado)
│   └── tools.test.ts
├── mcp/                   # NOVO
│   ├── server.ts          # McpServer "opspilot" + StdioServerTransport; regista list_alerts, open_incident, resolve_incident
│   └── server.test.ts     # NOVO: conecta Client MCP em memória, valida listTools()
├── store/
│   ├── port.ts            # OpsStore (reaproveitado)
│   └── memory.ts          # MemoryOpsStore (store padrão do servidor MCP)
└── domain/
    └── errors.ts          # isDomainError/errorMessage (reaproveitado)

package.json               # novo script: "mcp": "tsx src/mcp/server.ts"
```

**Structure Decision**: Novo diretório `src/mcp/` paralelo a `src/agents/` e `src/cli/`, seguindo o padrão de camadas do projeto: `src/mcp/server.ts` é a borda de transporte (equivalente ao `cli`), que consome `makeTools(store)` de `src/agents/tools.ts` (camada de serviço) sem redefinir schemas ou regras. Não há necessidade de estrutura web/mobile — é um único processo CLI-like adicional dentro do mesmo pacote Node existente.

## Complexity Tracking

Nenhuma violação de constitution — seção não aplicável.
