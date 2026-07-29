# Model Context Protocol (MCP)

## Projetos

Exemplos práticos desenvolvidos ao longo da disciplina. Cada pasta tem seu próprio `README.md` com contexto e instruções de execução.

| #   | Projeto                                                  | O que demonstra                                                                                  |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 01  | [Multiple MCP Tools](./01-multiple-mcp-tools/)           | Agente LangGraph consumindo vários servidores MCP (MongoDB, filesystem) via stdio + tool própria |
| 02  | [Skills](./02-skills/)                                   | Instalação e uso de Agent Skills (`npx skills`) para processamento de vídeo com FFmpeg           |
| 03  | [MCP Server from Scratch](./03-mcp-server-from-scratch/) | Servidor MCP próprio com tools, resource e prompt, testado via SDK de cliente e Inspector        |
| 04  | [API as MCP](./04-api-as-mcp/)                           | Servidor MCP que embrulha uma API REST existente (Fastify + MongoDB), expondo ações ao agente    |

Os quatro formam uma progressão: **consumir** servidores MCP → dar contexto ao agente sem servidor algum → **construir** o servidor → **embrulhar um sistema que já existe** com ele.

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

| Camada           | Responsabilidade                                                     |
| ---------------- | -------------------------------------------------------------------- |
| `domain`         | Schemas Zod e tipos — reaproveitados como `inputSchema`/`outputSchema` |
| `infrastructure` | O cliente HTTP: o único lugar que sabe que a API é REST e onde ela vive |
| `application`    | As **ações**: onde uma intenção se traduz em uma ou mais chamadas     |
| `mcp`            | Só tradução — argumentos do modelo em chamadas de serviço e de volta   |

O resource ganha importância nesse cenário: publicar um "mapa" do sistema embrulhado (base URL, endpoints, formato dos recursos) dá ao agente o contexto de domínio antes de ele escolher a tool.
