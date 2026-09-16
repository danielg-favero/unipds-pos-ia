# Quickstart: Trace Persistido e Logs Estruturados

Valida de ponta a ponta as três histórias de usuário da spec (correlação, inspeção de
etapas, logs operacionais). Ver contrato completo em
[contracts/http-api.md](./contracts/http-api.md) e modelo de dados em
[data-model.md](./data-model.md).

## Pré-requisitos

- Node 24 LTS instalado, dependências do projeto instaladas (`npm install`).
- `OPSPILOT_DB` apontando para um arquivo de teste (ou deixar o default `./data/opspilot.db`).

## Setup

```sh
npm run http
```

Servidor sobe em `:3000` (ou `$PORT`).

## Cenário 1 — US1: correlacionar uma requisição (P1)

```sh
curl -s -D - -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"quais alertas estão abertos?","userId":"u1"}'
```

**Esperado**:
- Header de resposta `X-Request-Id: <uuid>`.
- Corpo da resposta contém `"requestId": "<mesmo uuid>"`.

```sh
curl -s http://localhost:3000/requests/<uuid-capturado>
```

**Esperado**: 200, com `request.id` igual ao `requestId` capturado e `trace` não vazio.

Consulta com id inexistente:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/requests/nao-existe
```

**Esperado**: `404`.

## Cenário 2 — US2: inspecionar etapas internas (P2)

Reusando a resposta do Cenário 1:

```sh
curl -s http://localhost:3000/requests/<uuid-capturado> | jq '.trace[] | {seq, node}'
```

**Esperado**: uma linha por evento do trace, `seq` estritamente crescente a partir de 0, na
mesma ordem em que `trace` aparece no corpo original de `/chat`. Para um evento do tipo
`action`, `event.args` deve estar presente e igual ao que a estratégia produziu.

## Cenário 3 — US3: logs operacionais em tempo real (P3)

```sh
npm run http 2>&1 | tee /tmp/opspilot-http.log &
curl -s -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"quais alertas estão abertos?","userId":"u1"}' > /dev/null
sleep 1
grep '"requestId"' /tmp/opspilot-http.log | tail -5
```

**Esperado**:
- Uma linha JSON por evento do trace dessa requisição.
- Cada linha contém apenas `requestId`, `seq`, `node`, `status`, `ts` — nenhum campo de
  payload completo (`text`, `args`, `result`, `steps`).

## Validação automatizada

```sh
npm run typecheck
npm test
```

Os testes cobrindo estas histórias ficam colocalizados com o código alterado (padrão do
repo), ex. `src/http/server.test.ts`, `src/store/sqlite/*.test.ts`, `src/obs/logger.test.ts`.
