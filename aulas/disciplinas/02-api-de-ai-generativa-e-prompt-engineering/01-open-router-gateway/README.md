# 01 - OpenRouter Gateway

Um gateway HTTP simples que expõe uma rota `/chat` e delega a geração de texto para o **[OpenRouter](https://openrouter.ai)** — uma API unificada que dá acesso a centenas de modelos de LLM através de um único endpoint, com _fallback_ automático e roteamento por custo.

## Contexto

O projeto sobe um servidor [Fastify](https://fastify.dev) que recebe uma pergunta e responde com o texto gerado por uma LLM. Em vez de falar direto com um provedor (OpenAI, Anthropic, etc.), a chamada passa pelo OpenRouter, que decide qual provedor usar com base nas preferências de roteamento.

Conceitos demonstrados:

- **API unificada**: um mesmo `client` conversa com qualquer modelo do catálogo do OpenRouter.
- **Lista de modelos + fallback**: em `config.ts` é passado um _array_ de modelos; se o primeiro falhar ou não estiver disponível, o OpenRouter tenta o próximo.
- **Roteamento por provedor**: `provider.sort.by` define como escolher o provedor de infraestrutura de um modelo — `price` (mais barato), `latency` (mais rápido) ou `throughput` (mais vazão).
- **Parâmetros de geração**: `temperature` (0.2, mais preciso/determinístico) e `maxTokens` (limita o tamanho da resposta).
- **`system prompt`**: condiciona o comportamento do modelo antes da mensagem do usuário.

Estrutura principal (`src/`):

- `index.ts` — ponto de entrada; instancia o serviço e sobe o servidor na porta `3333`
- `server.ts` — servidor Fastify com a rota `POST /chat` (valida o body com JSON Schema)
- `openrouter-service.ts` — encapsula o `@openrouter/sdk` e monta a chamada `chat.send`
- `config.ts` — centraliza a configuração (modelos, temperatura, roteamento) lida das variáveis de ambiente

## Pré-requisitos

- Node.js 22 (veja o `.tool-versions` da disciplina) — usa o runner nativo de TypeScript e `--env-file`
- Uma **API key do [OpenRouter](https://openrouter.ai/keys)**

## Configuração

Copie o `.env.example` para `.env` e preencha:

```env
OPENROUTER_API_KEY=your-api-key
```

## Como rodar

```bash
npm install

# Sobe o servidor em modo watch (http://localhost:3333)
npm run dev

# Roda os testes
npm test
```

Com o servidor no ar, faça uma requisição:

```bash
curl -X POST http://localhost:3333/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "Hello"}'
```

A resposta traz o `model` que efetivamente respondeu e o `content` gerado.
