# mcp-langchain

O **agente LangGraph** do projeto [06](../): recebe um pedido em linguagem natural por `POST /chat` e resolve usando dois servidores MCP — o `customers-mcp` (baixado do NPM via `npx`) e o servidor de filesystem oficial, restrito à pasta `./data`.

## Como as tools chegam ao agente

Toda a integração cabe numa chamada. O [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters) sobe cada servidor como processo filho e converte as tools MCP em tools do LangChain:

```ts
const client = new MultiServerMCPClient({
  mcpServers: {
    ...getCustomersTool(),   // customers-mcp, com SERVICE_TOKEN no env
    ...getFSTool(),          // @modelcontextprotocol/server-filesystem em ./data
  },
  onInitialized: (source) => console.log(`✅ MCP server connected: ${source.server}`),
  onConnectionError: (source, error) => { /* falha rápido: process.exit(1) */ },
});

const mcpTools = await client.getTools();
```

`getTools()` achata os dois servidores numa lista só. O modelo não sabe de qual servidor veio cada tool — e é por isso que ele consegue encadear as duas famílias sozinho.

### Credencial pelo ambiente

O `customersTool.ts` valida o `SERVICE_TOKEN` antes de declarar o servidor e o repassa pelo campo `env`:

```ts
return {
  'customers-mcp': {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@erickwendel/ew-customers-mcp@latest'],
    env: { SERVICE_TOKEN: process.env.SERVICE_TOKEN as string },
  },
};
```

O token vive no processo, não no schema de nenhuma tool — o modelo não consegue lê-lo nem trocá-lo por um mais privilegiado. O comentário no arquivo mostra a variante que consome o pacote de um registry privado (Verdaccio):

```ts
// args: ["-y", "--registry", "http://localhost:4873", "@erickwendel/ew-customers-mcp@latest"],
```

### O servidor de filesystem

```ts
args: ['-y', '@modelcontextprotocol/server-filesystem', `${process.cwd()}/data`],
```

O último argumento é a **raiz permitida**: o servidor recusa qualquer caminho fora dela. Um agente com acesso irrestrito ao disco seria uma péssima ideia, e a restrição fica no servidor, não no prompt.

## Fluxo do grafo

```
START → agent ─┬─ END
                └─ agent (quando state.error está preenchido)
```

Um nó só. O `agentNode` pega a última mensagem do estado, monta o system prompt (`src/prompts/v1/agentNode.ts`) e chama `OpenRouterService.generateStructured`, que roda um `createAgent` com as tools MCP até o pedido ser cumprido. Se algo estourar, o nó devolve `error` no estado e a aresta condicional reenvia ao próprio `agent`.

O `generateStructured` tem dois modos: com `schema`, usa `providerStrategy(schema)` e **desliga as tools** (saída estruturada pura); sem `schema`, entrega as tools MCP ao agente. Este projeto usa o segundo.

## Estrutura (`src/`)

- `index.ts` — sobe o Fastify e dispara uma requisição de teste em `/chat`
- `server.ts` — expõe `POST /chat`, que invoca o grafo com a pergunta do usuário
- `config.ts` — configuração do modelo (OpenRouter: modelos, temperatura, `maxTokens`, roteamento por throughput)
- `graph/`
  - `graph.ts` — monta e compila o `StateGraph` (nó `agent` + aresta condicional de erro)
  - `factory.ts` — instancia o `OpenRouterService` e expõe o grafo para o servidor e para o LangGraph CLI/Studio
  - `state.ts` — schema do estado (`messages`, `answer`, `error`, …)
  - `nodes/agentNode.ts` — roda o agente com as tools até resolver o pedido
- `services/`
  - `openRouterService.ts` — cliente da LLM (`ChatOpenAI` apontado ao OpenRouter) + callbacks que logam cada passo
  - `mcpService.ts` — monta o `MultiServerMCPClient` e devolve a lista combinada de tools
- `tools/`
  - `customersTool.ts` — configuração do servidor MCP de clientes (`npx`, com `SERVICE_TOKEN`)
  - `fsTool.ts` — configuração do servidor MCP de filesystem, restrito a `./data`
- `prompts/v1/agentNode.ts` — system prompt do agente

## Pré-requisitos

- **Node.js >= 24.10** (veja `engines` no `package.json`) — usa o runner nativo de TypeScript e `--env-file`
- A **API de clientes** rodando em `http://localhost:9999` (veja [`../nodejs-fastify-mongodb-crud/`](../nodejs-fastify-mongodb-crud/))
- Uma **API key do [OpenRouter](https://openrouter.ai/keys)** — o modelo precisa suportar tool calling
- **`npx`** disponível (os dois servidores MCP são baixados sob demanda)
- **`jq`** — usado pelo `getServiceToken.sh`
- (Opcional) Uma conta no **[LangSmith](https://smith.langchain.com)** para tracing

## Configuração

Copie o `.env.example` para `.env` e preencha:

```env
OPENROUTER_API_KEY=your-openrouter-api-key-here
SERVICE_TOKEN=your-service-token-here

# Opcional — tracing no LangSmith
LANGSMITH_API_KEY=your-langsmith-api-key-here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=transforming-services-into-tools
```

O `SERVICE_TOKEN` sai da API:

```bash
./getServiceToken.sh
```

O script emite um service token de **admin** e grava/atualiza a linha `SERVICE_TOKEN=` no `.env`. Como os tokens ficam num `Map` em memória na API, reiniciá-la exige rodar o script de novo.

> ⚠️ O `getServiceToken.sh` usa as credenciais do instrutor (`erickwendel` / `123123` / `AM I THE BOSS?`). Se a API que você subiu for a do [05](../../05-api-security-auth-rate-limiting/nodejs-fastify-mongodb-crud/), ajuste o `username` e o `adminSuperSecret` (`admin_supersecret`) — caso contrário a emissão devolve **401**.

## Como rodar

```bash
npm install

# Sobe o servidor em :3000 e dispara a pergunta de exemplo em /chat
npm start

# Modo dev (watch + inspector)
npm run dev

# Abre o LangGraph Studio para visualizar e depurar o grafo
npm run langgraph:serve
```

A pergunta que o `index.ts` dispara é justamente a que cruza os dois servidores:

> Crie 3 clientes de teste usando as tools de customer, depois guarde estes clientes em `./data/users.json`, em seguida, liste os clientes cadastrados também pela tool de customers.

O agente chama `create_customer` três vezes (`customers-mcp`), escreve o arquivo (`filesystem`) e volta ao `list_customers` — encadeando servidores distintos sem que o prompt diga qual tool pertence a qual.

Para mandar outra pergunta:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Liste todos os clientes e me diga quantos são"}'
```

O body exige `question` com no mínimo 10 caracteres.

## Scripts

| Script                        | Descrição                                        |
| ----------------------------- | ------------------------------------------------ |
| `npm start`                   | Sobe o servidor e dispara a pergunta de exemplo  |
| `npm run dev`                 | Watch mode + inspector do Node                   |
| `npm run langgraph:serve`     | Abre o LangGraph Studio                          |
| `npm run docker:infra:up`     | Sobe os containers do Compose                    |
| `npm run docker:infra:down`   | Derruba os containers                            |
| `npm run docker:infra:cleanup`| Derruba tudo, apaga volumes e `storage/`         |
| `npm run docker:infra:logs`   | Acompanha os logs dos containers                 |

> Os scripts `docker:infra:*` vêm do template do [01](../../01-multiple-mcp-tools/) e não têm `docker-compose.yaml` neste projeto — a infra que importa aqui é a da [API](../nodejs-fastify-mongodb-crud/).
