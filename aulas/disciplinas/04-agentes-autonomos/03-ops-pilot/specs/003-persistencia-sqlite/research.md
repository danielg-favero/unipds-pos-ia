# Research: Persistência Real de Operações (SQLite)

Nenhum `NEEDS CLARIFICATION` restou no Technical Context do plan — a stack (SQLite via
`node:sqlite`, caminho por `OPSPILOT_DB`, `:memory:` em testes) já vinha decidida pelo pedido do
usuário e está registrada na constitution v1.1.0. As decisões abaixo cobrem os pontos técnicos que
o pedido não fixou explicitamente.

## 1. Driver SQLite

- **Decision**: usar `node:sqlite` (`DatabaseSync`), módulo nativo do runtime, sem dependência de
  pacote npm adicional.
- **Rationale**: Node 24 LTS (stack já fixada na constitution) tem `node:sqlite` estável; evita
  adicionar `better-sqlite3`/binários nativos externos e mantém o projeto sem dependência de banco
  externo, coerente com a mudança de MySQL para SQLite. `DatabaseSync` é síncrono, mas os métodos da
  porta `OpsStore` são `async` — o adaptador apenas envolve chamadas síncronas em `Promise.resolve`
  implícito de uma função `async`, sem custo real de I/O bloqueante perceptível (arquivo local,
  operações pequenas).
- **Alternatives considered**: `better-sqlite3` (pacote maduro, mas dependência nativa extra e
  redundante com o que `node:sqlite` já oferece na versão do Node já adotada); manter Sequelize
  apontando para um arquivo SQLite (rejeitado: mantém uma camada ORM pesada para um caso de uso que
  não precisa dela, e foge do pedido explícito de `node:sqlite`).

## 2. Modelagem de tabelas e tipos anuláveis

- **Decision**: 4 tabelas (`services`, `alerts`, `incidents`, `runbooks`) espelhando 1:1 os tipos de
  `src/domain/types.ts`; `incidents.resolved_at` (TEXT ISO-8601) e `incidents.summary` (TEXT) são
  `NULL` enquanto o incidente está aberto.
- **Rationale**: mantém o mapeamento tabela↔domínio óbvio (mesmo espírito do `SequelizeOpsStore`
  atual, que já espelha `Service`/`Alert`/`Incident` 1:1). Adicionar `resolved_at`/`summary` ao tipo
  `Incident` do domínio é a extensão mínima pedida pela spec (FR-004) sem introduzir uma entidade
  paralela.
- **Alternatives considered**: tabela única `incidents_history` versionando estados (rejeitada:
  complexidade desnecessária para o volume e para o requisito atual, que só pede "quando resolvido +
  resumo").

## 3. `CHECK` em campos de domínio fechado

- **Decision**: `CHECK (severity IN ('critical','high','medium','low'))`,
  `CHECK (status IN ('firing','resolved'))` (alerts), `CHECK (status IN ('open','resolved'))`
  (incidents), gerados a partir das mesmas constantes de domínio (`SEVERITIES`, `ALERT_STATUSES`,
  `INCIDENT_STATUSES` em `src/domain/types.ts`) para nunca divergirem do TypeScript.
- **Rationale**: FR-008 exige rejeitar gravação de valor fora do domínio; `CHECK` no schema é a
  defesa de última linha (mesmo que a validação Zod na fronteira já bloqueie a maioria dos casos),
  coerente com "Segurança por Padrão" da constitution — não confiar só na camada de cima.
- **Alternatives considered**: confiar apenas na validação Zod de entrada (rejeitado: não protege
  contra um bug futuro que escreva direto no store, ex. em outro seed ou script).

## 4. DDL idempotente e seed idempotente

- **Decision**: DDL usa `CREATE TABLE IF NOT EXISTS` executado no construtor do `SqliteOpsStore`;
  seed do Mercadinho usa `INSERT OR IGNORE` por chave primária (ids fixos e estáveis do seed atual,
  ex. `checkout-api`, `alert-01`), disparado apenas quando a tabela `services` está vazia.
- **Rationale**: atende FR-009/FR-010/FR-011 (inicialização automática, sem duplicar em reinícios)
  com o mecanismo mais simples disponível em SQLite, sem precisar de tabela de controle de versão de
  migração — não há histórico de schema anterior a migrar (ver Assumptions do spec).
- **Alternatives considered**: checar `INSERT OR IGNORE` linha a linha sempre no boot (funciona
  igual, mas o guard por "tabela `services` vazia" evita 17 `INSERT` desnecessários a cada boot com
  dado já presente — otimização simples, não um requisito).

## 5. Prepared statements

- **Decision**: todo acesso passa por `db.prepare(sql)` reutilizável (preparado uma vez por
  statement, guardado como campo privado do store) com `.run(...)`/`.get(...)`/`.all(...)`
  parametrizados (`?`), nunca template string com valor externo interpolado.
- **Rationale**: requisito explícito do pedido (FR-013) e já é o padrão usado no restante do projeto
  para I/O de dados (ex. Sequelize já parametriza por baixo dos panos).
- **Alternatives considered**: montar SQL com `Object.entries`/concatenação para filtros dinâmicos
  (rejeitado explicitamente pelo pedido e pela regra V da constitution).

## 6. Composição (injeção do store) e convivência com `MemoryOpsStore`

- **Decision**: `SqliteOpsStore` é aberto no boot dos pontos de composição usados fora dos testes
  (o composition root de execução real do arena); `MemoryOpsStore` continua sendo o store dos testes
  automatizados e do bench (`src/bench/scenarios.ts`), preservando reprodutibilidade sem tocar disco.
- **Rationale**: atende FR-015 e a nota do pedido ("mock in memory fica para testes e para o bench");
  `MemoryOpsStore` já é hoje o único store usado pelos testes, então nenhuma migração de teste
  existente é necessária além de também rodar a suíte de tools sobre `SqliteOpsStore(":memory:")`
  para cobrir o novo adaptador (FR-014).
- **Alternatives considered**: usar `SqliteOpsStore(":memory:")` como store único de todos os testes,
  aposentando `MemoryOpsStore` (rejeitado: fora do escopo pedido, que mantém ambos convivendo, e
  quebraria testes/bench que hoje dependem do comportamento síncrono-por-array do `MemoryOpsStore`
  sem necessidade).

## 7. `consultar_runbook`: ausência de runbook vs. serviço inexistente

- **Decision**: `getRunbook(serviceId)` no `OpsStore` devolve `undefined` quando o serviço existe mas
  não tem runbook, e a própria implementação do store lança `ServiceNotFoundError` quando o
  `serviceId` não existe — mesma convenção de erro já usada por `openIncident`.
- **Rationale**: acceptance scenarios da User Story 3 do spec exigem distinguir os dois casos
  (FR-006 vs. FR-007); reaproveitar `ServiceNotFoundError` mantém consistência com o resto da porta
  em vez de inventar um novo tipo de erro só para este caso.
- **Alternatives considered**: sempre devolver `undefined` (mistura os dois casos e a tool não
  conseguiria dar uma mensagem clara de "serviço não existe" vs. "existe, mas sem runbook" — viola
  FR-006/FR-007).
