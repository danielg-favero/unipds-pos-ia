# Research: Resiliência do Modelo de Linguagem

## R1: Mecanismo de retry no modelo primário

- **Decision**: Usar `.withRetry({ stopAfterAttempt })` do `Runnable` de `@langchain/core`, aplicado ao `ChatOpenAI` retornado por `createModel()`, antes de compor o fallback.
- **Rationale**: `@langchain/openai@1.5.10` estende `BaseChatModel`, que já implementa a interface `Runnable` de `@langchain/core@1.2.9`, expondo `.withRetry()` nativamente com backoff exponencial e jitter, sem dependência nova. Mantém a Camada de "fábrica" (`model.ts`) como único ponto que conhece esse detalhe (Princípio I da constitution).
- **Alternatives considered**:
  - Implementar retry manual com laço `for` e `try/catch`: rejeitado por duplicar lógica que a biblioteca já resolve testada e por dificultar compor com fallback.
  - Biblioteca externa de retry (`p-retry`, `async-retry`): rejeitado por introduzir dependência nova para algo já coberto pelo LangChain runnable.

## R2: Mecanismo de fallback para o modelo de reserva

- **Decision**: Usar `.withFallbacks([modeloReserva])` do `Runnable`, encadeado após o `.withRetry()` do modelo primário. O modelo de reserva também recebe seu próprio `.withRetry()` antes de entrar na lista de fallbacks, para que a reserva também tolere falhas transitórias antes de ser considerada esgotada.
- **Rationale**: `withFallbacks` já implementa exatamente a semântica pedida — tenta o primeiro runnable (que já embute suas tentativas via `withRetry`) e, se ele lançar, tenta o próximo da lista, propagando o erro final caso todos falhem. Isso resolve o cenário "nada funciona" (US3) sem código extra: o erro do último fallback é o que sobe, e a fábrica pode inspecioná-lo/traduzi-lo em `ConfigError`/erro de domínio na borda, conforme Princípio III.
- **Alternatives considered**:
  - Orquestrar o fallback manualmente em `production-graph.ts` (try primário, catch, try reserva): rejeitado porque espalha a decisão de resiliência para fora da fábrica, violando a intenção original ("fábrica model.ts: withRetry no primário; withFallback([reserva])") e o Princípio I (camadas explícitas — a fábrica é quem deve encapsular esse detalhe de infraestrutura).

## R3: Como identificar, em runtime, qual modelo respondeu (para trace "fallback" e `metrics.modelUsed`)

- **Decision**: Expor a fábrica como uma função que retorna tanto o `Runnable` composto quanto os nomes dos modelos envolvidos (`{ runnable, primaryModel, fallbackModel }`), e usar um `BaseCallbackHandler` (no mesmo padrão de `CallCounter` em `src/agents/metrics.ts`) escutando `handleChatModelStart`/`handleLLMEnd` para capturar qual `model` de fato respondeu com sucesso na invocação final. Alternativamente (mais simples e já suficiente para o objetivo do FR-005), inferir pelo resultado: se a chamada teve sucesso sem exceção do runnable com fallback, comparar o identificador de modelo retornado nos metadados da resposta (`response_metadata.model_name`, já exposto pelo `ChatOpenAI`/OpenRouter) contra `primaryModel`/`fallbackModel` conhecidos pela fábrica.
- **Rationale**: `AIMessage.response_metadata` do LangChain para modelos OpenAI-compatíveis inclui o nome do modelo realmente usado (útil porque o próprio provedor pode normalizar nomes). Comparar esse valor contra os dois nomes configurados é suficiente para popular `metrics.modelUsed` sem exigir que cada estratégia (`react`, `plan-and-execute`, `reflect`) saiba dos detalhes de fallback.
- **Alternatives considered**:
  - Contar apenas se houve exceção seguida de sucesso (heurística por número de chamadas via `CallCounter`): rejeitado por ser frágil quando o próprio retry do modelo primário já gera múltiplas chamadas antes de ter sucesso nele mesmo (retry não é fallback).
  - Modificar cada estratégia para injetar o "modelo usado" manualmente: rejeitado por espalhar conhecimento de infraestrutura para as estratégias, violando Princípio I.

## R4: Quais erros disparam retry/fallback vs. falham imediato

- **Decision**: Usar o comportamento padrão do LangChain para decidir "erro repetível", que por padrão trata qualquer exceção lançada pela chamada como repetível dentro do `withRetry`, e documentar como assunção (já registrado em Assumptions do spec) que a distinção fina entre erro de autenticação e erro transitório fica fora do escopo desta feature — mas o número de tentativas é pequeno (ex.: 2–3) para não mascarar por muito tempo um erro de configuração persistente (ex.: chave inválida), já que o fallback para o modelo de reserva assume o problema e finaliza rápido se a reserva também falhar por configuração.
- **Rationale**: Diferenciar tipos de erro de provedor (HTTP 401 vs. 500 vs. timeout) exigiria inspecionar a lib do provedor (`openai` SDK) por dentro do `@langchain/openai`, que já é tratado como detalhe interno da lib segundo `describeProviderError` (`src/agents/provider-errors.ts`), reaproveitável na borda para produzir a mensagem final sem vazar segredos (Princípio V / FR-007).
- **Alternatives considered**: Implementar uma função de classificação de erro customizada (repetível vs. não repetível) antes do MVP: adiada para uma iteração futura se a operação real mostrar necessidade (não há indício disso na spec).

## R5: Onde plugar a fábrica resiliente sem quebrar os outros consumidores de `createModel()`

- **Decision**: Manter `createModel()` inalterado (usado por `history-summarizer.ts` e `learning-reflector.ts`, que não fazem parte do fluxo de interação principal de resposta ao usuário e não precisam de fallback/trace, apenas do modelo primário puro) e adicionar uma nova função exportada, ex. `createResilientModel()`, em `model.ts`, usada apenas pelas estratégias que compõem a resposta final da interação (`react.ts`, `plan-and-execute.ts`, `reflection.ts`, e o roteador em `production-graph.ts`).
- **Rationale**: Escopo da spec (US1–US3) é sobre a interação principal do usuário ("para que a interação seja concluída"), refletida nas métricas de `RunMetrics`/trace da execução (`production-graph.ts`). Alterar o comportamento de summarização/aprendizado em background estaria fora do pedido do usuário e aumentaria o raio de impacto sem necessidade (evitar "gold plating").
- **Alternatives considered**: Trocar todos os usos de `createModel()` por `createResilientModel()`: rejeitado por escopo maior que o solicitado; pode ser revisitado depois se o operador quiser resiliência também em tarefas de fundo.
