# 07 - Neo4j + RAG

Implementação de um pipeline de **RAG** (_Retrieval-Augmented Generation_) que responde perguntas sobre um PDF usando **busca vetorial no Neo4j** + uma **LLM** via OpenRouter.

## Contexto

Este é o exemplo mais completo da disciplina e junta vários conceitos:

1. **Ingestão**: o `tensores.pdf` é carregado e quebrado em pedaços (`chunks`) com `chunkSize` 1000 e `chunkOverlap` 200.
2. **Embeddings**: cada chunk é transformado em vetor usando modelos do HuggingFace Transformers (`@langchain/community`).
3. **Armazenamento vetorial**: os vetores são gravados no **Neo4j** (rodando via Docker) usando o `Neo4jVectorStore`.
4. **Retrieval + Geração**: para cada pergunta, busca-se os chunks mais relevantes (top-K) e injeta-se esse contexto numa LLM (`ChatOpenAI` apontando para o **OpenRouter**) que gera a resposta.
5. **Saída**: cada resposta é salva como Markdown na pasta `answers/`.

Estrutura principal (`src/`):

- `index.ts` — orquestra o pipeline (ingestão → embeddings → store → perguntas)
- `document-processor.ts` — carrega e divide o PDF
- `ai.ts` — monta a chain de RAG (retrieval + prompt + LLM)
- `config.ts` — centraliza configuração (lida de variáveis de ambiente)
- `prompts/` — template e configuração do prompt de resposta

## Pré-requisitos

- Node.js 22
- **Docker** (para subir o Neo4j)
- Uma **API key do [OpenRouter](https://openrouter.ai)**

## Configuração

Copie o `.env.example` para `.env` e preencha:

```env
# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_SITE_URL=
OPENROUTER_SITE_NAME=

# Modelos
NLP_MODEL=            # modelo de linguagem (ex.: um modelo do OpenRouter)
EMBEDDING_MODEL=      # modelo de embeddings do HuggingFace

# Neo4j (compatível com o docker-compose deste projeto)
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_URI=bolt://localhost:7687
NEO4J_DATABASE=neo4j

NEO4J_VECTOR_THRESHOLD=
```

## Como rodar

```bash
npm ci

# Sobe o Neo4j em background (Neo4j Browser em http://localhost:7474)
npm run infra:up

# Roda o pipeline de RAG
npm start
# ou, em modo watch:
npm run dev

# Ao terminar, derruba a infra e remove os volumes
npm run infra:down
```

As respostas geradas ficam em `answers/`.
