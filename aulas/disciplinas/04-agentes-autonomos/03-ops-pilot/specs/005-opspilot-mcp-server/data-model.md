# Data Model: Servidor MCP do OpsPilot

Nenhuma entidade de domínio nova é introduzida por este recurso — todas já existem em `src/domain/types.ts` e são apenas expostas através de um novo transporte. Este documento descreve como as entidades existentes aparecem na superfície MCP.

## MCP Tool (conceito de protocolo, não persistido)

| Campo | Tipo | Origem |
|---|---|---|
| `name` | string | Constante: `"list_alerts"`, `"open_incident"` ou `"resolve_incident"` |
| `title` | string | Descrição curta, derivada da `description` já usada em `src/agents/tools.ts` |
| `description` | string | Reaproveitada de `src/agents/tools.ts` (mesmo texto usado pelo agente interno) |
| `inputSchema` | JSON Schema | Derivado do `.shape` do schema Zod correspondente (`listAlertsSchema`, `openIncidentSchema`, `resolveIncidentSchema`) — sem redefinição |

## Alert (existente — `src/domain/types.ts`)

Consultado, não modificado, por `list_alerts`. Campos relevantes já existentes: `id`, `serviceId`, `severity`, `status` (`AlertStatus`: `firing` | `resolved`), demais campos conforme `Alert`.

## Incident (existente — `src/domain/types.ts`)

Criado por `open_incident`, atualizado por `resolve_incident`. Campos relevantes já existentes: `id`, `title`, `serviceId`, `severity` (`Severity`), `status` (`open` | `resolved`).

### Transições de estado (já implementadas em `OpsStore`, apenas expostas)

```text
(inexistente) --openIncident--> open --resolveIncident--> resolved
```

- `openIncident` lança `ServiceNotFoundError` se `serviceId` não existir (traduzido pelo servidor MCP em resultado de erro de domínio, não em exceção não tratada).
- `resolveIncident` lança `IncidentNotFoundError` se `id` não existir, ou `IncidentAlreadyResolvedError` se já estiver `resolved`.

## Contrato de resposta de tool (formato, não entidade)

Toda chamada de tool MCP devolve um resultado com o mesmo formato hoje produzido por `asToolResult` em `src/agents/tools.ts`, serializado como texto dentro do conteúdo da resposta MCP:

```json
{ "ok": true, "data": { /* específico da tool */ } }
```

ou, em caso de erro de domínio:

```json
{ "ok": false, "error": "<mensagem legível>" }
```

Isso garante que o resultado de uma chamada via MCP seja estruturalmente idêntico ao resultado que o agente interno já recebe hoje ao invocar a mesma tool (FR-007, SC-002).
