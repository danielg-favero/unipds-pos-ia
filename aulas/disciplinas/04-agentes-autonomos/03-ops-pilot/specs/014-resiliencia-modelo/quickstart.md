# Quickstart: Validando a Resiliência do Modelo

## Pré-requisitos

- `.env` com `OPENROUTER_API_KEY` válido.
- Node 24 LTS, dependências instaladas (`npm install`).

## Cenário 1 — Falha transitória do primário, sem fallback necessário (US1)

1. Configure `OPENROUTER_MODEL` para um modelo válido e **não** configure `OPENROUTER_MODEL_FALLBACK`.
2. Rode a suíte de testes de `model.ts` (`npm test -- model`), que deve incluir um teste com um runnable/mensageiro fake que falha uma vez e depois responde com sucesso, validando que `createResilientModel().runnable.invoke(...)` retorna a resposta sem exigir modelo de reserva.
3. **Esperado**: a interação é concluída, nenhum evento `"fallback"` é emitido, e `metrics.modelUsed` (quando aplicável no teste de integração da estratégia) é igual a `OPENROUTER_MODEL`.

## Cenário 2 — Primário esgotado, reserva assume (US2)

1. Configure `OPENROUTER_MODEL` (que sempre falhará no teste, via fake) e `OPENROUTER_MODEL_FALLBACK` (que responde com sucesso).
2. Rode o teste de integração da estratégia (`react`/`production-graph`) com modelos fake injetados, validando:
   - A resposta final é entregue com sucesso.
   - O trace da execução contém exatamente um evento `type: "fallback"` com `primaryModel`/`fallbackModel` corretos.
   - `metrics.modelUsed` é igual ao valor de `OPENROUTER_MODEL_FALLBACK`.
3. **Esperado**: todos os três pontos acima batem nas asserções do teste.

## Cenário 3 — Falha total (US3)

1. Configure tanto `OPENROUTER_MODEL` quanto `OPENROUTER_MODEL_FALLBACK` para falhar sempre (fakes que sempre lançam erro).
2. Rode o teste correspondente e verifique que:
   - A chamada rejeita com um erro tratado (não trava, não tenta indefinidamente).
   - A mensagem/objeto de erro não contém o valor de `OPENROUTER_API_KEY` usado no teste.
3. **Esperado**: erro claro e rápido, sem vazamento de segredo — validar com uma asserção de string que verifica a ausência do valor da chave de API fake usada no teste.

## Validação manual (opcional, com credenciais reais)

1. Defina `OPENROUTER_MODEL` para um modelo inválido/inexistente propositalmente e `OPENROUTER_MODEL_FALLBACK` para um modelo real válido.
2. Suba o servidor (`npm run dev` ou equivalente) e envie uma requisição de chat.
3. **Esperado**: a resposta é entregue usando o modelo de reserva; verifique nos logs/trace da interação (conforme exposto pela aplicação) o evento `"fallback"`.
