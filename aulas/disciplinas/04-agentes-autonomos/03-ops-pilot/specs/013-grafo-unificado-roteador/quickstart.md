# Quickstart: Grafo Unificado com Roteamento Automático de Estratégia

Guia para validar manualmente que o roteamento automático e o override funcionam de ponta a ponta,
depois que a feature estiver implementada. Não substitui os testes automatizados de
`production-graph.test.ts` e `server.test.ts` — é a validação de fumaça do comportamento real.

## Pré-requisitos

- `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` configurados no ambiente (ver `src/agents/model.ts`).
- Dependências instaladas (`npm install`).
- Banco SQLite local padrão (`./data/opspilot.db`) ou `OPSPILOT_DB` configurado.

## Subir o servidor

```bash
npm run build   # ou o script equivalente de dev, conforme package.json
node --import tsx src/http/server.ts
# servidor sobe em :3000 (ou PORT definido no ambiente)
```

## Cenário 1 — Roteamento automático (User Story 1 + 2)

```bash
curl -s -X POST http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message": "Qual o status do serviço de pagamentos agora?", "userId": "quickstart-1"}' | jq .
```

**Esperado**:
- HTTP 200.
- `trace[0]` é `{"type":"route","route":"react" (ou outra estratégia-base), "reason":"...", "manual": false}`.
- Existe um evento final `{"type":"answer", ...}`.
- A resposta é coerente com uma consulta direta de status (sinal de que uma estratégia adequada foi
  escolhida).

Repita com um pedido que exija investigação em múltiplos passos, por exemplo:

```bash
curl -s -X POST http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message": "Investigue a causa raiz da degradação registrada hoje e proponha os próximos passos", "userId": "quickstart-1"}' | jq .
```

**Esperado**: `trace[0].route` pode ser diferente do primeiro cenário, refletindo a natureza mais
complexa do pedido (não é uma garantia determinística, mas deve ser plausível ao ler `reason`).

## Cenário 2 — Override manual (User Story 3)

```bash
curl -s -X POST http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message": "Qual o status do serviço de pagamentos agora?", "userId": "quickstart-1", "strategy": "plan-and-execute"}' | jq .
```

**Esperado**:
- HTTP 200.
- `trace[0]` é `{"type":"route","route":"plan-and-execute","reason":"override manual via /chat","manual": true}`.
- A execução de fato usa `plan-and-execute` (deve haver um evento `{"type":"plan", ...}` no trace).

## Cenário 3 — Override com nome inválido (regressão do comportamento existente)

```bash
curl -s -X POST http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message": "teste", "userId": "quickstart-1", "strategy": "estrategia-inexistente"}' | jq .
```

**Esperado**: HTTP 422 com `{"error": "...", "requested": "estrategia-inexistente", "available": [...]}`
— igual ao comportamento já existente hoje.

## Cenário 4 — Combinação com `reflect`

```bash
curl -s -X POST http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message": "Qual o status do serviço de pagamentos agora?", "userId": "quickstart-1", "reflect": true}' | jq .
```

**Esperado**: HTTP 200; trace contém o evento `route` (automático) seguido, eventualmente, de um ou
mais eventos `{"type":"critique", ...}` — confirmando que roteamento automático e autocrítica
continuam combináveis (FR-009).

## Validação automatizada equivalente

```bash
npm test -- production-graph
npm test -- server
npm run typecheck
```

Todos devem passar antes de considerar a feature pronta para revisão.
