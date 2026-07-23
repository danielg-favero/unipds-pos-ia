# 01 - Multiple MCP Tools

Um **agente LangGraph** que recebe um pedido em linguagem natural com dados em anexo (CSV/JSON), extrai a intenção e executa um pipeline de dados completo combinando **dois servidores MCP** (MongoDB e filesystem) com uma **tool local** — tudo na mesma lista de ferramentas do agente.

## Contexto

O foco aqui é mostrar que um agente pode conversar com **vários servidores MCP ao mesmo tempo**, misturando ferramentas remotas (expostas via MCP) com ferramentas comuns do LangChain, sem que o modelo precise saber a diferença entre elas — ele só vê uma lista de `tools` disponíveis.

O pedido do usuário (ex.: _"aqui está um CSV de vendas, salve como JSON e me diga os 5 produtos mais vendidos"_) passa por dois nós:

1. **`intentParser`** — extrai, com saída estruturada (Zod), a intenção, o conteúdo do arquivo (CSV/JSON) e o nome/tipo do arquivo a partir da mensagem crua.
2. **`agent`** — recebe a intenção já estruturada e decide, sozinho, quais ferramentas chamar e em que ordem para cumprir o pedido (converter CSV, salvar arquivo, inserir no Mongo, consultar, escrever relatório).

Conceitos demonstrados:

- **Múltiplos servidores MCP no mesmo cliente**: `MultiServerMCPClient` do [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters) registra o servidor **MongoDB** ([`mongodb-mcp-server`](https://github.com/mongodb-js/mongodb-mcp-server)) e o servidor **filesystem** (`@modelcontextprotocol/server-filesystem`), ambos via `stdio` (processos filhos iniciados com `npx`), e expõe as tools de ambos numa única chamada `client.getTools()`.
- **Tool local ao lado das tools MCP**: `csv_to_json` é uma tool comum do LangChain (`tool(...)` + schema Zod), criada e usada da mesma forma que as tools vindas dos servidores MCP — o agente não distingue a origem.
- **Saída estruturada para extrair intenção**: o nó `intentParser` usa `providerStrategy(schema)` para forçar o modelo a devolver `{ intent, fileContent, fileName, fileType }` já tipado, em vez de texto livre.
- **Agente com sequência de passos guiada por prompt**: o `system prompt` do nó `agent` descreve um passo a passo obrigatório (limpar coleção → converter CSV → salvar JSON → inserir no Mongo → consultar → escrever relatório), e o modelo encadeia as chamadas de tool sozinho até completar todos os passos.
- **Arestas condicionais para tratamento de erro**: se `intentParser` falhar, o grafo desvia direto para `END` em vez de seguir para o `agent`.

## Fluxo do grafo

```
START → intentParser ─┬─ agent → END
                       └─ END (em caso de erro)
```

1. **intentParser** — extrai `intent`, `fileContent`, `fileName` e `fileType` da mensagem do usuário (saída estruturada).
2. **agent** — com as tools MCP (MongoDB, filesystem) + a tool local (`csv_to_json`), executa o pipeline: converte CSV → JSON, salva arquivos em `./reports/`, insere/consulta documentos no MongoDB e escreve a resposta final como relatório.

## Estrutura principal (`src/`)

- `index.ts` — sobe o servidor Fastify e dispara uma requisição de teste em `/chat` com o conteúdo de `data/sales.csv`
- `server.ts` — expõe o endpoint `POST /chat`, que invoca o grafo com a pergunta do usuário
- `config.ts` — configuração do modelo (OpenRouter)
- `graph/graph.ts` — monta e compila o `StateGraph` (nós, arestas e a aresta condicional de erro)
- `graph/factory.ts` — instancia o `OpenRouterService` e expõe o grafo para o servidor e para o LangGraph CLI/Studio
- `graph/state.ts` — schema do estado (`messages`, `intent`, `fileContent`, `fileName`, `answer`, `error`)
- `graph/nodes/`
  - `intentNode.ts` — extrai a intenção estruturada da mensagem
  - `agentNode.ts` — roda o agente com as tools (MCP + local) até resolver o pedido
- `services/`
  - `openRouterService.ts` — cliente da LLM (`ChatOpenAI` apontado ao OpenRouter); `generateStructured` alterna entre modo "saída estruturada" (`responseFormat`, sem tools) e modo "agente com tools" conforme o nó que o chama; também loga cada passo do agente (pensamento, tool chamada, resultado)
  - `mcpService.ts` — monta o `MultiServerMCPClient` com os servidores MongoDB e filesystem e retorna a lista combinada de tools (MCP + `csv_to_json`)
- `tools/`
  - `mongodbTool.ts` — configuração do servidor MCP do MongoDB (`mongodb-mcp-server`, conectado a `mongodb://localhost:27017/dataprocessing`)
  - `fsTool.ts` — configuração do servidor MCP de filesystem, restrito à pasta `./reports`
  - `csvToJsonTool.ts` — tool local que converte texto CSV em JSON (`csvtojson`)
- `prompts/v1/`
  - `identifyIntent.ts` — schema Zod e prompt do nó `intentParser`
  - `agentNode.ts` — prompt com o passo a passo obrigatório do nó `agent`

## Pré-requisitos

- Node.js >= 24.10 (veja o `engines` do `package.json`) — usa o runner nativo de TypeScript e `--env-file`
- **Docker** — sobe o MongoDB e o Mongo Express via `docker-compose.yaml`
- Uma **API key do [OpenRouter](https://openrouter.ai/keys)** (o modelo usado precisa suportar tool calling e saída estruturada em JSON)
- `npx` disponível (os servidores MCP de MongoDB e filesystem são baixados e executados sob demanda)
- (Opcional) Uma conta no **[LangSmith](https://smith.langchain.com)** para tracing

## Configuração

Copie o `.env.example` para `.env` e preencha:

```env
OPENROUTER_API_KEY=your-openrouter-api-key-here

# Opcional — tracing no LangSmith
LANGSMITH_API_KEY=your-langsmith-api-key-here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=01-multiple-mcp-tools-template
```

## Como rodar

```bash
npm install

# Sobe o MongoDB + Mongo Express (http://localhost:8081, user/senha: mongo/mongo)
npm run docker:infra:up

# Sobe o servidor e testa o endpoint /chat com data/sales.csv
npm start

# Modo dev (watch + inspector)
npm run dev

# Abre o LangGraph Studio para visualizar e depurar o grafo
npm run langgraph:serve

# Encerra os containers
npm run docker:infra:down

# Encerra os containers e limpa volumes/relatórios gerados
npm run docker:infra:cleanup
```

Ao rodar `npm start`, o `src/index.ts` lê `data/sales.csv`, monta uma pergunta ("rank the top 5 most sold products") e envia para `POST /chat`. O agente converte o CSV, insere os registros no MongoDB, consulta o ranking e grava a resposta final em `./reports/`.

> Troque para `data/sales-complete.csv` (comentado em `index.ts`) para testar com um dataset maior, ou edite a `question` para pedir outras análises (ex.: receita total).
