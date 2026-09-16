# Research: Trace Persistido e Logs Estruturados

Todos os pontos técnicos já vinham decididos na descrição da feature e na Constitution
(`Stack`); não há `NEEDS CLARIFICATION` remanescente. Este documento registra as decisões e
por que as alternativas do próprio repositório foram descartadas.

## 1. Geração e propagação do `requestId`

- **Decision**: `randomUUID()` (`node:crypto`) gerado no início do handler `POST /chat`,
  devolvido em `X-Request-Id` (header) e no campo `requestId` do corpo da resposta.
- **Rationale**: Mesmo mecanismo já usado para `conversationId` (`randomUUID()` em
  `SqliteConversationStore#create`); nenhuma dependência nova. Um identificador por
  requisição HTTP (não por conversa) é necessário porque uma conversa tem várias
  requisições, e a spec (US1) exige correlacionar uma requisição específica.
- **Alternatives considered**: Aceitar um `X-Request-Id` enviado pelo cliente e propagá-lo —
  descartado por ora (edge case listado na spec, não coberto por nenhuma US); pode ser
  adicionado depois sem quebrar o contrato atual, já que o servidor apenas passaria a
  respeitar um valor de entrada em vez de sempre gerar um novo.

## 2. Armazenamento do trace e das métricas

- **Decision**: SQLite via `node:sqlite` (`DatabaseSync`), duas tabelas (`requests`,
  `trace_events`) no mesmo arquivo `OPSPILOT_DB` das demais stores, com DDL idempotente
  (`CREATE TABLE IF NOT EXISTS`) executado no construtor do novo store, igual a
  `SqliteConversationStore`/`SqliteOpsStore`.
- **Rationale**: É o padrão de persistência único do projeto (Constitution §Stack); reusar
  o mesmo arquivo evita introduzir uma segunda fonte de configuração. `trace_events` grava
  cada `TraceEvent` do array `StrategyRun.trace` como uma linha, preservando a ordem via uma
  coluna de sequência (`seq`) — o array já vem ordenado cronologicamente pela estratégia, só
  é necessário não perder essa ordem ao persistir/reconsultar.
- **Alternatives considered**: Sequelize/MySQL (usado em `store/sequelize/*` para outras
  entidades legadas) — descartado porque a Constitution já registrou a migração de
  persistência para SQLite puro (`node:sqlite`) como decisão vigente do projeto; não faz
  sentido introduzir uma tabela nova no store legado que está sendo substituído.

## 3. Serialização de payloads de evento (`args`/`result`)

- **Decision**: Payloads de `trace_events` são serializados com `JSON.stringify` puro (sem
  ordenação de chaves — determinismo não é requisito aqui, ao contrário de `formatTrace`,
  cujo propósito é snapshot de teste).
- **Rationale**: `formatTrace` (`src/domain/trace.ts`) já existe, mas serve a um propósito
  diferente (string legível/determinística para testes de estratégia) — reaproveitá-la para
  persistência acopla observabilidade a um formato pensado para outro consumidor. Persistir
  o evento como dado estruturado (JSON) é o que permite reconstruir o `TraceEvent` original
  na consulta `GET /requests/:id`.
- **Alternatives considered**: Reusar `formatTrace` diretamente como coluna única de texto —
  descartado porque perde a estrutura por evento (nome do nó, payload de entrada/saída
  separados) exigida por FR-004/US2.

## 4. Log estruturado (`src/obs/logger.ts`)

- **Decision**: Uma função pura `logLine(event: LogEvent): string` que serializa metadados
  (`requestId`, etapa/nó, timestamp, status) em uma linha JSON, e uma função de efeito
  colateral fina que escreve essa linha em `stdout` (`console.log`). Chamada uma vez por
  `TraceEvent` processado, em paralelo à escrita em `trace_events`.
- **Rationale**: Constitution VI (funções puras por padrão, efeito colateral isolado) —
  separar "montar a linha" (puro, testável sem I/O) de "emitir a linha" (efeito colateral)
  segue o mesmo padrão de `domain/trace.ts` (`formatEvent`/`formatTrace` puros) que hoje
  imprime para a saída do CLI (`src/index.ts`/bench).
- **Alternatives considered**: Biblioteca de logging estruturado (pino/winston) —
  descartada: nenhuma dependência de logging existe hoje no projeto, o requisito é apenas
  "1 linha JSON por evento, só metadados" (necessidade simples, sem rotação de arquivo,
  níveis configuráveis ou transporte), então uma função própria evita dependência nova sem
  perder nenhum requisito funcional.

## 5. Falha de persistência não deve afetar a resposta

- **Decision**: A gravação em `trace_events`/`requests` e a emissão do log ocorrem depois de
  `res.status(200).json(...)` já ter sido chamado, dentro de um bloco fire-and-forget que
  absorve exceções (`.catch` sem propagar), mesmo padrão já usado para
  `reflectLearning`/`updateHistorySummary` em `src/http/server.ts`.
- **Rationale**: Resolve o edge case da spec ("o que acontece se a escrita no armazenamento
  de trace falhar?") sem introduzir um novo mecanismo — o handler já tem esse padrão para
  efeitos colaterais pós-resposta.
- **Alternatives considered**: Persistir de forma síncrona antes de responder — descartado
  porque violaria a Constraint da spec/plan de não adicionar latência perceptível à resposta
  principal, e tornaria a resposta ao usuário dependente da disponibilidade do SQLite para
  trace, o que a spec explicitamente não exige.

## 6. Consulta `GET /requests/:id`

- **Decision**: Rota nova em `http/server.ts`, valida `:id` com Zod (`requestIdParamSchema`,
  string não vazia), consulta o store por `requestId`; se não existir, responde 404 com corpo
  de erro no mesmo formato das demais rotas (`{ error: string }`); se existir, responde 200
  com o registro de métricas da requisição e a lista de eventos ordenada por `seq`.
- **Rationale**: Espelha o padrão já usado em `DELETE /memories/:id` (parâmetro de rota +
  Zod) e no tratamento de erro 422/400 já presente no arquivo.
- **Alternatives considered**: Nenhuma — é a única forma de consulta pedida pela spec (FR-006).
