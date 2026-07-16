# 06 - RAG Neo4j & Sales Analytics Reporter

Um **RAG sobre banco de grafos**: em vez de recuperar trechos de texto (RAG tradicional), o sistema traduz a pergunta do usuário em uma **query Cypher**, executa contra um [Neo4j](https://neo4j.com), e transforma o resultado estruturado em uma **resposta analítica em linguagem natural**. Modelado como um **grafo de estados** com [LangGraph](https://langchain-ai.github.io/langgraphjs/), incluindo **decomposição de perguntas complexas** em sub-etapas e **auto-correção** de queries inválidas.

## Contexto

O domínio é o de uma academia online (`EW Academy`): alunos, cursos, compras e progresso, modelados como grafo no Neo4j. A pergunta de negócio (ex.: _"Quais cursos são comprados juntos com mais frequência?"_) nunca é respondida com SQL/Cypher cru — o pipeline sempre devolve **texto analítico** com achados, percentuais e sugestões de perguntas de follow-up, no idioma da pergunta.

Conceitos demonstrados:

- **Text-to-Cypher**: o LLM recebe o schema real do grafo (`Neo4jGraph.getSchema()`) + regras de negócio e gera a query, sem acesso direto ao banco.
- **Auto-correção de query**: se a execução falhar (`EXPLAIN` ou erro em runtime), o erro é reenviado ao LLM para gerar uma versão corrigida (`cypherCorrection`), com limite de tentativas (`maxCorrectionAttempts`).
- **Decomposição de perguntas complexas**: um nó de planejamento (`queryPlanner`) classifica a pergunta como `simple`/`complex` e, se precisar de múltiplas agregações dependentes, quebra em até 3 sub-perguntas executadas em sequência.
- **Saídas estruturadas**: cada nó usa um schema Zod (`generateStructured`) para forçar o formato de saída do LLM — query, correção, análise de complexidade e resposta final.
- **Arestas condicionais**: o roteamento após `cypherExecutor` decide entre corrigir a query, avançar para o próximo sub-passo, ou gerar a resposta final.

## Fluxo do grafo

```
START → extractQuestion ─┬─ END (mensagem vazia/erro)
                         └─ queryPlanner → cypherGenerator → cypherExecutor ─┬─ cypherCorrection → cypherExecutor (retry)
                                                                              ├─ cypherGenerator (próximo sub-passo, se multi-etapa)
                                                                              └─ analyticalResponse → END
```

1. **extractQuestion** — extrai a pergunta da última mensagem do estado.
2. **queryPlanner** — decide se a pergunta é simples ou complexa; se complexa, gera até 3 sub-perguntas (`isMultiStep`, `subQuestions`).
3. **cypherGenerator** — busca o schema do Neo4j + `SALES_CONTEXT` (regras de negócio) e gera a query Cypher para a pergunta (ou sub-pergunta) atual.
4. **cypherExecutor** — valida a query com `EXPLAIN` e executa; se falhar, sinaliza `needsCorrection`; se for multi-etapa, acumula resultados e avança para o próximo passo.
5. **cypherCorrection** — reenvia a query + mensagem de erro ao LLM para gerar uma versão corrigida (no máximo `config.maxCorrectionAttempts` vezes).
6. **analyticalResponse** — converte os resultados (ou erro/ausência de resultados) em uma resposta em prosa com achados e 2-3 perguntas de follow-up; sintetiza todos os sub-passos quando a pergunta foi decomposta.

## Estrutura principal (`src/`)

- `index.ts` — sobe o servidor e dispara uma requisição de teste (`/sales`) com uma pergunta de exemplo
- `server.ts` — Fastify; rota `POST /sales` que invoca o grafo e fecha a conexão com o Neo4j ao encerrar
- `config.ts` — modelo do OpenRouter, roteamento por provedor, credenciais do Neo4j e limites (`maxCorrectionAttempts`, `maxSubQuestions`)
- `graph/graph.ts` — schema Zod do estado (`SalesStateAnnotation`) e montagem do `StateGraph` com arestas condicionais
- `graph/factory.ts` — instancia os serviços (`OpenRouterService`, `Neo4jService`) e expõe o grafo compilado
- `graph/nodes/` — um arquivo por nó:
  - `extractQuestionNode.ts` — extrai a pergunta da mensagem do usuário
  - `queryPlannerNode.ts` — classifica complexidade e decompõe em sub-perguntas
  - `cypherGeneratorNode.ts` — gera a query Cypher
  - `cypherExecutorNode.ts` — valida e executa a query; decide se precisa de correção ou tem mais sub-passos
  - `cypherCorrectionNode.ts` — corrige uma query inválida a partir da mensagem de erro
  - `analyticalResponseNode.ts` — gera a resposta analítica final (sucesso, erro, sem resultados ou síntese multi-etapa)
- `prompts/v1/` — `queryAnalyzer`, `cypherGenerator`, `cypherCorrection`, `analyticalResponse` (schemas Zod + prompts) e `salesContext.ts` (regras de negócio do domínio)
- `services/`
  - `neo4jService.ts` — wrapper do `Neo4jGraph` (`getSchema`, `query`, `validateQuery` via `EXPLAIN`)
  - `openrouterService.ts` — cliente LLM com saída estruturada (`createAgent` + `providerStrategy`)

`data/` — `seed.ts`/`seedHelpers.ts` populam o Neo4j com alunos, cursos (`courses.json`), compras e progresso fictícios.

`tests/sales.e2e.test.ts` — testes ponta a ponta contra o servidor real: listagem de cursos, receita, progresso, cursos comprados juntos, casos de borda (pergunta fora de escopo, aluno sem compra) e verificação das perguntas de follow-up.

`docker-compose.yaml` — sobe o Neo4j (`5.14.0-community` + plugin APOC), expondo o Browser (`7474`) e o protocolo Bolt (`7687`).

## Pré-requisitos

- Node.js >= 24.10 (veja o `engines` do `package.json`) — usa `--experimental-strip-types` e `--env-file`
- Docker (para subir o Neo4j via `docker compose`)
- Uma **API key do [OpenRouter](https://openrouter.ai/keys)**

## Configuração

Copie o `.env.example` para `.env` e preencha:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here

LANGSMITH_API_KEY=your_langsmith_api_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=06-rag-neo4j-students-template
```

As credenciais do Neo4j (`neo4j://localhost:7687`, usuário `neo4j`, senha `password`) já vêm definidas em [`src/config.ts`](./src/config.ts), compatíveis com o `NEO4J_AUTH` do `docker-compose.yaml`.

## Como rodar

```bash
npm install

# Sobe o Neo4j em Docker (aguarda o healthcheck)
npm run docker:infra:up

# Popula o banco com cursos, alunos, compras e progresso
npm run seed

# Sobe o servidor Fastify na porta 4000
npm run dev
```

Fazendo uma pergunta:

```bash
curl -X POST http://localhost:4000/sales \
  -H "Content-Type: application/json" \
  --data '{"question": "Quais cursos são comprados juntos com mais frequência?"}'
```

Outros comandos úteis:

```bash
npm run test:e2e        # roda os testes ponta a ponta (faz seed automaticamente)
npm run langgraph:serve # abre o LangGraph Studio para visualizar e depurar o grafo
npm run docker:infra:logs    # acompanha os logs do Neo4j
npm run docker:infra:down    # derruba o container
npm run docker:infra:cleanup # derruba, remove volumes e o diretório storage/
```

> **Nota**: o [`plan.md`](./plan.md) neste diretório é um documento de planejamento histórico de uma refatoração e não reflete necessariamente a implementação final — a fonte da verdade é o código em `src/`.
