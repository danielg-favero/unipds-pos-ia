# 06 - MCP with LangChain

Um **agente LangGraph** que consome o servidor MCP construído nas aulas anteriores — agora publicado no NPM e baixado via `npx` — lado a lado com o servidor MCP de filesystem, numa única lista de tools.

## Contexto

O ciclo fecha aqui. No [01-multiple-mcp-tools](../01-multiple-mcp-tools/) o agente consumia MCPs de terceiros (MongoDB, filesystem). Do [03](../03-mcp-server-from-scratch/) ao [05](../05-api-security-auth-rate-limiting/) o foco foi **construir** um servidor, embrulhar uma API com ele e protegê-lo. Neste projeto o agente volta à cena, mas agora consumindo **o MCP que você mesmo escreveu, autenticou e publicou**.

O ponto que isso demonstra: do ponto de vista do agente, não existe diferença nenhuma entre um MCP oficial e o seu. Ambos são processos `stdio` iniciados por `npx`, e ambos viram tools do LangChain pela mesma chamada `client.getTools()`.

| Pasta                                                            | O que é                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`mcp-langchain/`](./mcp-langchain/)                             | O agente LangGraph — consome os servidores MCP e expõe um `POST /chat`          |
| [`nodejs-fastify-mongodb-crud/`](./nodejs-fastify-mongodb-crud/) | A API de clientes autenticada, que o `customers-mcp` embrulha (mesma do [05](../05-api-security-auth-rate-limiting/)) |

Conceitos demonstrados:

- **MCP como dependência de aplicação**, não como ferramenta de editor: o servidor é declarado em código (`src/tools/`), versionado no `package.json` e sobe junto com o agente.
- **Credencial pelo ambiente**: o `SERVICE_TOKEN` da API vai para o processo filho pelo campo `env` da configuração do servidor — fora do alcance do modelo.
- **Dois servidores MCP numa lista só**: `customers-mcp` (do NPM) e `@modelcontextprotocol/server-filesystem` (restrito a `./data`), combinados pelo `MultiServerMCPClient`.
- **Encadeamento entre servidores diferentes**: o pedido de exemplo pede para criar clientes pela API **e** salvar o resultado num arquivo — o modelo cruza os dois servidores sozinho, sem saber que são processos distintos.
- **Observabilidade do agente**: callbacks logam cada decisão (`🎯 Decided to call`), cada chamada de tool e cada retorno.

## Fluxo

```
POST /chat → StateGraph → agent ─┬─ END
                                  └─ agent (retry em caso de erro)
```

O grafo tem um nó só. Toda a complexidade está nas tools: o `agentNode` recebe a pergunta, roda um `createAgent` com as tools MCP e devolve a resposta final. A aresta condicional reenvia ao próprio `agent` quando o estado carrega um `error`.

## Como rodar

Três passos, nesta ordem — o MCP depende da API, e o agente depende do MCP.

### 1. Subir a API

```bash
cd nodejs-fastify-mongodb-crud
npm ci
npm run infra:up:db      # MongoDB
npm start                # API em http://localhost:9999
```

### 2. Emitir um service token

```bash
cd ../mcp-langchain
./getServiceToken.sh     # emite o token e grava SERVICE_TOKEN no .env
```

O script usa credenciais de **admin** — o agente precisa disso para criar clientes. Com um token `member` as tools de leitura funcionam e as de escrita voltam `403`.

### 3. Rodar o agente

```bash
npm install
npm start
```

Veja o [README do `mcp-langchain/`](./mcp-langchain/) para a configuração completa (`.env`, OpenRouter, LangGraph Studio) e o detalhamento da estrutura.

## Relação com os projetos anteriores

| Projeto                                                     | Papel aqui                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| [01](../01-multiple-mcp-tools/)                             | Mesma arquitetura de agente — a diferença é de **onde vêm** as tools    |
| [04](../04-api-as-mcp/) / [05](../05-api-security-auth-rate-limiting/) | Origem do `customers-mcp`: aqui ele é consumido como pacote NPM |

> ⚠️ O `mcp-langchain/src/tools/customersTool.ts` aponta para `@erickwendel/ew-customers-mcp@latest`, o pacote do instrutor. Para consumir a sua própria versão, publique o `customers-mcp` do [05](../05-api-security-auth-rate-limiting/customers-mcp/) e troque o nome do pacote em `args` — a interface é idêntica.
