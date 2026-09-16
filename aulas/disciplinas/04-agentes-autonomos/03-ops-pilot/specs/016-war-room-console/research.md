# Research: War Room Console

## 1. Como sinalizar "ação pendente de aprovação" no contrato HTTP

**Decision**: `POST /chat` responde `202 Accepted` com
`{ requestId, conversation, pendingApproval: { id, tool, args, description } }` quando a execução do
agente parar num ponto de aprovação; o corpo não inclui `answer`/`trace` finais (a execução ainda não
terminou). Um novo endpoint `POST /chat/:requestId/decision` com `{ decision: "approve" | "deny" }`
retoma a execução e retorna o `StrategyRun` completo (200, mesmo shape do `/chat` de sucesso hoje) —
ou, se a decisão já havia sido tomada, `409` com a decisão registrada (idempotência, SC-005).

**Rationale**: Reaproveita o formato de resposta que `/chat` já usa para sucesso, só adicionando um novo
status e um payload menor; mantém o front simples (um único formato de erro por status). `requestId` já
é gerado por requisição (015) e serve naturalmente como chave da aprovação pendente.

**Alternatives considered**:
- *Long-poll/streaming (SSE/WebSocket) até a aprovação ser dada*: mais próximo de "tempo real", mas
  exige manter a conexão HTTP aberta por tempo indefinido (minutos/horas até um humano decidir) — não
  cabe no timeout de 180s já existente e complica o backend sem necessidade, já que a spec não pede
  atualização em tempo real, só que o cartão persista entre reloads.
- *Modelar aprovação como mais um `TraceEvent`*: mistura um estado que bloqueia a execução com o log
  histórico de eventos já concluídos; dificulta saber "isso ainda está pendente?" sem escanear o trace.

## 2. Onde fica o guardrail de aprovação no backend

**Decision**: Guardrail na camada de `store`/execução da estratégia, não nas tools do MCP: antes de
`open_incident`/`resolve_incident` serem efetivamente chamadas pelo grafo de produção, a execução
verifica se a ação está na lista de ações sensíveis e, se sim, persiste um registro de aprovação
pendente e interrompe a execução devolvendo-o — o `resolve`/`decision` endpoint é quem efetivamente
invoca a tool ao aprovar.

**Rationale**: Constitution (Camadas Explícitas, Segurança por Padrão) pede que ações destrutivas passem
por guardrails, "não pela confiança no modelo" — um guardrail na camada de execução, fora do controle do
LLM, garante que a tool não roda mesmo que o modelo "decida" pular a confirmação.

**Alternatives considered**:
- *Guardrail dentro da tool MCP*: exigiria a tool "pausar" no meio da chamada, o que o protocolo MCP não
  suporta bem (chamada de tool é request/response único); a tool viraria responsável por lógica de
  workflow que não é dela.

## 3. CORS

**Decision**: `cors` (pacote já popular no ecossistema Express, mesma geração de dependências do
projeto) configurado com origem allow-list vinda de env (`OPSPILOT_WEB_ORIGIN`, ex.:
`http://localhost:5173` em dev), sem `*` quando `credentials` não é necessário (não há cookies —
autenticação de operador está fora do escopo, FR-001 assumption).

**Rationale**: Simples, testável, e evita abrir a API para qualquer origem por padrão (Segurança por
Padrão).

**Alternatives considered**: Middleware CORS manual (poucas linhas) — descartado só porque o pacote
`cors` já cobre preflight (`OPTIONS`) corretamente e é a prática padrão em Express.

## 4. Caminho de base `/opspilot`

**Decision**: Um `express.Router()` monta todas as rotas atuais (`/chat`, `/memories`, `/requests/:id`,
etc.) e a nova rota de decisão; o app raiz faz `app.use("/opspilot", router)`. O `web/` é buildado com
`base: "/opspilot/"` no Vite quando publicado atrás do mesmo caminho, mas a URL da API consumida pelo
front continua configurável (engrenagem) — o front não assume que API e UI compartilham o mesmo host.

**Rationale**: Atende à assunção da spec ("convive com outras aplicações no mesmo domínio") sem acoplar
front e back a estarem no mesmo processo/domínio.

**Alternatives considered**: Hardcode do prefixo em cada handler — descartado, um router evita repetição
e erro de digitação do prefixo.

## 5. Persistência da URL da API no frontend

**Decision**: `localStorage`, chave única (`opspilot:apiUrl`), com um valor padrão de
`window.location.origin` quando vazio.

**Rationale**: FR-014 pede persistência entre sessões sem exigir conta/login (fora de escopo); é uma
preferência por navegador, adequada a `localStorage`. Não há necessidade de sincronizar entre
dispositivos (Assumption: sessão única por operador).

**Alternatives considered**: Cookie — sem vantagem aqui e exigiria decidir atributos (`SameSite`,
expiração) sem necessidade real.

## 6. Renderização do trace tipado

**Decision**: Um componente por `TraceEvent["type"]` (thought/plan/action/observation/critique/answer/
route/fallback), escolhido por um `switch` exaustivo (TS `never` no `default` garante erro de compilação
se um novo tipo for adicionado ao union sem UI correspondente — atende à assumption "novos tipos futuros
sem quebrar a visualização" ao forçar decisão explícita em vez de falha silenciosa).

**Rationale**: Mantém FR-006 (cada tipo reconhecível visualmente) e detecta em build-time quando o
backend evolui o union de `TraceEvent`.

**Alternatives considered**: Renderização genérica via `JSON.stringify` com syntax highlighting —
rejeitada, não atende "estruturado e tipado" pedido explicitamente na entrada do usuário.

## Outstanding NEEDS CLARIFICATION

Nenhum. Todos os pontos técnicos em aberto no Technical Context foram resolvidos acima.
