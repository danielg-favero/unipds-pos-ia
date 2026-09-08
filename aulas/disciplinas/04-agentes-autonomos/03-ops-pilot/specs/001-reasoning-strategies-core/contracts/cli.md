# Contrato: CLI (arena e seed)

Origem: FR-019, FR-020, FR-025 a FR-029.

## `npm run arena -- [opções] "<pedido>"`

**Módulo**: `src/arena.ts`. Camada `cli` → chama `agents` → chama `store` (constitution I).

| Flag | Tipo | Padrão | Efeito |
|------|------|--------|--------|
| `--strategies` | lista separada por vírgula | todas as registradas | Quais estratégias executar (FR-026, FR-027) |
| `--max-iterations` | inteiro 1–20 | `8` | Limite aplicado a **todas** as estratégias (FR-026) |
| `--store` | `json` \| `memory` \| `mysql` | `json` | Adaptador de store |

O padrão é `json`: o modelo lê o que já existe em `data/ops-db.json` e o que ele cria (incidentes) persiste entre execuções. `memory` é efêmero e usado pelos testes; `mysql` continua disponível como opt-in.

O pedido é o argumento posicional restante. Argumentos validados por Zod na borda (constitution II); `--strategies` com nome fora do catálogo → falha imediata listando os nomes válidos (FR-028).

**Saída** — um bloco por estratégia, na ordem em que foram pedidas:

```
=== <nome da estratégia> ===
<formatTrace(trace)>
--- métricas ---
llmCalls: <n>   latencyMs: <n>
```

Estratégia que falhar imprime `!!! erro: <mensagem>` no seu bloco; as demais continuam sendo executadas e impressas (FR-029). Código de saída `0` se ao menos uma estratégia concluiu, `1` se todas falharam.

**Exemplo**

```
npm run arena -- --strategies react,plan-and-execute --max-iterations 6 "liste os alertas em disparo e abra um incidente para o mais crítico"
```

## `npm run seed [-- --path <arquivo>] [-- --mysql]`

**Módulo**: `src/scripts/seed.ts`, registrado no `package.json` como `"seed": "tsx src/scripts/seed.ts"`.

**Padrão (arquivo JSON)**

- Escreve `data/ops-db.json` com os 5 serviços e 6 alertas de `src/store/seed-data.ts`.
- **Idempotente**: serviços e alertas são repostos a partir da fonte canônica; os incidentes já existentes são **preservados** — o seed repõe a base, não apaga o trabalho do plantão.
- Imprime `seed ok (<caminho>): 5 serviços, 6 alertas (3 firing, 3 resolved), N incidentes`.
- `--path` aponta outro arquivo, útil para cenários isolados.

**Opt-in (`--mysql`)**

- Conecta a partir de `DATABASE_URL` (ou `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE`), sincroniza o schema e faz `upsert` dos mesmos dados.
- Banco indisponível ou configuração ausente → erro de domínio nomeando a variável faltante, código de saída `1`; nunca ecoa senha nem `OPENROUTER_API_KEY`.

## Variáveis de ambiente

| Variável | Obrigatória para | Lida em |
|----------|------------------|---------|
| `OPENROUTER_API_KEY` | executar qualquer estratégia | `src/agents/model.ts` (ponto único) |
| `OPENROUTER_MODEL` | executar qualquer estratégia | `src/agents/model.ts` (ponto único) |
| `DATABASE_URL` ou `MYSQL_*` | `npm run seed`, `--store mysql` | `src/store/sequelize/connection.ts` |
| `OPS_STORE` | opcional | sobrescreve o padrão do arena |

O ambiente é carregado pelo runtime: os scripts `dev`, `arena` e `seed` usam `tsx --env-file-if-exists=.env`, então um `.env` presente é carregado automaticamente e a ausência dele não quebra o comando. Variáveis já exportadas no shell continuam valendo. Nenhum módulo lê `.env` diretamente (constitution V).
