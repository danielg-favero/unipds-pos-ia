# Research: Orçamento de Contexto por Seção

## 1. Unidade de medida do orçamento

**Decision**: Reaproveitar `estimateTokens` (heurística `chars/4`) de `src/context/tokens.ts`, já usada por `buildContextBreakdown` (feature 010).

**Rationale**: Mantém uma única convenção de "tamanho" no projeto para todo o contexto (breakdown de métricas e orçamento de corte usam a mesma unidade), evita introduzir um tokenizador real (dependência nova, custo de precisão desnecessário para uma heurística de corte) e é determinística — requisito de FR-012.

**Alternatives considered**:
- Tokenizador real (ex.: `tiktoken`/`js-tiktoken`): mais preciso, mas dependência nova, custo de CPU, e o provedor (OpenRouter, múltiplos modelos) não garante compatibilidade com um único tokenizador. Rejeitado — desproporcional ao ganho.
- Contagem por caracteres puros (sem `/4`): inconsistente com a unidade já usada em `ContextBreakdown`, quebraria a leitura conjunta de métricas + orçamento. Rejeitado.

## 2. Onde centralizar a montagem do prompt

**Decision**: Novo módulo `src/context/context-builder.ts`, com uma função pura `buildPromptSections(input, budget) -> PromptSections` (ver `data-model.md`), consumida por `react.ts` e `plan-and-execute.ts`.

**Rationale**: `react.ts` monta uma lista de `BaseMessage`-like objects; `plan-and-execute.ts` monta um único bloco de texto concatenado. Os dois formatos de saída divergem, mas a **decisão de o que entra/sai** (corte por teto) é idêntica e hoje está duplicada (histórico, memórias, resumo aparecem nos dois arquivos com lógica de formatação repetida, mas sem nenhum teto aplicado). Centralizar apenas a lógica de seleção/corte (o "o quê"), deixando cada strategy responsável por formatar o resultado no seu próprio formato (o "como"), evita forçar as duas estratégias a um formato de mensagem comum que hoje não têm.

**Alternatives considered**:
- Builder retorna diretamente `BaseMessage[]` pronto para o LangGraph: forçaria `plan-and-execute.ts` (que usa texto concatenado) a adaptar seu formato ou o builder a ter dois modos de saída. Rejeitado — mais acoplamento do que o necessário para resolver FR-010 (uniformidade da *regra de corte*, não do formato de mensagem).
- Aplicar o teto dentro de cada strategy, sem módulo central: é o status quo — rejeitado explicitamente pela spec (FR-010: "sem duplicação de regras de corte por estratégia").

## 3. Regra de desempate em memórias com score igual

**Decision**: Quando duas memórias têm o mesmo `score`, a ordem de desempate é a ordem em que aparecem no array de entrada (`memories`/`RecalledMemory[]`), preservando a primeira e descartando por último as que vierem depois — ou seja, um `sort` estável por score decrescente, sem critério de desempate adicional.

**Rationale**: `Array.prototype.sort` em V8/Node é estável (garantido desde ES2019), então basta ordenar por score decrescente sem comparador secundário para obter um resultado determinístico e repetível (FR-012, edge case da spec). Não há metadado adicional (timestamp, etc.) disponível em `RecalledMemory` que justifique um critério mais elaborado.

**Alternatives considered**:
- Desempate por `createdAt` (mais recente primeiro): adiciona uma regra extra não pedida pela spec e não testável sem fixar relógio nos testes. Rejeitado por simplicidade — YAGNI até haver um requisito explícito.

## 4. Parsing das variáveis de ambiente `CONTEXT_BUDGET_*`

**Decision**: Função `readBudgetFromEnv(env = process.env)` isolada, que lê `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_HISTORY`, `CONTEXT_BUDGET_MEMORY`; para cada uma, usa o valor se for um inteiro não-negativo (`Number.isFinite` e `>= 0`), senão usa o default (200/1200/300). Recebe `env` como parâmetro (default `process.env`) para ser testável sem mutar variáveis globais.

**Rationale**: Atende FR-008/FR-009 mantendo a leitura de env isolada da lógica pura de corte (constitution VI — efeitos/entrada externa isolados da função pura central), e testável por injeção de dependência em vez de `process.env` mutável entre testes.

**Alternatives considered**:
- Validar com Zod (`z.coerce.number().nonnegative()`): consistente com o princípio II da constitution, mas para 3 inteiros com fallback trivial (nunca lança, sempre cai no default) um schema Zod completo adiciona uma dependência de import só para isso sem ganho de expressividade sobre `Number.isFinite`. Mantido como nota no Constitution Check do plan.md; pode ser revisitado se o número de variáveis crescer.
