# APIs de IA Generativa e Prompt Engineering

## Projetos

Exemplos práticos desenvolvidos ao longo da disciplina. Cada pasta tem seu próprio `README.md` com contexto e instruções de execução.

| #   | Projeto                                          | O que demonstra                                                                  |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| 01  | [OpenRouter Gateway](./01-open-router-gateway/)  | Gateway HTTP (Fastify) que roteia prompts para modelos via OpenRouter            |
| 02  | [LangChain + LangGraph](./02-langchain/)         | Chatbot como grafo de estados com roteamento condicional entre nós               |
| 03  | [Medical Appointment](./03-medical-appointment/) | Agendamento de consultas com saídas estruturadas (Zod) e roteamento por intenção |
| 04  | [Song Recommendation](./04-song-recommendation/) | Recomendador com memória: histórico persistido, preferências e sumarização        |

## Índice de conceitos

- [OpenRouter](#openrouter) — API unificada de LLMs, roteamento e fallback
  - [Lista de modelos e fallback](#lista-de-modelos-e-fallback)
  - [Roteamento por provedor](#roteamento-por-provedor)
- [LangChain](#langchain) — framework para aplicações com LLMs
  - [LangGraph](#langgraph) — orquestração como grafo de estados
  - [Saídas estruturadas](#saídas-estruturadas) — respostas tipadas e validadas com Zod
  - [LangSmith](#langsmith) — observabilidade e tracing
- [Gerenciamento de memória](#gerenciamento-de-memória) — histórico e contexto entre conversas
  - [Short Term memory](#short-term-memory) — histórico da thread (checkpointer)
  - [Long Term memory](#long-term-memory) — preferências entre conversas (store)
  - [Boas práticas](#boas-práticas) — sumarização para não estourar o contexto

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

### Saídas estruturadas

Por padrão uma LLM devolve **texto livre**, o que obriga a fazer _parsing_ frágil para extrair dados. Com **saídas estruturadas** (`structured output`), você descreve o formato esperado com um schema [Zod](https://zod.dev) e o modelo é forçado a responder exatamente nesse formato — já tipado e validado, sem alucinação de estrutura.

No LangChain isso é feito criando um agente com uma estratégia de resposta a partir do schema:

```ts
const agent = createAgent({
  model: llmModel,
  tools: [],
  responseFormat: providerStrategy(outputSchema), // schema Zod
});

const { structuredResponse } = await agent.invoke({ messages });
```

É a base para **classificar intenção** e **extrair entidades** de uma frase em linguagem natural. Veja o projeto [03-medical-appointment](./03-medical-appointment/), onde a mensagem do paciente vira um objeto com `intent`, profissional, data/hora e nome — usado para rotear e executar a ação.

### LangSmith

O [LangSmith](https://smith.langchain.com) é a plataforma de **observabilidade** do LangChain. Ele faz o _tracing_ de cada execução — registrando os passos do grafo, entradas/saídas de cada nó, tokens e latência — o que ajuda a depurar, avaliar e melhorar as aplicações. É habilitado por variáveis de ambiente (`LANGSMITH_API_KEY`, `LANGSMITH_TRACING_V2`, `LANGSMITH_PROJECT`).

## Gerenciamento de memória

O langchain / langgraph oferece ferramentas para salvar contexto e histórico de conversas para uso posterior. Existem dois tipos de memória: _Short-term_ e _Long-term_.

### Short Term memory

Memória que vive apenas no nível da thread principal do programa. Usado para armazenar o histórico da conversa

- **Em desenvolvimento**: persiste em memória

```ts
import { MemorySaver, StateGraph } from "@langchain/langgraph";

const checkpointer = new MemorySaver();

const builder = new StateGraph(...);
const graph = builder.compile({ checkpointer });

await graph.invoke(
  { messages: [{ role: "user", content: "hi! i am Bob" }] },
  { configurable: { thread_id: "1" } }
);
```

- **Em produção**: persiste em um banco de dados

```ts
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const DB_URI = "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable";
const checkpointer = PostgresSaver.fromConnString(DB_URI);

const builder = new StateGraph(...);
const graph = builder.compile({ checkpointer });
```

### Long Term memory

Usado para armazenar preferências do usuário ou da aplicação entre conversas

- **Em desenvolvimento**: persiste em memória

```ts
import { InMemoryStore, StateGraph } from "@langchain/langgraph";

const store = new InMemoryStore();

const builder = new StateGraph(...);
const graph = builder.compile({ store });
```

- **Em produção**: persiste em um banco de dados

```ts
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";

const DB_URI = "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable";
const store = PostgresStore.fromConnString(DB_URI);

const builder = new StateGraph(...);
const graph = builder.compile({ store });
```

### Boas práticas

Chega um momento na vida do chat com o usuário em que a janela de contexto pode acabar estourando o limite da LLM. É preciso pensar se vale a pena manter o histórico todo ou **resumir** ele: um nó de sumarização condensa as mensagens antigas em um resumo (ou nas preferências do usuário) e remove-as do histórico, mantendo o contexto enxuto sem perder o que importa.

Veja o projeto [04-song-recommendation](./04-song-recommendation/) para um exemplo completo dos dois tipos de memória em ação — histórico de conversa persistido (short-term), preferências estruturadas entre sessões (long-term) e sumarização automática quando a conversa fica longa.
