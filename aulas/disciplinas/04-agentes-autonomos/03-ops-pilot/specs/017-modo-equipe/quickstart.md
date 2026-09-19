# Quickstart: Validar o Modo Equipe

Pré-requisitos: repo instalado (`npm install`), variáveis de ambiente de modelo (OpenRouter)
configuradas como já exigido pelas demais estratégias, servidor iniciável via o script já existente
do projeto (`src/http/server.ts` / entrypoint `src/index.ts`).

## 1. Rodar os testes unitários do modo equipe

```bash
npx tsx --test src/team/**/*.test.ts
```

**Esperado**: todos os testes passam, cobrindo pelo menos:
- Supervisor alterna entre papéis com base no blackboard acumulado (US1).
- `analista` nunca invoca ferramenta de escrita; `planejador` nunca invoca nenhuma ferramenta;
  `executor` só age via `guardedStore` e respeita `ApprovalRequiredError` (US2).
- Eventos `"handoff"` aparecem na ordem correta no `trace` retornado (US3).
- Execução forçada a atingir o teto de 8 encerra com um `"handoff"` final para `"respond"` e
  `partial: true` (US4).

## 2. Rodar a suíte completa (regressão)

```bash
npm run typecheck
npm test
```

**Esperado**: nenhuma quebra em `src/domain/trace.test.ts` (novo case `"handoff"` coberto),
`src/agents/registry.ts` (novo item `team` presente no catálogo) ou nos testes existentes de
`production-graph`, `approval-guardrail`, `request-trace-store`.

## 3. Validação end-to-end manual (servidor local)

```bash
npm run dev   # ou o script equivalente de start do projeto
```

```bash
curl -s -X POST http://localhost:PORT/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "conversationId": "quickstart-team",
    "message": "Investigue o pico de erros do serviço de pagamentos e proponha uma ação",
    "strategy": "team"
  }' | jq
```

**Esperado**: resposta 200 com `answer` e `requestId`.

```bash
curl -s http://localhost:PORT/requests/<requestId> | jq '.trace[] | select(.type == "handoff")'
```

**Esperado**: pelo menos um evento `{"type":"handoff", "from": ..., "to": ..., "reason": ...}`,
mostrando a transição do supervisor para o primeiro papel acionado, e um evento final de handoff
para `"respond"`.

## 4. Validação visual no War Room Console

```bash
cd web && npm run dev
```

1. Abra o console, inicie uma conversa selecionando o modo equipe (mesmo seletor de estratégia já
   usado para `react`/`plan-and-execute`, com a nova opção `team`).
2. Envie uma pergunta de investigação (ex.: a mesma do passo 3).
3. Abra "ver raciocínio" e confirme que cada handoff aparece como um evento distinto e legível, na
   ordem em que ocorreu (US3, FR-010).

## 5. Cenário de teto de transições (forçar loop)

Para validar FR-011/FR-012/FR-013 manualmente, use um teste com um supervisor fake que sempre
retorna o mesmo `next` (nunca `"respond"`) — ver `src/team/team-graph.test.ts` — e confirme que a
execução para exatamente na 8ª transição, retornando uma resposta final ao invés de travar.
