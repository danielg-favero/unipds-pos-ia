# OpsPilot

Agente de operações (SRE) que ajuda um plantonista a lidar com alertas e incidentes: lista alertas, abre e resolve incidentes, consulta runbooks e status de provedores. É o projeto prático da disciplina de [Agentes Autônomos](../README.md), construído de forma incremental com **Spec Driven Development** — cada feature tem uma spec em [`specs/`](specs).

## Recursos

- **Estratégias de raciocínio**: `react`, `plan-and-execute`, variantes com reflexão (`reflect:*`), o grafo unificado `production` (roteia sozinho entre as demais) e o modo equipe `team` (supervisor multi-agente)
- **Memória**: histórico de conversa persistente, sumarização, memória semântica (embeddings locais), reflexo de aprendizado e esquecimento
- **Orçamento de contexto**: medição de tokens e limites por bloco (histórico, memórias, resumo)
- **Guardrails**: ações destrutivas passam por aprovação humana (`/chat/:requestId/decision`)
- **Resiliência**: tratamento de erros do provedor e modelo de fallback
- **Observabilidade**: trace de raciocínio persistido, logs estruturados e métricas (chamadas ao LLM, latência, custo)
- **Interfaces**: CLI (`arena`), API HTTP, servidor MCP e a web **War Room Console**

## Requisitos

- Node 24 LTS
- Uma chave do [OpenRouter](https://openrouter.ai) com um modelo que suporte _tool calling_
- MySQL apenas se usar `OPS_STORE=mysql` ou `npm run seed`

## Começando

```bash
npm install
cp .env.example .env   # preencha OPENROUTER_API_KEY e OPENROUTER_MODEL
npm run arena -- "Quais os alertas críticos disparando agora?"
```

### Variáveis de ambiente

| Variável                                                    | Descrição                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`                   | Provedor e modelo (precisa de tool calling)                      |
| `OPENROUTER_MODEL_FALLBACK`                                 | Modelo de reserva na estratégia `react`                          |
| `OPS_STORE`                                                 | `memory`, `json`, `sqlite` ou `mysql`                            |
| `MYSQL_*` / `DATABASE_URL`                                  | Conexão MySQL                                                    |
| `CONTEXT_BUDGET_HISTORY` / `_MEMORIES` / `_SUMMARY`         | Orçamento de tokens por bloco de contexto                        |
| `OPSPILOT_WEB_ORIGIN`                                       | Origem liberada por CORS para a War Room Console                 |
| `PORT`                                                      | Porta da API HTTP (padrão `3000`)                                |

## Scripts

| Comando             | O que faz                                                         |
| ------------------- | ----------------------------------------------------------------- |
| `npm run arena`     | Executa um pedido em uma ou mais estratégias e compara os traces  |
| `npm run bench`     | Roda cenários de benchmark entre estratégias                      |
| `npm run http`      | Sobe a API HTTP                                                   |
| `npm run mcp`       | Sobe o servidor MCP (stdio)                                       |
| `npm run seed`      | Popula o MySQL com dados iniciais                                 |
| `npm test`          | Testes (`node:test` via `tsx`)                                    |
| `npm run typecheck` | Checagem de tipos                                                 |

### Arena (CLI)

```bash
npm run arena -- [--strategies a,b] [--max-iterations N] [--store json|memory|mysql|sqlite] "<pedido>"
```

Sem `--strategies`, todas as estratégias do catálogo rodam sobre o mesmo estado inicial, para uma comparação justa.

## API HTTP

`npm run http` → `http://localhost:3000`. Exemplos em [`curl.examples.bash`](curl.examples.bash).

| Rota                              | Descrição                                           |
| --------------------------------- | --------------------------------------------------- |
| `POST /chat`                      | Envia um pedido (estratégia opcional, padrão `production`) |
| `POST /chat/:requestId/decision`  | Aprova ou rejeita uma ação pendente                 |
| `GET /requests/:id`               | Consulta a requisição e o trace persistido          |
| `GET /stats`                      | Estatísticas de uso                                 |
| `POST /memories`, `GET /memories` | Cria e lista memórias                               |
| `DELETE /memories/:id`            | Esquece uma memória                                 |

## Servidor MCP

[`.mcp.json`](.mcp.json) registra o servidor `opspilot` (`npx tsx src/mcp/server.ts`), permitindo usar as ferramentas do OpsPilot a partir de qualquer cliente MCP, incluindo o Claude Code.

## War Room Console

Interface web (React + Vite) em [`web/`](web):

```bash
npm run http                 # terminal 1
cd web && npm install && npm run dev   # terminal 2 → http://localhost:5173
```

## Arquitetura

```
src/
├── agents/    estratégias (react, plan-and-execute, reflection, production), tools, guardrails
├── team/      modo equipe: supervisor + papéis (analista, planejador, executor) sobre um blackboard
├── memory/    memória semântica, embeddings, reflexo de aprendizado, sumarização
├── context/   contagem de tokens e orçamento de contexto
├── store/     portas e adaptadores (memory, json, sqlite, sequelize/mysql)
├── domain/    tipos, erros, trace, preços — funções puras, sem I/O
├── http/      API Express
├── mcp/       servidor MCP
├── cli/       parsing de argumentos
├── obs/       logger estruturado
└── bench/     cenários de benchmark
```

Regras da [constituição](specs/constitution.md): camadas `http`/`cli` → `service` → `store`; validação com Zod na fronteira; erros de domínio; testes como parte da tarefa; guardrails em vez de confiança no modelo; spec antes de código; tarefas pequenas e reversíveis.

## Roadmap por spec

| Spec  | Feature                                  | Spec  | Feature                            |
| ----- | ---------------------------------------- | ----- | ---------------------------------- |
| `001` | Estratégias de raciocínio (núcleo)       | `010` | Medição de contexto                |
| `002` | Camada de reflexão                       | `011` | Sumarização de histórico           |
| `003` | Persistência SQLite                      | `012` | Orçamento de contexto              |
| `004` | Tool de status do provedor               | `013` | Grafo unificado com roteador       |
| `005` | Servidor MCP                             | `014` | Resiliência do modelo              |
| `006` | Endpoint HTTP `/chat`                    | `015` | Trace persistido e logs            |
| `007` | Conversa persistente                     | `016` | War Room Console                   |
| `008` | Memória semântica                        | `017` | Modo equipe (multi-agente)         |
| `009` | Reflexo de aprendizado                   |       |                                    |

## Fluxo de desenvolvimento (SDD)

Mudanças relevantes seguem `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`, com revisão humana entre as fases. As skills ficam em [`.claude/skills`](.claude/skills) e os templates em [`.specify/`](.specify).
