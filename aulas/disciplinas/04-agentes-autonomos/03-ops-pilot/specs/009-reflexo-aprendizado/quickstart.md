# Quickstart: Reflexo de Aprendizado Automático

## Pré-requisitos

- Feature [008-memoria-semantica](../008-memoria-semantica/quickstart.md) já implementada e com
  `npm test` verde (esta feature reaproveita `MemoryStore.remember/recall/forget` sem alterar seu
  contrato).
- Mesmas variáveis de ambiente do `/chat` (`OPENROUTER_API_KEY` etc.) para os testes/validação
  manual que chamam o modelo real.

## Rodando os testes automatizados (validação principal)

```bash
npm test
```

Cobre, no mínimo (ver [contracts/learning-reflector.md](./contracts/learning-reflector.md)):

- `reflectLearning` com um refletor mockado que devolve `hasLearned: true` chama `remember` com o
  fato distilado.
- `reflectLearning` com `hasLearned: false` (ex.: mensagem só com pedido pontual) não chama
  `remember`.
- `reflectLearning` nunca lança, mesmo se o refletor mockado rejeitar (simulando falha de provedor).
- `forget_preference` sem nenhum candidato (`recall` vazio) devolve `ok: false`, sem chamar `forget`.
- `forget_preference` com exatamente um candidato chama `forget` e confirma o fato removido.
- `forget_preference` com múltiplos candidatos plausíveis não chama `forget`, devolve a lista de
  candidatos.
- `POST /chat`: uma resposta 200 é devolvida antes/independente do resultado da reflexão (a reflexão
  não é aguardada pela resposta HTTP).

## Validação manual end-to-end (`/chat`)

```bash
npm run http
```

1. Mencionar, de forma natural (sem pedir "lembre disso"), um fato durável misturado a um pedido
   pontual:

   ```bash
   curl -s http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"u1","message":"liste os alertas disparando — ah, e já aviso que eu só trabalho de manhã"}'
   ```

2. Nova pergunta relacionada ao fato durável, em outra conversa, mesmo `userId`:

   ```bash
   curl -s http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"u1","message":"qual o melhor horário para eu revisar um incidente?"}'
   ```

   A resposta deve refletir a preferência de trabalhar de manhã (SC-001, SC-006 — só a parte durável
   foi memorizada, não o pedido de listar alertas).

3. Pedir para esquecer a preferência, na conversa:

   ```bash
   curl -s http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"u1","message":"pode esquecer que eu só trabalho de manhã"}'
   ```

   Uma pergunta subsequente igual à do passo 2 não deve mais refletir essa preferência (SC-005).

## Expected Outcomes

- Fatos duráveis mencionados sem pedido explícito são retidos e influenciam conversas futuras
  (SC-001).
- Pedidos pontuais nunca geram memória nova (SC-002).
- Nenhuma informação sensível mencionada aparece em memórias armazenadas (SC-003).
- O tempo de resposta do `/chat` não aumenta de forma perceptível por causa da reflexão (SC-004).
- Um pedido de "esquecer" em linguagem natural remove a preferência correta (SC-005).
