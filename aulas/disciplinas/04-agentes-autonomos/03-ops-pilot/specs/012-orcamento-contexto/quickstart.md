# Quickstart: Orçamento de Contexto por Seção

Guia para validar manualmente que o orçamento por seção está funcionando, após a implementação.

## Pré-requisitos

- Node 24 LTS instalado, dependências do projeto instaladas (`npm install` na raiz do repo).
- Nenhuma credencial de provedor é necessária para os testes automatizados abaixo (o builder é uma função pura, sem chamada de LLM).

## 1. Rodar os testes automatizados da feature

```sh
npx tsx --test src/context/context-builder.test.ts
```

Cenários esperados no teste (conforme `data-model.md` e a spec, US1/US2):

- Resumo maior que `budget.summary` é truncado e cabe no teto.
- Histórico maior que `budget.history` mantém as mensagens mais recentes, remove as mais antigas primeiro.
- Memórias com tamanho total maior que `budget.memory` mantêm as de maior `score`, removem as de menor score primeiro.
- `systemPrompt` e `request` nunca são alterados, mesmo com todos os outros tetos em `0`.
- Teto `0` ou seção vazia omite a seção sem lançar erro.
- Duas memórias com o mesmo score: a que vem primeiro no array de entrada é preservada (desempate estável).

## 2. Validar a leitura das variáveis de ambiente

```sh
# Defaults (sem env definida)
npx tsx --test src/context/context-builder.test.ts

# Tetos customizados
CONTEXT_BUDGET_SUMMARY=50 CONTEXT_BUDGET_HISTORY=100 CONTEXT_BUDGET_MEMORY=20 \
  npx tsx --test src/context/context-builder.test.ts

# Valor inválido cai no default
CONTEXT_BUDGET_HISTORY=not-a-number npx tsx --test src/context/context-builder.test.ts
```

Os testes de `readBudgetFromEnv` recebem o objeto `env` por injeção de dependência (não dependem das variáveis reais do shell) — os comandos acima são apenas para conferir que a leitura de `process.env` funciona de ponta a ponta, se o teste tiver um caso que a exercite diretamente.

## 3. Validar end-to-end via as estratégias existentes

```sh
npx tsx --test src/agents/react.test.ts src/agents/plan-and-execute.test.ts
```

Confirma que `react.ts`/`plan-and-execute.ts` continuam passando com o builder centralizado no lugar da montagem manual anterior — nenhum teste existente deve quebrar (o comportamento observável muda apenas quando os tetos são efetivamente excedidos).

## 4. Suite completa do projeto

```sh
npm run typecheck
npm test
```

Ambos devem estar verdes antes de considerar a feature concluída (constitution, princípio IV).

## Nota sobre métricas (feature 010)

`RunMetrics.contextBreakdown` continua refletindo o tamanho do contexto *disponível* (antes do corte de orçamento), não o que efetivamente foi enviado após o corte desta feature — são propósitos diferentes (auditoria de custo/uso vs. limite de envio). Não é necessário alterar `buildContextBreakdown` nem seus testes existentes.
