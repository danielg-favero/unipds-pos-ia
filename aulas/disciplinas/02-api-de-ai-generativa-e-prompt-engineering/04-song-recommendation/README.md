# 04 - Song Recommendation

Um **recomendador de músicas** conversacional modelado como **grafo de estados** com [LangGraph](https://langchain-ai.github.io/langgraphjs/). O foco aqui é o **gerenciamento de memória**: o chat lembra do usuário entre mensagens e entre sessões, extrai suas preferências musicais em formato estruturado e resume conversas longas antes que o histórico cresça demais.

## Contexto

Enquanto o [03-medical-appointment](../03-medical-appointment/) usa saídas estruturadas para orquestrar um fluxo de negócio, aqui o mesmo recurso serve para **construir memória**. O assistente conversa naturalmente, recomenda músicas e, a cada mensagem, decide se o usuário revelou algo novo sobre si (nome, idade, gêneros, bandas, humor). Esses dados são extraídos, validados com [Zod](https://zod.dev) e persistidos — de modo que o bot "se lembra" do usuário mesmo numa conversa futura.

O projeto combina **dois tipos de memória** (os mesmos descritos no [README da disciplina](../README.md#gerenciamento-de-memória)):

- **Short-term (memória de conversa)**: o histórico de `messages` de cada thread, persistido pelo _checkpointer_ e pelo _store_ do LangGraph em **PostgreSQL**. Cada usuário/sessão tem um `thread_id` isolado; o `store` compartilha estado entre threads do mesmo usuário.
- **Long-term (preferências do usuário)**: um perfil estruturado (nome, idade, gêneros e bandas favoritas, contexto) guardado em **SQLite** (`preferences.db`) pelo `PreferencesService`, sobrevivendo entre reinícios e entre conversas.

Além disso, para não estourar a janela de contexto, um nó de **sumarização** entra em ação quando a conversa passa de `maxMessagesToSummary` mensagens (padrão `6`): ele resume o diálogo nas preferências do usuário e **remove** as mensagens antigas do histórico com `RemoveMessage`.

Conceitos demonstrados:

- **Memória short-term com checkpointer/store**: `PostgresSaver` e `PostgresStore` compilados no grafo (`graph.compile({ checkpointer, store })`) fazem o _replay_ automático do histórico por `thread_id`.
- **Memória long-term estruturada**: `PreferencesService` (SQLite via [Knex](https://knexjs.org)) faz o _merge_ incremental das preferências extraídas, deduplicando gêneros e bandas.
- **Saídas estruturadas (`structured output`)**: `ChatResponseSchema` e `SummarySchema` (Zod) via `createAgent` + `providerStrategy`; o modelo devolve a resposta e as preferências extraídas já tipadas.
- **Arestas condicionais**: após o chat, o grafo roteia para salvar preferências, sumarizar ou encerrar, dependendo do estado.
- **Compactação de histórico (`summarization`)**: resume e poda mensagens antigas para manter o contexto enxuto.
- **Injeção de dependência**: nós são criados por _factories_ (`createChatNode(llmClient, preferencesService)`) que recebem o cliente da LLM e os serviços.

## Fluxo do grafo

```
START → chat ─┬─ savePreferences ─┬─ summarize → END
              │                   └─ END
              ├─ summarize → END
              └─ END
```

1. **chat** — gera a resposta ao usuário (saída estruturada) e decide se há preferências novas a salvar e se a conversa precisa ser resumida.
2. **savePreferences** — faz o _merge_ das preferências extraídas no perfil do usuário (SQLite).
3. **summarize** — resume o histórico nas preferências, poda mensagens antigas (`RemoveMessage`) e limpa o flag de sumarização.

## Estrutura principal (`src/`)

- `index.ts` — CLI interativo de chat; identifica o usuário via `--user`, carrega o contexto salvo e conversa em loop no terminal
- `config.ts` — configuração do modelo (OpenRouter), URI do Postgres e `maxMessagesToSummary`
- `graph/graph.ts` — monta e compila o `StateGraph` (schema do estado, nós, arestas condicionais e a memória)
- `graph/factory.ts` — instancia serviços e expõe o grafo para o CLI e para o LangGraph CLI/Studio
- `graph/nodes/` — um arquivo por nó:
  - `chatNode.ts` — gera a resposta e extrai preferências (saída estruturada)
  - `savePreferencesNode.ts` — persiste as preferências extraídas
  - `summarizationNode.ts` — resume a conversa e poda o histórico
  - `edgeConditions.ts` — funções de roteamento das arestas condicionais
- `services/` —
  - `openrouterService.ts` — cliente da LLM (`ChatOpenAI` apontado ao OpenRouter) com `generateStructured`
  - `memoryService.ts` — inicializa o `checkpointer` e o `store` (PostgreSQL) da memória de conversa
  - `preferencesService.ts` — perfil long-term do usuário em SQLite (Knex)
- `prompts/v1/` — os _prompts_ e seus schemas Zod (`chatResponse.ts`, `summarization.ts`)

### LangSmith

Assim como nos projetos anteriores, o **[LangSmith](https://smith.langchain.com)** faz o _tracing_ de cada execução do grafo — passos, entradas/saídas de cada nó e latência — habilitado pelas variáveis `LANGCHAIN_*` / `LANGSMITH_*` do `.env`.

## Pré-requisitos

- Node.js >= 24.10 (veja o `engines` do `package.json`) — usa o runner nativo de TypeScript e `--env-file`
- **Docker** — o PostgreSQL da memória de conversa sobe via `docker-compose`
- Uma **API key do [OpenRouter](https://openrouter.ai/keys)** (o modelo usado precisa suportar saída estruturada em JSON)
- (Opcional) Uma conta no **[LangSmith](https://smith.langchain.com)** para tracing

## Configuração

Copie o `.env.example` para `.env` e preencha:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_HTTP_REFERER=http://localhost:3000
OPENROUTER_X_TITLE=Song-Recommender

# Opcional — tracing no LangSmith
LANGSMITH_API_KEY=your_langsmith_api_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=04-song-highlights
```

> A URI do PostgreSQL da memória de conversa está definida em `src/config.ts` (`memory.dbUri`) e corresponde ao serviço do `docker-compose.yml`.

## Como rodar

```bash
npm install

# Sobe o PostgreSQL (memória de conversa)
npm run docker:up

# Inicia o chat no terminal para um usuário
npm run chat:daniel     # ou: npm run chat:gabriel

# Abre o LangGraph Studio para visualizar e depurar o grafo
npm run langgraph:serve

# Roda os testes end-to-end
npm test

# Encerra o PostgreSQL
npm run docker:down
```

Cada script `chat:*` passa `--user <nome>`, o que define o `userId` usado para carregar e salvar o perfil. Na primeira conversa o assistente se apresenta e pergunta suas preferências; em sessões seguintes ele reconhece o que já sabe sobre você e recomenda músicas com base nisso. Digite `exit` para sair.

Exemplo de diálogo:

```
👤 Usuário: daniel
💬 Thread da Conversa: daniel-1720000000000

AI: Olá! Sou seu assistente musical! Que tipo de música você gosta? Me conta seu nome também! 🎵
Você: Meu nome é Daniel e curto rock e metal
AI: E aí, Daniel! Rock e metal é demais! Recomendo "Master of Puppets" do Metallica...
```

> As preferências ficam em `preferences.db` (SQLite) e são compartilhadas entre todas as threads do mesmo usuário; a memória de conversa de cada thread fica no PostgreSQL.
