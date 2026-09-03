# Model Context Protocol (MCP)

## Projetos

Exemplos práticos desenvolvidos ao longo da disciplina. Cada pasta tem seu próprio `README.md` com contexto e instruções de execução.

| #   | Projeto                                                  | O que demonstra                                                                                  |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 01  | [Multiple MCP Tools](./01-multiple-mcp-tools/)           | Agente LangGraph consumindo vários servidores MCP (MongoDB, filesystem) via stdio + tool própria |
| 02  | [Skills](./02-skills/)                                   | Instalação e uso de Agent Skills (`npx skills`) para processamento de vídeo com FFmpeg           |
| 03  | [MCP Server from Scratch](./03-mcp-server-from-scratch/) | Servidor MCP próprio com tools, resource e prompt, testado via SDK de cliente e Inspector        |
| 04  | [API as MCP](./04-api-as-mcp/)                           | Servidor MCP que embrulha uma API REST existente (Fastify + MongoDB), expondo ações ao agente    |
| 05  | [API Security, Auth & Rate Limiting](./05-api-security-auth-rate-limiting/) | O mesmo MCP agora autenticado: service token, RBAC e rate limiting na API embrulhada |
| 06  | [MCP with LangChain](./06-mcp-with-langchain/)           | Agente LangGraph consumindo o MCP publicado no NPM via `@langchain/mcp-adapters`                 |

Os seis formam uma progressão: **consumir** servidores MCP → dar contexto ao agente sem servidor algum → **construir** o servidor → **embrulhar um sistema que já existe** com ele → **proteger** esse acesso → **voltar ao agente**, agora consumindo o MCP que você mesmo publicou.

## Índice de conceitos

- [O que é o MCP](#o-que-é-o-mcp)
  - [Contexto histórico](#contexto-histórico)
  - [Function Calling vs. MCP](#function-calling-vs-mcp)
  - [Como funciona](#como-funciona)
- [Agents](#agents)
- [Skills](#skills)
  - [Skills vs. MCP vs. Agents](#skills-vs-mcp-vs-agents)
- [Criando um MCP do zero](#criando-um-mcp-do-zero)
  - [As três primitivas](#as-três-primitivas)
  - [Transportes](#transportes)
  - [Inspecionando e testando](#inspecionando-e-testando)
- [Integrando MCP com APIs](#integrando-mcp-com-apis)
  - [Endpoints não são ações](#endpoints-não-são-ações)
  - [Onde colocar cada coisa](#onde-colocar-cada-coisa)
- [Segurança: autenticação e rate limiting](#segurança-autenticação-e-rate-limiting)
  - [JWT vs. service token](#jwt-vs-service-token)
  - [Autorização por papel (RBAC)](#autorização-por-papel-rbac)
  - [Rate limiting por token](#rate-limiting-por-token)
  - [Traduzindo erros de segurança para o modelo](#traduzindo-erros-de-segurança-para-o-modelo)
- [Publicando MCPs no NPM](#publicando-mcps-no-npm)
  - [Preparando o pacote](#preparando-o-pacote)
  - [Registry privado com Verdaccio](#registry-privado-com-verdaccio)
  - [Consumindo o pacote publicado](#consumindo-o-pacote-publicado)
- [Usando MCP com o LangChain](#usando-mcp-com-o-langchain)
  - [MultiServerMCPClient](#multiservermcpclient)
  - [Passando credenciais para o servidor](#passando-credenciais-para-o-servidor)
  - [MCP no VS Code vs. MCP dentro do agente](#mcp-no-vs-code-vs-mcp-dentro-do-agente)

## O que é o MCP

O **Model Context Protocol** é um protocolo de comunicação `cliente-servidor` criado pela Anthropic para conectar modelos de LLM a ferramentas e serviços externos. Ele pode ser visto como uma evolução do antigo `Function Calling`.

### Contexto histórico

- **Março de 2023**: o ChatGPT lançou os `Plugins`, uma proposta similar que funcionava dentro da própria interface do chat.
- **Junho de 2023**: a OpenAI lançou o `Function Calling`, dando aos modelos de LLM a capacidade de chamar funções externas de forma estruturada. O LangChain já oferece suporte nativo a essa abordagem.
- **Novembro de 2024**: a Anthropic lançou e open-sourceou o `Model Context Protocol`, um padrão aberto para conectar assistentes de IA a sistemas onde os dados vivem (repositórios de conteúdo, ferramentas de negócio, ambientes de desenvolvimento etc.). O protocolo foi criado pelos engenheiros David Soria Parra e Justin Spahr-Summers.
- **Dezembro de 2025**: a Anthropic doou a governança do MCP para a Agentic AI Foundation (AAIF), consolidando-o como um padrão da indústria mantido pela comunidade.

### Function Calling vs. MCP

O `Function Calling` é bem mais simples que o `MCP`: basta fornecer nome, descrição e parâmetros de uma função para que o sistema a chame quando necessário. A limitação é que isso não dá muita autonomia ao LLM, já que ele recebe pouco contexto sobre a ferramenta.

O `MCP` vai além: junto com a ferramenta, o servidor expõe endpoints adicionais que permitem ao modelo obter informações sobre a função, gerar exemplos de resposta e entender melhor como utilizá-la.

### Como funciona

Um servidor MCP pode disponibilizar diversas funções já prontas, sem que seja necessário criar tudo do zero. Isso traz agilidade ao uso de LLMs, pois o modelo se comunica diretamente com os endpoints do servidor e entende como utilizá-los.

Diferente de uma API `REST` tradicional, o MCP não trabalha com endpoints fixos, e sim com **ações**: o modelo lê as ações disponíveis no servidor e faz requisições para obter informações sobre elas (descrição, parâmetros, exemplos de resposta etc.).

Um mesmo agente pode conversar com **vários servidores MCP ao mesmo tempo** (ex.: um para banco de dados, outro para arquivos), combinando as ferramentas de todos eles numa única lista disponível para a LLM. Veja o projeto [01-multiple-mcp-tools](./01-multiple-mcp-tools/) para um exemplo com dois servidores MCP (MongoDB e filesystem) rodando lado a lado com uma tool local.

> **O MCP não substitui as tools** — pelo contrário, ele é o padrão utilizado para disponibilizá-las de forma estruturada ao modelo.

## Agents

São pequenos prompts que executam uma tarefa específica. Com o `claude` é possível criar um agente com:

```claude
create a ... agent that ...
```

Há alguns hubs que disponibilizam uma lista pronta de agents para desenvolvimento de software:

- [Awesome Copilot Agents](https://github.com/github/awesome-copilot/tree/main/agents)
- [Awesome Code Agents](https://github.com/sorrycc/awesome-code-agents)

## Skills

São habilidades para a LLM utilizar durante a execução: um arquivo (`SKILL.md`) com instruções, comandos e exemplos que o agente carrega sob demanda quando a tarefa se encaixa na descrição da skill. Diferente dos agents, as skills são chamadas **durante** a execução; os agents são selecionados **para** realizar uma tarefa — ou seja, um agent pode chamar várias skills conforme precisa delas.

Skills são instaladas e versionadas com a [Skills CLI](https://skills.sh) (`npx skills`), que funciona como um gerenciador de pacotes: busca (`npx skills find`), instala (`npx skills add <owner/repo>@<skill>`) e mantém um lockfile (`skills-lock.json`) com a origem e o hash de cada skill instalada — parecido com um `package-lock.json`.

A vercel disponibiliza um hub de skills prontas: [Vercel Skills](https://www.skills.sh/)

Veja o projeto [02-skills](./02-skills/) para um exemplo de instalação e uso de skills (processamento de vídeo com FFmpeg).

### Skills vs. MCP vs. Agents

Os três resolvem problemas parecidos (dar mais capacidade a um agente de IA), mas em camadas diferentes:

| Conceito  | O que é                                                                                                | Onde roda                                         |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **MCP**   | Protocolo para conectar o modelo a **serviços externos** (bancos de dados, APIs, sistemas de arquivos) | Servidor separado (processo `stdio` ou HTTP)      |
| **Skill** | **Conhecimento/instruções** empacotadas (Markdown + exemplos) que o agente lê e segue                  | Arquivo local (`SKILL.md`), carregado no contexto |
| **Agent** | Um **prompt especializado** selecionado para executar uma tarefa, que pode usar MCPs e Skills          | Definição de agente (config/prompt)               |

## Criando um MCP do zero

A biblioteca oficial para criar servidores MCP próprios é o [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Ele cuida do protocolo (JSON-RPC, handshake, negociação de capabilities) e deixa para você apenas o registro do que o servidor expõe.

### As três primitivas

Um servidor MCP pode expor três coisas, e a diferença entre elas está em **quem decide usá-las**:

| Primitiva    | O que é                                                      | Controlado por                                         |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------ |
| **Tool**     | Função executável com schema de entrada e de saída           | **Modelo** — chama quando julga necessário             |
| **Resource** | Documento/contexto que o servidor disponibiliza para leitura | **Aplicação cliente** — decide o que entra no contexto |
| **Prompt**   | Template de mensagem parametrizado                           | **Usuário** — normalmente via slash command na UI      |

Na prática, quase todo servidor começa só com tools; resources e prompts entram quando o modelo precisa de contexto estável (documentação do domínio) ou quando há fluxos repetitivos que valem virar atalho para o usuário.

Duas convenções que valem a pena seguir ao registrar uma tool:

- **Declarar `outputSchema`** além do `inputSchema`, devolvendo `structuredContent` — o cliente consome a saída tipada em vez de fazer parse de texto livre.
- **Não lançar exceção em erro de negócio**: devolver `{ isError: true, content: [...] }` com uma mensagem descritiva faz o erro chegar ao modelo como contexto, permitindo que ele se corrija sozinho.

### Transportes

- **`stdio`** — o cliente sobe o servidor como processo filho e conversa por stdin/stdout. É o formato dos servidores que rodam localmente (o caso do [03](./03-mcp-server-from-scratch/) e dos servidores usados no [01](./01-multiple-mcp-tools/)). Atenção: como o stdout **é** o canal do protocolo, logs precisam ir para `stderr`.
- **HTTP (Streamable HTTP)** — o servidor roda remoto e atende vários clientes, com respostas em streaming via SSE. É o formato dos MCPs hospedados por terceiros.

### Inspecionando e testando

O [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) (`npx @modelcontextprotocol/inspector <comando do servidor>`) sobe o servidor, faz o handshake e permite listar e chamar tools, resources e prompts numa UI de browser — validando o servidor sem gastar chamada de LLM.

![MCP Inspect](assets/mcp_inspect.png)

Para testes automatizados, o mesmo SDK traz o **`Client`**: os testes sobem o servidor pelo transporte real e chamam as tools como um agente faria, o que testa o contrato do protocolo e não só a função por baixo. Veja [03-mcp-server-from-scratch](./03-mcp-server-from-scratch/) para a implementação completa.

## Integrando MCP com APIs

Outra aplicação dos MCPs é integrá-los a APIs, principalmente se elas forem legadas, para disponibilizar ações para usuários dentro do sistema. O servidor MCP entra como uma **camada na frente da API**, consumindo-a por HTTP como qualquer outro cliente — sem tocar no sistema existente e sem acessar o banco direto, o que preserva as validações e regras que já estão lá.

Veja o projeto [04-api-as-mcp](./04-api-as-mcp/) para um exemplo completo: uma API de CRUD de clientes (Fastify + MongoDB) e um servidor MCP separado que a expõe como tools, resource e prompt.

### Endpoints não são ações

> É importante ressaltar que essa integração não deve ser um pra um, ou seja, a ideia não é transformar cada endpoint da api em uma chamada no MCP. A ideia é abstrair ações para o usuário utilizar. Cada ação no MCP pode executar diversos endpoints se necessário.

Um agente não pensa em endpoints, pensa em intenções. Uma ação como _"achar o cliente"_ pode virar `GET /customers/:id` quando o id é conhecido, ou `GET /customers` + filtro quando o usuário só sabe o nome — para o modelo continua sendo **uma** tool (`get_customer`). O mesmo vale no sentido inverso: quirks da API (um `PUT` que responde 404 quando nada mudou, paginação, um fluxo de três chamadas para uma operação só) devem ser **escondidos** pela ação, não repassados ao modelo.

Um bom teste: se o nome da tool descreve um verbo do negócio, provavelmente está certo; se descreve um método HTTP, provavelmente é um endpoint disfarçado.

### Onde colocar cada coisa

Embrulhar um sistema externo pede uma camada a mais do que o servidor do [03](./03-mcp-server-from-scratch/) (que só separava regra de negócio da casca MCP):

| Camada           | Responsabilidade                                                        |
| ---------------- | ----------------------------------------------------------------------- |
| `domain`         | Schemas Zod e tipos — reaproveitados como `inputSchema`/`outputSchema`  |
| `infrastructure` | O cliente HTTP: o único lugar que sabe que a API é REST e onde ela vive |
| `application`    | As **ações**: onde uma intenção se traduz em uma ou mais chamadas       |
| `mcp`            | Só tradução — argumentos do modelo em chamadas de serviço e de volta    |

O resource ganha importância nesse cenário: publicar um "mapa" do sistema embrulhado (base URL, endpoints, formato dos recursos) dá ao agente o contexto de domínio antes de ele escolher a tool.

## Segurança: autenticação e rate limiting

Um servidor MCP que embrulha uma API é **só mais um cliente dela** — e, como qualquer cliente, precisa se autenticar. A diferença é que do outro lado há um modelo tomando decisões: ele pode chamar a mesma tool dezenas de vezes, tentar operações que não deveria, ou repassar ao usuário mensagens de erro que ele não entendeu. Por isso a proteção fica **na API**, não no MCP.

O projeto [05-api-security-auth-rate-limiting](./05-api-security-auth-rate-limiting/) é o [04](./04-api-as-mcp/) com essa camada adicionada: a API ganhou login JWT, service tokens, RBAC e rate limiting, e o MCP passou a carregar um token em toda requisição.

> A regra que organiza tudo: **o modelo nunca escolhe a credencial**. O token entra no servidor MCP por variável de ambiente (`SERVICE_TOKEN`), nunca como argumento de tool — senão bastaria o usuário pedir "use o token de admin" para escalar privilégio via prompt.

### JWT vs. service token

A API expõe duas formas de autenticação, e a escolha entre elas depende de quem está do outro lado:

| Forma             | Como se obtém                      | Formato       | Para quem                                            |
| ----------------- | ---------------------------------- | ------------- | ---------------------------------------------------- |
| **JWT**           | `POST /v1/auth/login`              | Token assinado (stateless) | **Usuário** logando numa interface                 |
| **Service token** | `POST /v1/auth/service-token`      | UUID opaco guardado no servidor | **Máquina** — outro serviço, um MCP, um job |

O servidor MCP usa o **service token** porque é um processo de longa duração, sem sessão de usuário e sem ninguém para digitar senha: ele sobe com o token no ambiente e o usa até morrer. O `service-token` exige, além de usuário e senha, um `adminSuperSecret` — ou seja, só quem opera a infra emite credencial de serviço, não qualquer usuário final.

O hook `onRequest` aceita as duas: procura o token no mapa de service tokens emitidos e, se não achar, cai no `jwtVerify()`. Rotas públicas (`/v1/health`, `/v1/auth/*`) ficam de fora.

> Um service token opaco tem uma vantagem prática sobre o JWT aqui: como o servidor guarda a lista dos emitidos, dá para **revogar** um token vazado na hora. Um JWT válido só morre quando expira.

### Autorização por papel (RBAC)

Autenticar responde "quem é você"; autorizar responde "você pode fazer isso". Na API, um `preHandler` (`requireRole('admin')`) protege as mutações — `POST`, `PUT` e `DELETE` de clientes — enquanto leitura fica liberada para qualquer autenticado.

O efeito no agente é o interessante: com um token de papel `member`, as tools de leitura funcionam e as de escrita voltam **403**. O modelo continua vendo as cinco tools na lista (o MCP não filtra nada por papel), mas descobre o limite ao tentar usar. Se você quiser que ele nem enxergue as tools proibidas, isso precisa ser decidido na montagem do servidor, com base no token — o protocolo não faz isso sozinho.

### Rate limiting por token

O `@fastify/rate-limit` está configurado com um `keyGenerator` que usa o **token do header `Authorization`**, com o IP só como fallback:

```js
export const rateLimitingOptions = {
  max: REQUESTS_PER_MINUTE,
  timeWindow: "1 minute",
  keyGenerator: (request) =>
    request.headers.authorization?.replace(/bearer /i, "") ?? request.ip,
};
```

Limitar por IP não serviria: várias instâncias de agente podem sair do mesmo IP (ou de IPs rotativos numa nuvem), e o que se quer conter é o **consumo de uma credencial**. Um agente em loop — pedindo "liste os clientes" a cada iteração porque não gostou da resposta — é exatamente o cenário que o rate limit existe para conter, e ele é bem mais provável com uma LLM no comando do que com uma UI.

### Traduzindo erros de segurança para o modelo

`401`, `403` e `429` não são bugs: são **respostas legítimas** que o agente precisa entender. No cliente HTTP do MCP cada uma vira um erro de domínio com mensagem em texto:

```ts
if (res.status === 401) throw new UnauthorizedError();  // token ausente ou inválido
if (res.status === 403) throw new ForbiddenError();     // sem permissão para a ação
if (res.status === 429) throw new RateLimitError();     // limite excedido, tente depois
```

E as tools devolvem isso como conteúdo (`isError: true`), não como exceção. A diferença prática: com `HTTP 403` cru o modelo tende a repetir a chamada; com _"Forbidden: token does not have sufficient permissions"_ ele avisa o usuário que falta permissão e para. **Mensagem de erro é contexto** — é o canal pelo qual o servidor ensina o modelo a se comportar.

## Publicando MCPs no NPM

Um servidor MCP `stdio` é só um executável — e o jeito natural de distribuir executável em Node é o NPM. Publicado, ele deixa de exigir clone do repositório: o cliente MCP roda `npx -y @escopo/pacote@latest` e pronto.

### Preparando o pacote

Três coisas transformam o projeto num MCP instalável:

```jsonc
{
  "bin": { "danielg-favero-customers-mcp": "./src/index.ts" }, // o comando que o npx executa
  "files": ["src"],                                            // só o src vai para o tarball
  "scripts": { "build": "chmod 755 src/index.ts" }             // torna o entrypoint executável
}
```

Mais o **shebang** na primeira linha do entrypoint, que é o que permite executá-lo direto:

```ts
#!/usr/bin/env node
```

Note que o `bin` aponta para um `.ts`: como o Node 24 roda TypeScript nativamente, não há passo de build — o "build" aqui é só ajustar permissão do arquivo.

### Registry privado com Verdaccio

Antes de publicar no registry público (ou para MCPs internos que nunca sairão da empresa), vale subir um registry local com o [Verdaccio](https://verdaccio.org/):

```yaml
services:
  verdaccio:
    image: verdaccio/verdaccio:6
    container_name: "verdaccio"
    ports:
      - "4873:4873"
```

```bash
docker compose up -d                              # registry em http://localhost:4873
npm login --registry http://localhost:4873        # o primeiro login já cria o usuário
npm version patch && npm publish --registry http://localhost:4873
```

Para o NPM público é o mesmo fluxo trocando a URL — e, em pacote com escopo, `--access public`:

```bash
npm login --registry https://registry.npmjs.org/
npm version patch && npm publish --access public --registry https://registry.npmjs.org/
```

### Consumindo o pacote publicado

Do lado do cliente, muda só o `command`/`args` — o servidor continua o mesmo:

```jsonc
{
  "servers": {
    "customers-mcp": {
      "command": "npx",
      "args": ["-y", "@escopo/customers-mcp@latest"],
      // do registry privado:
      // "args": ["-y", "--registry", "http://localhost:4873", "@escopo/customers-mcp@latest"],
      "env": { "SERVICE_TOKEN": "..." }
    }
  }
}
```

O `-y` evita o prompt de confirmação do `npx` — importante porque quem executa esse comando é o cliente MCP, sem ninguém para responder.

## Usando MCP com o LangChain

Fechando o ciclo: no [01](./01-multiple-mcp-tools/) o agente consumia MCPs de terceiros; agora ele consome **o MCP que você escreveu e publicou**. Do ponto de vista do agente não há diferença nenhuma — é essa a graça do protocolo.

O projeto [06-mcp-with-langchain](./06-mcp-with-langchain/) mostra isso: um agente LangGraph que fala com o `customers-mcp` (via `npx`, do NPM) e com o servidor de filesystem ao mesmo tempo.

### MultiServerMCPClient

O adaptador [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters) converte tools MCP em tools do LangChain. Você declara os servidores e ele devolve a lista pronta para entregar ao agente:

```ts
const client = new MultiServerMCPClient({
  mcpServers: {
    "customers-mcp": {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@escopo/customers-mcp@latest"],
      env: { SERVICE_TOKEN: process.env.SERVICE_TOKEN! },
    },
    filesystem: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", `${process.cwd()}/data`],
    },
  },
});

const tools = await client.getTools();
```

Cada servidor vira um processo filho, e `getTools()` achata tudo numa lista só. O modelo não sabe de qual servidor veio cada tool — e é exatamente por isso que ele consegue encadear as duas famílias sozinho ("crie 3 clientes e salve o resultado em `users.json`" vira chamadas ao `customers-mcp` seguidas de uma ao `filesystem`).

### Passando credenciais para o servidor

O campo `env` da configuração é o que substitui o `mcp.json` do VS Code: o adaptador sobe o processo filho com aquelas variáveis, e o servidor MCP lê `process.env.SERVICE_TOKEN` como faria em qualquer outro cliente.

Isso mantém a credencial **fora do alcance do modelo** — ela vive no processo, não no schema de nenhuma tool. Vale falhar cedo se ela não estiver presente, tanto no agente quanto no servidor: um MCP que sobe sem token só vai revelar o problema como um `401` no meio de uma conversa.

### MCP no VS Code vs. MCP dentro do agente

O mesmo servidor atende os dois casos sem mudar uma linha:

| | Cliente MCP | Onde fica a config | Quem escreve o prompt |
| --- | --- | --- | --- |
| **VS Code / Copilot** | O editor | `.vscode/mcp.json` | Você, no chat |
| **Agente LangGraph** | `MultiServerMCPClient` | `src/tools/*.ts` | O system prompt do nó |

A troca de perspectiva importa: no VS Code o MCP é uma **ferramenta de desenvolvimento**; dentro do agente ele é uma **dependência da aplicação** — versionada no `package.json`, com credencial vinda do ambiente e comportamento guiado por um prompt que você controla.
