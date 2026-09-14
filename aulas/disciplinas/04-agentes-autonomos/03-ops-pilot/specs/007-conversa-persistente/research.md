# Research: Conversa Persistente

Todos os itens de Technical Context têm resposta direta a partir do código existente — não há
`NEEDS CLARIFICATION` pendente. Este documento registra as decisões de design que não são triviais.

## 1. Forma da tabela `messages`

**Decision**: Uma única tabela `messages` (`id INTEGER PRIMARY KEY AUTOINCREMENT`, `conversation_id
TEXT NOT NULL`, `role TEXT NOT NULL CHECK (role IN ('user','assistant'))`, `content TEXT NOT NULL`,
`created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`), com índice em
`conversation_id`. `create()` apenas gera um novo id (`crypto.randomUUID()`), sem inserir linha —
uma conversa "existe" a partir da primeira mensagem gravada nela.

**Rationale**: O pedido do usuário é explícito ("uma tabela messages"). Uma tabela `conversations`
separada só para guardar `id`/`created_at` seria redundante: nenhum requisito pede metadados de
conversa além do identificador, e uma conversa vazia (sem mensagens) não precisa ser distinguível de
"conversa inexistente" — ambas produzem histórico vazio, que é o comportamento correto (Edge Cases do
spec). Isso também resolve o edge case "identificador desconhecido" sem lógica extra: qualquer id novo
simplesmente começa sem histórico até a primeira gravação.

**Alternatives considered**: Tabela `conversations` + `messages` com FK — rejeitada por adicionar uma
tabela sem requisito que a justifique, e por exigir tratar "conversa não encontrada" como erro em vez
de aceitar id novo livremente (contrário à Assumption do spec).

## 2. Onde a janela de 12 mensagens é aplicada

**Decision**: `lastMessages(conversationId, limit)` já devolve no máximo `limit` linhas via
`ORDER BY id DESC LIMIT ?` seguido de reversão em memória para ordem cronológica — o próprio store
garante o corte, em vez de o chamador buscar tudo e truncar.

**Rationale**: Evita transportar histórico ilimitado da camada de store para a HTTP; a query já usa
índice e `LIMIT`, mais barata que qualquer filtragem posterior. Mantém a porta simétrica ao padrão de
`listIncidents`/`listAlerts` (filtro aplicado no store, não no chamador).

**Alternatives considered**: Buscar tudo e cortar em `server.ts` — rejeitada por custo desnecessário em
conversas longas e por espalhar a regra dos "12" em dois lugares.

## 3. Onde compor histórico + mensagem atual em mensagens do agente

**Decision**: `StrategyInput` ganha `history?: readonly { role: "user" | "assistant"; content: string
}[]`. Cada estratégia (`react.ts`, `plan-and-execute.ts`) monta a lista de mensagens inicial do agente
como `[...history, { role: "user", content: request }]`, no mesmo ponto em que hoje só passa
`[{ role: "user", content: request }]`. `reflection.ts` repassa `input` (e portanto `history`) sem
alteração para a estratégia base.

**Rationale**: LangGraph/LangChain representam histórico como mensagens tipadas por papel — preservar
os papéis (`user`/`assistant`) dá ao modelo o mesmo contexto que uma conversa real teria, em vez de
"achatar" tudo numa string. Como o corte de 12 já aconteceu no store, a estratégia não decide quantas
mensagens usar — só compõe as que recebeu, mantendo a estratégia livre de I/O (Constitution VI).

**Alternatives considered**: Concatenar o histórico numa única string prefixada ao `request` — rejeitada
por perder a distinção de papel entre turnos e por exigir um formato de serialização ad-hoc que os
demais modelos de mensagem já resolvem.

## 4. Onde a métrica `historyMessages` é computada e exposta

**Decision**: `RunMetrics` ganha `historyMessages: number`. `RunTracker` passa a receber a contagem no
construtor (`new RunTracker(input.history?.length ?? 0)`) e a devolve em `snapshot()`, junto de
`llmCalls`/`latencyMs`, exatamente como as métricas já existentes fluem hoje.

**Rationale**: `RunTracker` já é o único ponto que monta `RunMetrics` em cada estratégia — estender seu
construtor evita duplicar lógica de métricas em `react.ts`, `plan-and-execute.ts` e `reflection.ts`
individualmente. `reflection.ts` soma `llmCalls` entre tentativas mas não recalcula `historyMessages`
(é constante por execução, não por tentativa).

**Alternatives considered**: Calcular `historyMessages` só em `server.ts` e injetar no `StrategyRun`
depois — rejeitada porque quebraria a garantia de que `metrics` vem inteira de `finishRun` dentro da
estratégia (mesma garantia que hoje vale para `llmCalls`/`latencyMs`).

## 5. Composição em `server.ts` (onde o histórico entra e sai)

**Decision**: Em `POST /chat`, após validar o corpo: `conversationId = parsed.data.conversation ??
await deps.conversationStore.create()`; `history = await
deps.conversationStore.lastMessages(conversationId, 12)`; chama a estratégia com
`{ ...existing, history }`; em caso de sucesso (200), grava (`append`) a mensagem do usuário e a
resposta do assistente na conversa, nessa ordem; a resposta HTTP ganha o campo `conversation:
conversationId`. Em timeout (504) ou erro (500), a mensagem do usuário não é gravada — nada para
registrar de forma consistente sem uma resposta do assistente.

**Rationale**: Mantém `server.ts` como a única camada que conhece tanto a rota HTTP quanto o
`ConversationStore` (Constitution I). Gravar só em caminho de sucesso evita conversas com uma mensagem
de usuário "órfã" sem resposta correspondente, o que simplifica a leitura de `lastMessages` (sempre
pares user/assistant, exceto na primeira mensagem de uma conversa nova).

**Alternatives considered**: Gravar a mensagem do usuário antes de invocar a estratégia (para não
perdê-la em caso de timeout) — rejeitada por não haver requisito pedindo isso, e por complicar o
histórico com mensagens de usuário sem resposta.
