# APIs de IA Generativa e Prompt Engineering

## Projetos

Exemplos práticos desenvolvidos ao longo da disciplina. Cada pasta tem seu próprio `README.md` com contexto e instruções de execução.

| # | Projeto | O que demonstra |
|---|---------|-----------------|
| 01 | [OpenRouter Gateway](./01-open-router-gateway/) | Gateway HTTP (Fastify) que roteia prompts para modelos via OpenRouter |
| 02 | [LangChain + LangGraph](./02-langchain/) | Chatbot como grafo de estados com roteamento condicional entre nós |

## Índice de conceitos

- [OpenRouter](#openrouter) — API unificada de LLMs, roteamento e fallback
  - [Lista de modelos e fallback](#lista-de-modelos-e-fallback)
  - [Roteamento por provedor](#roteamento-por-provedor)
- [LangChain](#langchain) — framework para aplicações com LLMs
  - [LangGraph](#langgraph) — orquestração como grafo de estados
  - [LangSmith](#langsmith) — observabilidade e tracing

## OpenRouter

O [OpenRouter](https://openrouter.ai) é uma **API unificada** que dá acesso a centenas de modelos de LLM (OpenAI, Anthropic, Google, Cohere, modelos open weights, etc.) através de um **único endpoint** compatível com o formato de chat da OpenAI. Em vez de integrar cada provedor separadamente, você fala com o OpenRouter e ele cuida do resto.

Vantagens:

1. Um único `client` e uma única API key para todos os modelos
2. _Fallback_ automático quando um modelo ou provedor está indisponível
3. Roteamento por custo, latência ou vazão
4. Facilidade para comparar e trocar modelos sem mudar código

### Lista de modelos e fallback

Ao enviar a requisição, é possível passar uma **lista de modelos** em vez de um só. Se o primeiro não estiver disponível (ou falhar), o OpenRouter tenta o próximo automaticamente.

```ts
const response = await client.chat.send({
  models: ["cohere/north-mini-code:free"], // ordem de preferência
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: prompt },
  ],
  temperature: 0.2,
  maxTokens: 50,
});
```

### Roteamento por provedor

Um mesmo modelo pode ser servido por vários provedores de infraestrutura. O OpenRouter permite escolher **como** rotear entre eles através de `provider.sort`:

- `price` — o provedor mais barato (padrão)
- `latency` — o mais rápido a responder
- `throughput` — o de maior vazão

```ts
provider: {
  sort: {
    by: "price", // "price" | "latency" | "throughput"
    partition: "none",
  },
}
```

> Também existem atalhos no _slug_ do modelo: `:floor` ordena por preço e `:nitro` por vazão (ex.: `meta-llama/llama-3.3-70b-instruct:floor`).

## LangChain

[LangChain](https://js.langchain.com) é um framework open source (Python e TypeScript) para construir aplicações e agentes com LLMs. Ele oferece uma interface padrão para modelos, mensagens, ferramentas e memória, além de abstrações para orquestrar fluxos mais complexos.

### LangGraph

O [LangGraph](https://langchain-ai.github.io/langgraphjs/) é a parte do ecossistema voltada para **orquestração**. Ele modela a lógica como um **grafo de estados** (`StateGraph`):

- **Estado (`state`)**: um objeto compartilhado (definido com [Zod](https://zod.dev)) que flui pelo grafo — inclui, por exemplo, o histórico de `messages`.
- **Nós (`nodes`)**: funções `(state) => state` que leem e atualizam o estado; a saída de um nó é a entrada do próximo.
- **Arestas (`edges`)**: definem a ordem entre nós, com `START` e `END` marcando início e fim.
- **Arestas condicionais (`conditional edges`)**: escolhem o próximo nó dinamicamente, com base no estado atual (roteamento).

Isso permite fluxos com ramificações, ciclos e decisões — algo difícil de expressar com uma única chamada linear à LLM. Veja o projeto [02-langchain](./02-langchain/) para um exemplo completo.

### LangSmith

O [LangSmith](https://smith.langchain.com) é a plataforma de **observabilidade** do LangChain. Ele faz o _tracing_ de cada execução — registrando os passos do grafo, entradas/saídas de cada nó, tokens e latência — o que ajuda a depurar, avaliar e melhorar as aplicações. É habilitado por variáveis de ambiente (`LANGSMITH_API_KEY`, `LANGSMITH_TRACING_V2`, `LANGSMITH_PROJECT`).
