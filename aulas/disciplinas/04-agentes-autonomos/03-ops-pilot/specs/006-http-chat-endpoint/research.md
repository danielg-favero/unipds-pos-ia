# Research: Endpoint HTTP de Chat

## 1. Store usado pelo servidor HTTP

**Decision**: O servidor usa `SqliteOpsStore` (persistência real, `OPSPILOT_DB` configurável), instanciado uma vez no boot e reutilizado por todas as requisições.

**Rationale**: A constitution já define SQLite via `node:sqlite` como a persistência do projeto ("sem banco de dados externo"). O servidor HTTP é o caminho de uso real (não bench/comparação), então precisa de estado persistente entre requisições — ao contrário do `arena.ts`, que cria um store novo por estratégia para comparação justa.

**Alternatives considered**:
- `MemoryOpsStore`: adequado para testes (isolamento total, sem I/O), mas não serve para o servidor real — estado se perderia a cada restart e não seria compartilhado entre requisições concorrentes de forma persistente.
- `JsonOpsStore`: usado pelo `arena.ts` como padrão para uso interativo local; não foi desenhado para concorrência de um servidor HTTP.

## 2. Onde plugar o registry de estratégias

**Decision**: Reaproveitar `src/agents/registry.ts` (já existe `strategies`, `strategyNames()`, `resolveStrategies()`) em vez de criar um `src/agents/index.ts` novo. O endpoint resolve o nome recebido usando a mesma função `resolveStrategies` (ou uma variante de item único) já usada pelo arena, garantindo que `UnknownStrategyError` seja o mesmo tipo de erro em toda a base.

**Rationale**: A descrição da feature menciona `src/agents/index.ts` como local do registry, mas o registry já existe em `src/agents/registry.ts` e é a fonte de verdade usada pelo `arena.ts`. Duplicar o catálogo violaria DRY e o princípio de camadas explícitas da constitution. Quando `reflect: true`, a resolução usa a chave `reflect:<strategy>` já registrada (ex.: `reflect:react`), que já aplica `withReflection` — não é necessário chamar `withReflection` manualmente na camada HTTP.

**Alternatives considered**:
- Criar `src/agents/index.ts` como um novo arquivo que apenas re-exporta `registry.ts`: aceitável como ponto de entrada, mas não estritamente necessário; decidido usar diretamente `registry.ts` para não criar indireção sem valor.
- Aplicar `withReflection` na camada HTTP a cada requisição quando `reflect: true`: rejeitado porque duplicaria lógica já resolvida pelo registry (as chaves `reflect:*`) e criaria dois caminhos possíveis para o mesmo comportamento.

## 3. Validação com Zod e formato de erro 400

**Decision**: Um schema Zod (`chatRequestSchema`) valida `{ message: string().min(1), strategy: string().optional(), reflect: boolean().optional().default(false) }`. Em falha, `error.issues` (formato nativo do Zod) é devolvido no corpo da resposta 400.

**Rationale**: Consistente com o princípio "Validações na Fronteira" da constitution e com o padrão zod já usado em `src/store/*` e `src/cli/args.ts`. `strict()` implícito do zod v4 sobre objetos (ou `.strict()` explícito) rejeita campos extras não esperados, e a ausência de coerção (`z.boolean()`, não `z.coerce.boolean()`) faz `reflect: "true"` (string) falhar a validação, conforme o edge case do spec.

**Alternatives considered**: validação manual (if/else) — rejeitada por já haver um padrão zod estabelecido no projeto.

## 4. Timeout de 180s e resposta 504

**Decision**: Um wrapper de timeout (`Promise.race` entre `strategy.run(...)` e um timer de 180_000ms) decide se a resposta é a execução normal ou um erro de timeout, mapeado para HTTP 504 no handler Express. A execução da estratégia em si não é abortada de forma síncrona (LangChain/LangGraph não expõe um cancelamento simples aqui), mas a resposta HTTP não fica pendurada além do limite.

**Rationale**: Simplicidade e previsibilidade do contrato HTTP são o requisito (FR-009); abortar de fato a chamada ao modelo é uma otimização de recursos fora do escopo mínimo desta feature (poderia ser tratada com um `AbortController` passado ao LangChain em iteração futura, mas não é exigido pelos critérios de aceitação).

**Alternatives considered**: usar o timeout nativo do Express/`http.Server` (`server.timeout`) — rejeitado porque é global ao servidor, não por rota, e não permite retornar o corpo JSON específico exigido pelo contrato (nenhum corpo obrigatório foi especificado para 504, mas manter o formato de erro consistente com as outras respostas de erro é preferível).

## 5. Estratégia fake determinística para o teste de integração

**Decision**: Um `ReasoningStrategy` de teste (`fakeStrategy`, definido no arquivo de teste ou em um helper de teste) que implementa `run()` retornando uma `StrategyRun` fixa e síncrona (sem chamar `createModel()`/OpenRouter), registrado ad-hoc apenas para o teste — não entra no registry de produção (`src/agents/registry.ts`).

**Rationale**: FR-010 exige que os testes de integração não façam rede. O tipo `ReasoningStrategy` já é uma interface simples (`{ name, run(input) => Promise<StrategyRun> }`), então uma implementação fake é trivial e não exige mocks de biblioteca. Para o handler HTTP resolver essa estratégia fake nos testes sem contaminar o registry de produção, o servidor Express é construído via uma função de fábrica (`createServer(deps)`) que aceita o catálogo de estratégias e o store como dependências injetáveis — o `registry.ts` real é usado apenas na composição de produção (`src/http/server.ts` ao rodar como processo principal).

**Alternatives considered**: registrar a estratégia fake permanentemente no `registry.ts` de produção — rejeitado por poluir o catálogo real com uma estratégia de teste.

## Resumo do Technical Context

- **Language/Version**: TypeScript (ESM, `strict: true`) sobre Node 24 LTS — já fixado pela constitution.
- **Primary Dependencies**: Express 5, Zod 4, LangChain/LangGraph (via estratégias existentes) — todas já são dependências do projeto.
- **Storage**: SQLite via `node:sqlite` (`SqliteOpsStore`), reaproveitando a store já implementada.
- **Testing**: `node:test` via `tsx` (`npm test`), seguindo o padrão de `*.test.ts` já usado no projeto; teste de integração via `supertest`-like chamada direta ao app Express seria ideal, mas para não adicionar uma nova dependência, o teste pode iniciar o servidor Express em uma porta efêmera (`listen(0)`) e usar `fetch` nativo do Node para exercitar o endpoint.
- **Target Platform**: servidor Node de longa duração (serviço HTTP interno).
- **Project Type**: extensão de um projeto single-project existente (backend Node/TypeScript).
- **Performance Goals**: não há meta explícita de throughput; a única meta temporal explícita é o timeout de 180s por requisição.
- **Constraints**: nenhuma chamada de rede real durante os testes automatizados (FR-010); sem autenticação nesta fase (assunção do spec).
- **Scale/Scope**: uso interno, uma única rota (`POST /chat`), sem paginação ou múltiplos endpoints nesta feature.
