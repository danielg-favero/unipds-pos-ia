# Model Context Protocol (MCP)

## Projetos

Exemplos práticos desenvolvidos ao longo da disciplina. Cada pasta tem seu próprio `README.md` com contexto e instruções de execução.

| #   | Projeto                                            | O que demonstra                                                                          |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 01  | [Multiple MCP Tools](./01-multiple-mcp-tools/)      | Agente LangGraph consumindo vários servidores MCP (MongoDB, filesystem) via stdio + tool própria |
| 02  | [Skills](./02-skills/)                              | Instalação e uso de Agent Skills (`npx skills`) para processamento de vídeo com FFmpeg      |

## Índice de conceitos

- [O que é o MCP](#o-que-é-o-mcp)
  - [Contexto histórico](#contexto-histórico)
  - [Function Calling vs. MCP](#function-calling-vs-mcp)
  - [Como funciona](#como-funciona)
- [Agents](#agents)
- [Skills](#skills)
  - [Skills vs. MCP vs. Agents](#skills-vs-mcp-vs-agents)

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

| Conceito   | O que é                                                    | Onde roda                                          |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| **MCP**    | Protocolo para conectar o modelo a **serviços externos** (bancos de dados, APIs, sistemas de arquivos) | Servidor separado (processo `stdio` ou HTTP)         |
| **Skill**  | **Conhecimento/instruções** empacotadas (Markdown + exemplos) que o agente lê e segue          | Arquivo local (`SKILL.md`), carregado no contexto     |
| **Agent**  | Um **prompt especializado** selecionado para executar uma tarefa, que pode usar MCPs e Skills   | Definição de agente (config/prompt)                   |
