# Phase 0 — Research: Núcleo de Raciocínio

**Feature**: `001-reasoning-strategies-core` | **Date**: 2026-09-02

Todas as versões abaixo foram verificadas contra o `node_modules` já instalado no repositório, não contra memória.

---

## R-001: Store in-memory vs. MySQL/Sequelize (contradição da spec)

**Decision**: Definir uma **porta** `OpsStore` no domínio com **dois adaptadores**: `MemoryOpsStore` (padrão em testes e no uso local do arena) e `SequelizeOpsStore` (MySQL, usado pelo script de seed e por execução com `OPS_STORE=mysql`). As ferramentas dependem apenas da porta.

**Rationale**: O pedido original dizia "store in-memory pré-populado" e "banco mysql, utilizando sequelize" na mesma frase. A porta resolve os dois: FR-031 exige testes determinísticos **sem rede** (impossível se as ferramentas falarem MySQL direto), e a constitution/stack exige MySQL+Sequelize. Além disso, verifiquei que **não há MySQL escutando em 127.0.0.1:3306** nesta máquina — amarrar o núcleo ao MySQL tornaria `npm run arena` e `npm test` inexecutáveis hoje.

**Alternatives considered**:
- *Só in-memory*: viola a stack declarada na constitution e descarta o pedido explícito de Sequelize.
- *Só MySQL*: quebra FR-031 (testes sem rede) e bloqueia toda a feature na indisponibilidade do banco.
- *SQLite nos testes*: ainda exige I/O e um dialeto extra; a porta em memória é mais simples e mais rápida.

---

## R-002: Agente ReAct pré-construído do LangGraph

**Decision**: Usar `createReactAgent` de `@langchain/langgraph/prebuilt` (v1.4.13, já instalado), com `version: "v2"` e `recursionLimit` derivado do limite de iterações.

**Rationale**: Verificado em `node_modules/@langchain/langgraph/dist/prebuilt/index.d.ts` — `createReactAgent`, `CreateReactAgentParams`, `ToolNode` e `toolsCondition` estão exportados. A assinatura aceita `{ llm, tools, prompt, version, checkpointer }`. O símbolo está marcado `@deprecated` com a orientação de migrar para `createAgent` do pacote `langchain`, **que não está instalado** neste projeto. Manter `createReactAgent` evita adicionar dependência e ainda atende "agente ReAct pré-construído do LangGraph".

**Alternatives considered**:
- *Instalar `langchain@^1.5.4` e usar `createAgent`*: caminho futuro correto, mas adiciona dependência e superfície nova sem ganho funcional aqui. Registrado como dívida técnica.
- *Montar o loop ReAct à mão com `StateGraph` + `ToolNode`*: contraria o requisito de usar o pré-construído e duplica o que a lib já entrega.

**Nota de migração**: quando `langchain` entrar no projeto, a troca é `createReactAgent({ llm, tools })` → `createAgent({ model, tools })`; o resto do adaptador de trace não muda.

---

## R-003: Captura do trace a partir do agente pré-construído

**Decision**: Executar via `agent.stream(input, { streamMode: "values", recursionLimit })` e traduzir o histórico de `messages` em eventos tipados: `AIMessage` sem `tool_calls` → `thought` (quando intermediária) ou `answer` (última); cada item de `AIMessage.tool_calls` → `action` (`{ tool, args }`); cada `ToolMessage` → `observation`, correlacionada pelo `tool_call_id`.

**Rationale**: O contrato de trace da spec (FR-002/FR-003) é próprio do OpsPilot e não coincide com o formato de mensagens do LangGraph; a tradução isolada num módulo puro (`fromMessages`) mantém o mapeamento testável sem rede. `AIMessage.tool_calls` e `ToolMessage` são a superfície estável documentada.

**Alternatives considered**:
- *Callbacks `handleToolStart`/`handleToolEnd`*: entregam a mesma informação, mas fora de ordem determinística sob execução paralela de tools.
- *`streamMode: "updates"`*: dá deltas por nó; exigiria remontar o histórico de qualquer forma.

---

## R-004: Contagem de chamadas de LLM

**Decision**: Um `CallCounter` implementado como callback handler (`handleChatModelStart`) passado em `config.callbacks` de cada execução, e não no construtor do modelo.

**Rationale**: Verificado em `@langchain/core/dist/callbacks/base.d.ts` — `handleChatModelStart` existe e é disparado uma vez por chamada ao chat model, inclusive nas chamadas internas do agente pré-construído e nas de saída estruturada. Como a fábrica de modelo é única e compartilhada (FR-008), contar no construtor misturaria execuções; contar por execução mantém as métricas isoladas e a fábrica pura.

**Alternatives considered**:
- *Incrementar manualmente em cada `invoke`*: não enxerga as chamadas internas de `createReactAgent`, subcontando.
- *Somar `usage_metadata` das mensagens*: mede tokens, não número de chamadas.

---

## R-005: Fábrica de modelo sobre OpenRouter

**Decision**: `ChatOpenAI` de `@langchain/openai` (v1.5.10) com `{ apiKey: OPENROUTER_API_KEY, model: OPENROUTER_MODEL, temperature: 0, configuration: { baseURL: "https://openrouter.ai/api/v1" } }`. As variáveis são lidas de `process.env` num único ponto (`src/agents/model.ts`), validadas por Zod, e a ausência de qualquer uma levanta `ConfigError` antes de qualquer chamada.

**Rationale**: `apiKey`, `temperature` e `configuration.baseURL` estão documentados no próprio `chat_models` do pacote instalado. Ler `process.env` num só lugar atende FR-008/FR-009 e mantém a constitution (nunca ler `.env` diretamente — quem carrega o ambiente é o runtime, via `node --env-file` ou o shell).

**Alternatives considered**:
- *`ChatOpenRouter` dedicado*: não existe pacote oficial; OpenRouter é compatível com a API OpenAI.
- *Validar env no import do módulo*: quebra os testes, que importam o módulo sem credenciais. A validação acontece na chamada da fábrica.

---

## R-006: Saída estruturada do planner (Plan-and-Execute)

**Decision**: `model.withStructuredOutput(PlanSchema)` com `PlanSchema = z.object({ steps: z.array(z.string()).min(1).max(8) })`; o replanner usa uma união de "plano restante" ou "resposta final".

**Rationale**: `withStructuredOutput` existe em `BaseChatModel` (verificado em `@langchain/core/dist/language_models/chat_models.d.ts`) com sobrecarga que aceita schema Zod v4. Nem todo modelo do OpenRouter suporta `json_schema` estrito; por isso a chamada usa o método padrão (function calling) e o resultado ainda passa por `PlanSchema.parse` na borda.

**Alternatives considered**:
- *Parsear texto livre do planner*: frágil e não determinístico.
- *`responseFormat` do `createReactAgent`*: aplica-se ao ReAct, não ao grafo próprio do Plan-and-Execute.

---

## R-007: Limite de iterações e teto de 8 passos

**Decision**: Duas barreiras independentes. (a) `recursionLimit` do LangGraph = `maxIterations * 2 + 1`, para cobrir o par agente/tools de cada iteração. (b) Um contador próprio no grafo Plan-and-Execute que interrompe em 8 passos executados, independentemente do `maxIterations`. Ao estourar qualquer barreira a execução devolve `answer` parcial explícita + trace + métricas (FR-005, SC-002, SC-003).

**Rationale**: `recursionLimit` conta *supersteps* do grafo, não iterações de raciocínio — um ciclo ReAct consome dois. Confiar só nele daria um limite efetivo pela metade do pedido. A barreira própria garante o teto de 8 mesmo se o LangGraph mudar a contagem.

**Alternatives considered**:
- *Só `recursionLimit`*: semântica não bate com "iterações" da spec e lança `GraphRecursionError` em vez de resposta parcial.
- *Só contador próprio*: não protege contra laços internos do agente pré-construído.

---

## R-008: Zod v4 com `tool()` do LangChain

**Decision**: Zod v4 (`zod@^4.4.3`, instalado) direto, importando de `"zod"`. Os schemas das três ferramentas são declarados uma vez e reutilizados pelas tools e pelos testes.

**Rationale**: As sobrecargas `ZodObjectV4` de `tool()` estão presentes em `@langchain/core/dist/tools/index.d.ts`, e `@langchain/langgraph` declara `zod: "^3.25.32 || ^4.2.0"` como peer. Alguns exemplos oficiais ainda importam `zod/v4` — desnecessário aqui, já que a v4 é a versão instalada.

**Alternatives considered**: fixar `zod/v3` — sem motivo, e contraria a stack do projeto.

---

## R-009: Descoberta de testes com `node:test`

**Decision**: Colocar os testes em `src/<camada>/*.test.ts` (ex.: `src/store/memory.test.ts`, `src/domain/trace.test.ts`), sem alterar o script `test` do `package.json`.

**Rationale**: `npm test` roda `node --import tsx --test src/**/*.test.ts` sob `sh`, que **não** tem `globstar`; `src/**/*.test.ts` expande como `src/*/*.test.ts`, ou seja, exatamente um nível de subdiretório. Testes num subdiretório funcionam; testes soltos em `src/*.test.ts` seriam silenciosamente ignorados. Respeitar o layout evita mexer em configuração alheia à feature.

**Alternatives considered**: trocar o script por descoberta recursiva do Node 24 — mudança fora do escopo desta feature; registrada como sugestão.

---

## R-011: Arquivo JSON como base de dados de trabalho *(revisão de R-001 e R-010)*

**Decision**: Um terceiro adaptador, `JsonOpsStore`, sobre `data/ops-db.json`, passa a ser o **padrão do arena**. O `npm run seed` gera esse arquivo. `MemoryOpsStore` continua sendo o adaptador dos testes; o MySQL vira opt-in (`--store mysql`, `npm run seed -- --mysql`).

**Rationale**: A porta `OpsStore` de R-001 já previa múltiplos adaptadores — este é o terceiro, sem mudança de contrato. O arquivo entrega o que faltava: o modelo lê o estado que já existe e o que ele cria persiste entre execuções, sem depender de infraestrutura ausente (R-010: sem MySQL em 3306, sem daemon Docker). Isso destravou executar o seed de verdade.

**Detalhes que a implementação exigiu**:
- Escritas passam por uma fila interna (`#serialize`), senão duas ferramentas concorrentes leem o mesmo estado e uma sobrescreve a outra. Coberto por teste.
- O conteúdo do arquivo é validado por Zod na leitura — disco é entrada externa (constitution II).
- O seed **preserva incidentes** existentes e repõe apenas serviços e alertas. Repor tudo apagaria o trabalho do plantão a cada execução.
- `data/` está no `.gitignore`: é estado mutável de runtime, regenerável por `npm run seed`.

**Alternatives considered**:
- *Manter memória como padrão*: perde a persistência entre execuções, que era o ponto do pedido.
- *SQLite*: dependência nova para um ganho que o JSON já entrega nesta escala.

---

## R-010: Disponibilidade do MySQL

**Decision**: O caminho MySQL é opt-in. `npm run seed` exige `DATABASE_URL` (ou host/porta/usuário/senha/base) e falha com erro de domínio claro quando o banco não responde. `npm run arena` e `npm test` usam o store em memória por padrão e nunca tocam o banco.

**Rationale**: Verificado: nada escuta em `127.0.0.1:3306` nesta máquina. Sem isso, a feature inteira ficaria bloqueada por infraestrutura ausente, violando SC-007 (testes sem rede).

**Alternatives considered**: subir MySQL via container como pré-requisito obrigatório — fora do escopo da feature e desnecessário para o valor central (comparar estratégias).

---

## Dívidas técnicas registradas

| Item | Origem | Ação futura |
|------|--------|-------------|
| `createReactAgent` deprecado | R-002 | Migrar para `createAgent` do pacote `langchain` quando ele for adicionado |
| Script `test` sem globstar | R-009 | Trocar por descoberta recursiva do Node 24 |
| MySQL indisponível localmente | R-010 | Adicionar compose/serviço de banco quando a API HTTP entrar no escopo |
