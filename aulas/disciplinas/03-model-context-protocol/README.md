# Model Context Protocol (MCP)

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

### Importante

**O MCP não substitui as tools** — pelo contrário, ele é o padrão utilizado para disponibilizá-las de forma estruturada ao modelo.

## Agents

São pequenos prompts que executam uma tarefa específica. Com o `claude` é possível criar um agente com:

```claude
create a ... agent that ...
```

Há alguns hubs que disponibilizam uma lista pronta de agents para desenvolvimento de software:

- [Awesome Copilot Agents](https://github.com/github/awesome-copilot/tree/main/agents)
- [Awesome Code Agents](https://github.com/sorrycc/awesome-code-agents)

## Skills

São habilidades para a LLM utilizar durante a execução. Diferente dos agents, as skills são chamadas durante a execução e os agents são selecionados para realizar uma tarefa, ou seja, agents chamas skills que precisam ser utilizadas.

A vercel disponibiliza um hub de skills prontas: [Vercel Skills](https://www.skills.sh/)
