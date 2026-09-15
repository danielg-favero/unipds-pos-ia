# Quickstart: Sumarização de Histórico (Pruning de Contexto)

## Pré-requisitos

- Repositório instalado (`npm install`), Node 24 LTS.
- Variáveis de ambiente do provedor LLM configuradas apenas se for validar com o resumidor real
  (`defaultHistorySummarizer`); para os testes automatizados abaixo, não é necessário.

## Validar a lógica de gatilho (pura, sem I/O)

```bash
npx tsx --test src/memory/history-summarizer.test.ts
```

Cenários esperados:
- `nextBatchToSummarize` devolve `undefined` para conversas com até 15 mensagens
  (`totalMessages - 8 < 8`).
- `nextBatchToSummarize` devolve `{ start: 0, end: 8 }` na 16ª mensagem.
- Depois de sumarizado (`summarizedThrough = 8`), só devolve `{ start: 8, end: 16 }` a partir da
  24ª mensagem — nunca antes.

## Validar mesclagem e persistência com resumidor fake

```bash
npx tsx --test src/store/sqlite/sqlite-conversation-summary-store.test.ts
```

Cenário: gravar um resumo, ler de volta (`get`), sobrescrever com `save` e confirmar que não há
acúmulo de linhas (uma por `conversationId`).

## Validar o fluxo ponta a ponta via `/chat`

```bash
npx tsx --test src/http/server.test.ts
```

Cenário novo a adicionar (ver `contracts/history-summarizer.md`):
1. Injetar um `HistorySummarizerFn` fake determinístico (ex.: devolve
   `"resumo: " + previousSummary + " + lote"`).
2. Enviar 16 mensagens em sequência na mesma `conversation`.
3. Verificar que, após a 16ª, o `ConversationSummaryStore` fake passa a ter uma linha para a
   conversa, com `summarizedThrough === 8`.
4. Enviar mais 7 mensagens (total 23) e verificar que o resumo **não muda** (gatilho só na 24ª).
5. Enviar a 24ª e verificar `summarizedThrough === 16` e que o resumo mesclou o conteúdo anterior
   (contém o texto do resumo fake anterior como substring, evidenciando a mesclagem).
6. Verificar que o corpo enviado à estratégia de raciocínio (ou o contexto observável) inclui o
   resumo persistido quando ele existe.

## Resultado esperado

- `typecheck` e `test` (scripts do `package.json`) verdes.
- Nenhuma chamada real a um provedor LLM durante os testes acima (resumidor sempre fake).
