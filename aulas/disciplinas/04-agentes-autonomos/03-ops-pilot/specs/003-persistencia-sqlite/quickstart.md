# Quickstart: validar a persistência SQLite

Pré-requisitos: dependências instaladas (`npm install`), Node 24 LTS.

## 1. Rodar a suíte automatizada (cobre `:memory:` fim a fim)

```bash
npm run typecheck
npm test
```

Esperado: testes de `src/store/sqlite/*.test.ts` passam sobre `DatabaseSync(":memory:")`, incluindo
seed idempotente, abrir/listar/resolver incidentes, filtros de `listIncidents` e violação de
`CHECK`. Testes de `src/agents/tools.test.ts` continuam passando, agora também exercitados sobre
`SqliteOpsStore(":memory:")`.

## 2. Validar persistência real entre reinícios

```bash
rm -f ./data/opspilot.db   # ambiente limpo
OPSPILOT_DB=./data/opspilot.db npm run arena -- --store sqlite \
  "abra um incidente sev2 para checkout-api chamado 'fila travada'"
```

Confirma no output que o incidente foi criado. Depois:

```bash
OPSPILOT_DB=./data/opspilot.db npm run arena -- --store sqlite \
  "liste os incidentes abertos"
```

Esperado (User Story 1 / SC-001): o incidente criado na chamada anterior aparece, mesmo em um
processo novo do arena — prova que os dados sobreviveram ao "reinício".

## 3. Validar seed idempotente do cenário Mercadinho (User Story 4 / SC-004, SC-005)

```bash
rm -f ./data/opspilot.db
OPSPILOT_DB=./data/opspilot.db npm run arena -- --store sqlite "quantos serviços existem?"
# esperado: 5 serviços, 6 alertas (3 firing / 3 resolved)

OPSPILOT_DB=./data/opspilot.db npm run arena -- --store sqlite "quantos serviços existem?"
# repetir: mesma contagem — sem duplicação
```

## 4. Validar `consultar_runbook` (User Story 3 / SC-003)

```bash
OPSPILOT_DB=./data/opspilot.db npm run arena -- --store sqlite \
  "qual o runbook do checkout-api?"
# esperado: conteúdo do runbook

OPSPILOT_DB=./data/opspilot.db npm run arena -- --store sqlite \
  "qual o runbook do search-indexer?"
# esperado: aviso claro de que não há runbook cadastrado, sem erro
```

## 5. Bench continua reproduzível sobre `MemoryOpsStore`

```bash
npm run bench
```

Esperado: nenhuma mudança de comportamento — o bench (`src/bench/scenarios.ts`) roda sobre
`MemoryOpsStore`, sem tocar `./data/opspilot.db`.
