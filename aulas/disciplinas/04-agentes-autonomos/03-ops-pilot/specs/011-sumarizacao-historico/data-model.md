# Data Model: Sumarização de Histórico (Pruning de Contexto)

## ConversationSummary

Uma linha por conversa, acumulando o resumo das mensagens que já saíram da janela recente.

| Campo | Tipo | Descrição |
|---|---|---|
| `conversation_id` | `TEXT PRIMARY KEY` | Mesmo id usado em `messages.conversation_id`. Uma conversa tem no máximo um resumo. |
| `summary` | `TEXT NOT NULL` | Texto acumulado (~150 tokens) com decisões, fatos e pendências. String vazia até a primeira sumarização — nunca `NULL` (evita distinguir "sem linha" de "linha com resumo vazio"; ver Regras). |
| `summarized_through` | `INTEGER NOT NULL DEFAULT 0` | Quantidade de mensagens (em ordem cronológica) já incorporadas ao resumo. Cresce em múltiplos de 8. |
| `updated_at` | `TEXT NOT NULL` | Timestamp ISO da última atualização (default `strftime('%Y-%m-%dT%H:%M:%fZ','now')`, mesmo padrão de `messages.created_at`). |

**Validação (Zod, na fronteira do resumidor)**: a saída do modelo é validada como
`{ summary: string().min(1) }` antes de ser persistida — mesmo padrão de `learningVerdictSchema`
em `learning-reflector.ts`. `summarized_through` e `updated_at` são calculados/gerados pelo
código, não pelo modelo.

### Regras

- **Sem linha para a conversa** = "sem resumo ainda" (equivalente ao FR-009); não é tratado como
  erro. Distinto de uma linha existente — nunca se cria uma linha com `summary` vazio apenas para
  "reservar" a conversa.
- **Um resumo por conversa**: cada sumarização faz `UPSERT` (insere se não existir, substitui o
  conteúdo se existir) — não há histórico de versões anteriores do resumo (Assumptions da spec).
- **`summarized_through` só avança em lotes de 8**: nunca fica, por exemplo, em 3 ou 11; sempre um
  múltiplo de 8. Usado para decidir quando a próxima sumarização deve rodar (ver research.md §1).
- **Falha na sumarização**: nenhuma linha é escrita/atualizada; `summarized_through` permanece no
  valor anterior (research.md §3).

### Relação com `messages`

`ConversationSummary` não referencia linhas específicas de `messages` por id — apenas uma
contagem (`summarized_through`). As mensagens cobertas por um resumo continuam existindo em
`messages` (nada é apagado), mas deixam de ser recuperadas para o contexto de `/chat` uma vez fora
da janela das 8 mais recentes (comportamento já existente de `lastMessages`, inalterado por esta
feature).

## Summarize Event (observabilidade, não persistido em tabela própria)

| Campo | Descrição |
|---|---|
| `conversationId` | Conversa sumarizada |
| `summarizedThrough` | Novo valor de `summarized_through` após a sumarização |
| `outcome` | `"ok"` ou `"error"` |

Registrado via log estruturado no momento da execução (research.md §5) — não é uma entidade
persistida em banco.
