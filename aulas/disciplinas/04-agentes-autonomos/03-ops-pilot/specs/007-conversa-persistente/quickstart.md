# Quickstart: Conversa Persistente

Valida ponta a ponta que `POST /chat` mantém contexto entre requisições, que o histórico é limitado a
12 mensagens (FR-006) e que ele sobrevive a um reinício do processo (US3). Ver contrato completo em
[contracts/http-chat.md](./contracts/http-chat.md) e o modelo de dados em
[data-model.md](./data-model.md).

## Pré-requisitos

- `npm install`
- `.env` com `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` (só necessário rodando `npm run http` de verdade;
  os testes automatizados usam uma estratégia fake, sem rede)

## Testes automatizados (sem rede)

```bash
npm test
```

Cobre, entre outros:
- `SqliteConversationStore` sobre `:memory:` e sobre arquivo (persistência entre reinícios).
- `MemoryConversationStore` (fake) com o mesmo contrato de comportamento.
- Integração de `POST /chat`: conversa implícita, continuação por `conversation`, corte em 12
  mensagens, `historyMessages` na métrica.

## Validação manual (com o servidor real)

1. Subir o servidor:

   ```bash
   npm run http
   ```

2. Primeira mensagem, sem `conversation`:

   ```bash
   curl -s http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"message": "quais incidentes estão abertos?"}' | tee /tmp/r1.json
   ```

   Confirmar que a resposta tem `conversation` (string) e `metrics.historyMessages == 0`.

3. Pergunta de acompanhamento, reaproveitando o `conversation` da resposta anterior:

   ```bash
   CONV=$(jq -r .conversation /tmp/r1.json)
   curl -s http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d "{\"message\": \"e algum deles é crítico?\", \"conversation\": \"$CONV\"}"
   ```

   Confirmar que `metrics.historyMessages == 2` (a pergunta anterior + a resposta anterior) e que a
   resposta é coerente com a primeira pergunta.

4. Repetir o passo 3 mais 6 vezes (mesma conversa) para passar de 12 mensagens acumuladas, e confirmar
   que `metrics.historyMessages` nunca ultrapassa `12`.

5. Reiniciar o servidor (`Ctrl+C`, `npm run http` de novo) e repetir o passo 3 com o mesmo `CONV`:
   confirmar que o histórico anterior ao reinício ainda é usado (US3) — a menos que `OPSPILOT_DB`
   aponte para `:memory:`, caso em que a perda é esperada.

## Sinais de sucesso

- `conversation` presente em toda resposta 200 (SC-004).
- `historyMessages` nunca maior que 12, mesmo em conversas mais longas (SC-002).
- Histórico sobrevive a reinício do processo quando `OPSPILOT_DB` aponta para um arquivo (SC-003).
