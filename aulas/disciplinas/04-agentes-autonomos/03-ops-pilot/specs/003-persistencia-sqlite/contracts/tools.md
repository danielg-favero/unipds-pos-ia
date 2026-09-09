# Contract: Tools do agente (`src/agents/tools.ts`)

Interface exposta ao modelo via `@langchain/core/tools`. Duas tools novas; as três existentes
(`list_alerts`, `open_incident`, `resolve_incident`) mantêm nome e schema, apenas com descrições
revisadas pelas 6 regras do projeto (clareza de quando usar, `.describe()` por campo, enums
explícitos).

## `list_incidents` (nova)

**Schema Zod**:

```ts
export const listIncidentsSchema = z.object({
  status: z
    .enum(["open", "resolved", "all"])
    .default("open")
    .describe(
      "Filtro de status do incidente: 'open' (abertos, padrão), 'resolved' (resolvidos) ou 'all' (todos).",
    ),
});
```

**Descrição da tool**: "Lista incidentes registrados. Use quando o plantonista perguntar quais
incidentes existem, o histórico de um turno, ou pedir para conferir o que já foi aberto/resolvido.
Sem `status`, devolve apenas os abertos."

**Saída (`ok: true`)**: `{ incidents: Incident[] }`, cada `Incident` incluindo `resolvedAt` e
`summary` (ambos `null` quando aberto).

**Erros**: nenhum erro de domínio esperado (lista vazia é um resultado válido, não uma falha).

## `consultar_runbook` (nova)

**Schema Zod**:

```ts
export const consultarRunbookSchema = z.object({
  service: z
    .string()
    .min(1)
    .describe("Identificador do serviço cadastrado (ex.: 'checkout-api') cujo runbook será consultado."),
});
```

**Descrição da tool**: "Devolve o runbook (passos de resposta recomendados) de um serviço. Use
quando o plantonista precisar saber como agir diante de um alerta ou incidente de um serviço
específico. Se o serviço não tiver runbook cadastrado, avisa isso em vez de falhar."

**Saída (`ok: true`)**:
- Runbook existe: `{ serviceId: string, content: string }`
- Runbook não cadastrado: `{ serviceId: string, content: null }` (a tool nunca lança erro só por
  ausência de runbook — FR-006)

**Erros (`ok: false`)**: `ServiceNotFoundError` quando `service` não corresponde a nenhum serviço
cadastrado (FR-007).

## Revisão das tools existentes (dívida do pedido)

- `open_incident`: descrição **MUST** deixar explícito quando usar (alerta que exige ação de
  plantão) e o que acontece se o serviço não existir (erro de domínio, não falha silenciosa);
  `title`, `service`, `severity` ganham `.describe()` individual; `severity` já é `z.enum(SEVERITIES)`
  — descrição **MUST** citar os valores válidos por extenso para o modelo não precisar adivinhar.
- `list_alerts`: `status` já é enum `firing | resolved | all` — adicionar `.describe()` no campo
  (hoje só a description da tool cita os valores).
- `resolve_incident`: `id` ganha `.describe()`; descrição da tool já cobre os dois erros possíveis,
  mantém.

## Contrato de erro (inalterado)

Toda tool serializa o resultado via `asToolResult`: sucesso vira `{ ok: true, data }`, erro de
domínio vira `{ ok: false, error: string }` (nunca lança para fora do `tool()`), erro não-domínio
continua propagando (comportamento já existente, preservado).
