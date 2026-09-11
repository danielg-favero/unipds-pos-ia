# Quickstart: Endpoint HTTP de Chat

## Pré-requisitos

- Node 24 LTS, dependências instaladas (`npm install`).
- Variáveis de ambiente necessárias pelo provedor de modelo (ex.: chave OpenRouter) configuradas em `.env` para uso real; **não são necessárias para os testes de integração**, que usam uma estratégia fake sem rede (ver FR-010).

## Rodar o servidor localmente

```bash
npx tsx --env-file-if-exists=.env src/http/server.ts
```

O servidor deve subir escutando em uma porta (ex.: `PORT` via env, default a combinar na implementação) e usar `SqliteOpsStore` (arquivo padrão `./data/opspilot.db`, ou `OPSPILOT_DB` para outro caminho).

## Exercitar o endpoint manualmente

```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "quais alertas estão disparando?"}' | jq
```

Resultado esperado: 200 com `answer`, `trace` e `metrics` — ver [contracts/post-chat.md](contracts/post-chat.md).

### Escolhendo estratégia e reflexão

```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "abra um incidente para o serviço checkout", "strategy": "plan-and-execute", "reflect": true}' | jq
```

### Casos de erro

```bash
# 400 — corpo inválido (sem message)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" -d '{}'

# 422 — estratégia desconhecida
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" -d '{"message": "oi", "strategy": "nao-existe"}'
```

## Validar via teste de integração (sem rede)

```bash
npm test -- --test-name-pattern="http.*chat"
```

O teste de integração (`src/http/server.test.ts`, a criar na implementação) deve:

1. Construir o app Express via uma função de fábrica que aceita um catálogo de estratégias injetado (não o `registry.ts` de produção), contendo apenas uma estratégia fake determinística (`run()` retorna uma `StrategyRun` fixa, sem chamar modelo/rede).
2. Subir o servidor em uma porta efêmera (`listen(0)`).
3. Fazer requisições reais (`fetch` nativo do Node) para `/chat` cobrindo: sucesso (200) com a estratégia default, sucesso com `strategy`/`reflect` explícitos, 400 (corpo inválido), 422 (estratégia desconhecida) e — com um timeout configurável reduzido para o teste — 504.
4. Não importar `src/agents/model.ts` (que criaria um cliente de modelo real) em nenhum caminho exercitado pelo teste.

Critério de sucesso (ver [spec.md](spec.md), Success Criteria): a suíte inteira roda offline, sem variáveis de ambiente de provedor de modelo configuradas.
