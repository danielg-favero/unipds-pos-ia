# 07 - Document Analysis (Q&A multimodal sobre PDF)

Pipeline de **perguntas e respostas sobre documentos PDF** usando um **modelo multimodal** (com suporte a visão) via [OpenRouter](https://openrouter.ai). Diferente de um RAG tradicional, aqui **não há chunking, embeddings ou vector store**: o PDF inteiro é enviado como conteúdo `image_url` (base64) diretamente na mensagem para o modelo, que lê e responde sobre o documento em uma única chamada.

## Contexto

O usuário envia um arquivo PDF e uma pergunta em uma única requisição multipart. O servidor converte o arquivo para base64 e monta uma mensagem multimodal — texto (a pergunta) + o documento — para um modelo com capacidade de visão (ex.: `google/gemini-2.5-flash-lite-preview-09-2025`). O modelo "lê" o PDF diretamente e responde em linguagem natural.

Conceitos demonstrados:

- **Modelos multimodais via OpenRouter**: o mesmo `ChatOpenAI` apontando para o endpoint do OpenRouter aceita mensagens com múltiplas partes de conteúdo (`text` + `image_url`), desde que o modelo escolhido suporte visão.
- **Documento como `image_url` em base64**: `data:application/pdf;base64,<...>` é enviado como se fosse uma imagem — não é necessário extrair texto do PDF, converter páginas em imagens ou rodar OCR.
- **Grafo mínimo**: um único nó (`answerGeneration`) — útil para contrastar com pipelines mais complexos (multi-nó, RAG com grafo) vistos nos outros projetos da disciplina.
- **Upload via multipart**: `@fastify/multipart` recebe o arquivo e o campo `question` na mesma requisição.

## Fluxo do grafo

```
START → answerGeneration → END
```

**answerGeneration** — se não houver documento no estado, retorna uma mensagem de aviso; caso contrário, monta o prompt (system + pergunta do usuário) e chama `generateWithDocument`, que envia o PDF em base64 junto da pergunta para o modelo multimodal.

## Estrutura principal (`src/`)

- `index.ts` — sobe o servidor e, ao iniciar, dispara automaticamente uma requisição de teste (`POST /chat`) usando o PDF de exemplo em `docs/`
- `server.ts` — Fastify + `@fastify/multipart`; rota `POST /chat` recebe o arquivo e o campo `question`, valida tipo (`application/pdf`) e tamanho mínimo da pergunta, converte o arquivo para base64 e invoca o grafo
- `config.ts` — modelo do OpenRouter (precisa suportar visão) e roteamento por provedor (`throughput`)
- `graph/graph.ts` — schema Zod do estado (`messages`, `documentBase64`, `error`) e montagem do `StateGraph` de nó único
- `graph/factory.ts` — instancia o serviço e expõe o grafo compilado
- `graph/nodes/answerGenerationNode.ts` — único nó do grafo; chama o serviço multimodal e retorna a resposta como `AIMessage`
- `services/openrouterService.ts` — monta a mensagem multimodal (`text` + `image_url` em base64) e chama o modelo

`docs/a-comprehensive-overview-of-large-language-models.pdf` — documento de exemplo usado no teste automático do `index.ts` (artigo [_"A Comprehensive Overview of Large Language Models"_](https://arxiv.org/pdf/2307.06435)).

## Pré-requisitos

- Node.js >= 24.10 (veja o `engines` do `package.json`) — usa `--experimental-strip-types` e `--env-file`
- Uma **API key do [OpenRouter](https://openrouter.ai/keys)** com acesso a um modelo com suporte a visão (o padrão configurado é `google/gemini-2.5-flash-lite-preview-09-2025`)

## Configuração

Copie o `.env.example` para `.env` e preencha:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here

LANGSMITH_API_KEY=your_langsmith_api_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=07-doc-analysis
```

## Como rodar

```bash
npm install

# Sobe o servidor na porta 4000 (e roda um teste automático com o PDF de docs/)
npm run dev
```

Enviando seu próprio PDF:

```bash
curl -X POST http://localhost:4000/chat \
  -F "file=@document.pdf" \
  -F "question=Do que se trata este documento?"
```

Outros comandos úteis:

```bash
npm run langgraph:serve # abre o LangGraph Studio para visualizar e depurar o grafo
```

> **Limitação**: sem chunking/RAG, o documento inteiro é enviado em cada requisição — funciona bem para PDFs curtos, mas não escala para documentos muito longos (limite de tokens/tamanho de payload do modelo).
