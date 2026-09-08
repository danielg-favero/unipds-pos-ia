# Quickstart — Validação do Núcleo de Raciocínio

**Feature**: `001-reasoning-strategies-core`

Roteiro para provar que a feature funciona de ponta a ponta. Detalhes de tipos estão em [data-model.md](data-model.md) e [contracts/](contracts/).

## Pré-requisitos

- Node 24 LTS (`node -v` → `v24.x`)
- `npm install` já executado
- Para os cenários 1–3: nada além disso — o store em memória não precisa de banco nem de rede além do OpenRouter
- Para os cenários 4–5: chave OpenRouter no ambiente
- Para o cenário 6: MySQL acessível (**não está rodando nesta máquina hoje** — ver R-010 em [research.md](research.md))

Basta um `.env` na raiz — `npm run arena`, `npm run seed` e `npm run dev` o carregam sozinhos (`tsx --env-file-if-exists=.env`). Alternativamente, exporte no shell:

```bash
export OPENROUTER_API_KEY=...      # nunca commitar
export OPENROUTER_MODEL=...        # precisa suportar tool calling
```

---

## Cenário 1 — Tipos e testes verdes (sem rede)

```bash
npm run typecheck
npm test
```

**Esperado**: ambos com código de saída `0`. A suíte cobre o store em memória (listagem por status, abertura e resolução de incidentes, os três erros de domínio) e a formatação de trace. Nenhum teste toca rede ou MySQL.

Valida FR-030, FR-031, SC-007.

## Cenário 2 — Determinismo da suíte

```bash
for i in $(seq 1 10); do npm test >/dev/null || echo "FALHOU na execução $i"; done
```

**Esperado**: nenhuma linha impressa. Dez execuções, mesmo resultado.

Valida SC-007.

## Cenário 3 — Estado inicial do store em memória

Um teste dedicado afirma o conteúdo do seed: exatamente 5 serviços e 6 alertas, sendo 3 `firing` e 3 `resolved`.

**Esperado**: teste verde, sem banco envolvido.

Valida FR-019, SC-008.

## Cenário 4 — Uma estratégia de ponta a ponta

```bash
npm run arena -- --strategies react "liste os alertas em disparo"
```

**Esperado**: um bloco `=== react ===` com o trace formatado contendo `[action] list_alerts({"status":"firing"})`, a `[observation]` correspondente com os 3 alertas, e `[answer]` enumerando-os. Abaixo, `llmCalls` ≥ 1 e `latencyMs` > 0.

Valida User Story 1, FR-021, FR-004, SC-001.

## Cenário 5 — Comparação entre estratégias

```bash
npm run arena -- --strategies react,plan-and-execute --max-iterations 6 \
  "liste os alertas em disparo e abra um incidente para o mais crítico"
```

**Esperado**: dois blocos, um por estratégia, cada um com trace formatado e métricas. O bloco `plan-and-execute` começa com um `[plan]` numerado e alterna `[action]`/`[observation]`/`[critique]` até o `[answer]`. Nenhuma execução passa de 6 iterações.

Verificações negativas:

```bash
npm run arena -- --strategies inexistente "teste"     # falha listando os nomes válidos
npm run arena -- "liste os alertas"                   # sem --strategies: roda todas
```

Valida User Stories 2 e 3, FR-022, FR-023, FR-025 a FR-029, SC-003, SC-006.

## Cenário 6 — Seed no arquivo JSON

```bash
npm run seed
npm run seed      # segunda vez: idempotência
```

**Esperado**: as duas execuções imprimem `seed ok (<caminho>): 5 serviços, 6 alertas (3 firing, 3 resolved), N incidentes`, e `data/ops-db.json` fica com exatamente 5 serviços e 6 alertas. Incidentes criados por execuções anteriores são preservados.

Valida FR-019, FR-020, SC-008.

## Cenário 6b — Persistência entre execuções

```bash
npm run arena -- --strategies plan-and-execute "abra um incidente para o alerta mais crítico"
npm run arena -- --strategies plan-and-execute "resolva o incidente inc-1"
```

**Esperado**: a primeira execução grava um incidente em `data/ops-db.json`; a segunda **lê** esse incidente e o marca como `resolved`. É o que prova que o modelo opera sobre estado real, não sobre um snapshot efêmero.

## Cenário 6c — Seed no MySQL (opt-in)

```bash
export DATABASE_URL='mysql://user:pass@127.0.0.1:3306/opspilot'
npm run seed -- --mysql
```

Sem banco acessível, falha com mensagem clara e código `1` — comportamento esperado, não defeito. **Não executado**: não há MySQL nesta máquina (R-010).

## Cenário 7 — Guardrails

```bash
unset OPENROUTER_API_KEY
npm run arena -- --strategies react "liste os alertas"
```

**Esperado**: falha imediata, antes de qualquer chamada de rede, dizendo qual variável falta. A mensagem não contém valor de credencial.

Valida FR-009, FR-011, e o edge case de credenciais ausentes.

---

## Checklist de saída

- [x] `npm run typecheck` e `npm test` verdes — 57 testes, 0 falhas
- [x] Suíte estável em 10 execuções
- [x] Arena roda uma estratégia e imprime trace + métricas
- [x] Arena roda duas estratégias sobre o mesmo pedido
- [x] Nome de estratégia inválido é recusado com a lista de válidos
- [x] Limite de iterações respeitado; Plan-and-Execute nunca passa de 8 passos — coberto por `src/agents/guardrails.test.ts`
- [x] Seed idempotente sobre `data/ops-db.json`, preservando incidentes existentes
- [x] Estado persiste entre execuções: uma execução abre o incidente, a seguinte o lê e resolve
- [ ] Seed no MySQL — **não executado**: sem MySQL em 3306 e sem daemon Docker nesta máquina. Os dois caminhos de erro foram validados (config ausente e `ECONNREFUSED`)
- [x] Credencial ausente falha cedo e sem vazamento
