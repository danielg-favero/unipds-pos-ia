# 03 - Medical Appointment

Um assistente de **agendamento de consultas médicas** modelado como **grafo de estados** com [LangGraph](https://langchain-ai.github.io/langgraphjs/). O grafo classifica a intenção da mensagem, extrai os dados da consulta em formato estruturado e roteia para o nó que agenda ou cancela — mostrando na prática como usar **saídas estruturadas** e **arestas condicionais** para orquestrar um fluxo de negócio.

## Contexto

Enquanto o [02-langchain](../02-langchain/) foca no roteamento básico de um `StateGraph`, aqui o grafo resolve uma tarefa mais realista: interpretar uma frase em linguagem natural (_"Sou a Maria e quero agendar com o Dr. Alicio para amanhã às 16h"_), transformá-la em dados tipados e executar a ação correspondente contra um serviço de agenda.

O ponto central é a **saída estruturada** (`structured output`): em vez de fazer o parsing manual do texto da LLM, um schema [Zod](https://zod.dev) descreve o formato esperado e o modelo é forçado a responder nesse formato. Assim a intenção (`schedule` / `cancel` / `unknown`) e as entidades (profissional, data/hora, paciente, motivo) chegam já validadas ao restante do grafo.

Conceitos demonstrados:

- **Saídas estruturadas (`structured output`)**: schemas Zod (`IntentSchema`, `MessageSchema`) garantem respostas tipadas e evitam alucinação de formato. Feito via `createAgent` + `providerStrategy` do LangChain.
- **Classificação de intenção + extração de entidades**: um único nó identifica o que o usuário quer e extrai os campos da consulta (inclusive resolvendo datas relativas como "hoje"/"amanhã" e fazendo _fuzzy match_ do nome do profissional para o `id`).
- **Aresta condicional (`addConditionalEdges`)**: roteia a partir da `intent` para o nó de agendar, cancelar, ou direto para a mensagem quando a intenção é desconhecida.
- **Injeção de dependência**: nós são criados por _factories_ (`createSchedulerNode(appointmentService)`) que recebem o cliente da LLM e o serviço de agenda — facilitando testes e trocas.
- **Geração de resposta contextual**: o último nó monta um "cenário" (`schedule_success`, `cancel_error`, `unknown`, …) e pede à LLM uma mensagem amigável, em português, com os detalhes da operação.

## Fluxo do grafo

```
START → identifyIntent ─┬─ schedule ─┐
                        ├─ cancel ───┤→ message → END
                        └─ (unknown/erro) ─┘
```

1. **identifyIntent** — classifica a intenção e extrai os dados da consulta (saída estruturada).
2. **schedule** / **cancel** — validam os campos obrigatórios e executam a ação no `AppointmentService`.
3. **message** — gera a resposta final para o paciente com base no resultado (sucesso ou erro) e a anexa ao histórico como `AIMessage`.

## Estrutura principal (`src/`)

- `index.ts` — ponto de entrada; sobe o servidor na porta `3000`
- `server.ts` — servidor [Fastify](https://fastify.dev) com a rota `POST /chat` (valida o body com JSON Schema)
- `config.ts` — configuração do modelo (OpenRouter): lista de modelos, `temperature` e roteamento por provedor
- `graph/graph.ts` — monta e compila o `StateGraph` (schema do estado, nós e arestas condicionais)
- `graph/factory.ts` — instancia serviços e expõe o grafo para o servidor e para o LangGraph CLI/Studio
- `graph/nodes/` — um arquivo por nó:
  - `identifyIntentNode.ts` — classifica a intenção e extrai as entidades
  - `schedulerNode.ts` — agenda a consulta (valida campos com Zod)
  - `cancellerNode.ts` — cancela a consulta
  - `messageGeneratorNode.ts` — gera a mensagem final ao paciente
- `services/` — `openRouterService.ts` (cliente da LLM com saída estruturada) e `appointmentService.ts` (agenda em memória: profissionais e consultas)
- `prompts/v1/` — os _prompts_ e seus schemas Zod (`identifyIntent.ts`, `messageGenerator.ts`)

### LangSmith

Assim como no projeto anterior, o **[LangSmith](https://smith.langchain.com)** faz o _tracing_ de cada execução do grafo — passos, entradas/saídas de cada nó e latência — habilitado pelas variáveis `LANGCHAIN_*` / `LANGSMITH_*` do `.env`.

## Pré-requisitos

- Node.js >= 24.10 (veja o `engines` do `package.json`) — usa o runner nativo de TypeScript e `--env-file`
- Uma **API key do [OpenRouter](https://openrouter.ai/keys)** (o modelo usado precisa suportar saída estruturada em JSON)
- (Opcional) Uma conta no **[LangSmith](https://smith.langchain.com)** para tracing

## Configuração

Copie o `.env.example` para `.env` e preencha:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Opcional — tracing no LangSmith
LANGSMITH_API_KEY=your_langsmith_api_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=03-medical-appointment
```

## Como rodar

```bash
npm install

# Sobe o servidor em modo watch (http://localhost:3000)
npm run dev

# Abre o LangGraph Studio para visualizar e depurar o grafo
npm run langgraph:serve

# Roda os testes end-to-end
npm run test:e2e
```

Com o servidor no ar, faça uma requisição (o campo `question` exige no mínimo 10 caracteres):

```bash
# Agendar uma consulta
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "Sou a Maria Santos e quero agendar com o Dr. Alicio da Silva para amanhã às 16h para um check-up"}'

# Cancelar uma consulta
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "Cancele minha consulta com a Dra. Ana Pereira hoje às 11h, me chamo Joao da Silva"}'
```

A resposta traz o estado final do grafo — incluindo a `intent` detectada, o resultado da ação e o histórico de `messages` com a resposta gerada ao paciente.

> Os profissionais e consultas ficam em memória, definidos em `services/appointmentService.ts` (ex.: `Dr. Alicio da Silva` — Cardiologia, `Dra. Ana Pereira` — Dermatologia, `Dra. Carol Gomes` — Neurologia).
