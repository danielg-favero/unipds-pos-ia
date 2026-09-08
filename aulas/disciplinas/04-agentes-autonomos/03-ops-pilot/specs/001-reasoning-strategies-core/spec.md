# Feature Specification: Núcleo de Raciocínio (Reasoning Strategies Core)

**Feature Branch**: `001-reasoning-strategies-core`

**Created**: 2026-09-02

**Status**: Draft

**Input**: User description: "Núcleo de raciocínio do OpsPilot: interface comum ReasoningStrategy (name + run(input) -> answer, trace, metrics); fábrica única de modelo lendo OPENROUTER_API_KEY/OPENROUTER_MODEL com temperature 0; ferramentas mock (list_alerts, open_incident, resolve_incident) sobre store pré-populado com 5 serviços e 6 alertas (3 firing, 3 resolved) e script de seed; estratégia ReAct; estratégia Plan-and-Execute (planner/executor/replanner, máximo 8 passos); limite de iterações e contagem de chamadas de LLM em toda estratégia; arena mínima que roda 1+ estratégias sobre o mesmo input e imprime traces e métricas (--strategies, --max-iterations); testes determinísticos de store e formatação de trace."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operar o plantão com uma estratégia de raciocínio (Priority: P1)

Uma pessoa de plantão descreve em linguagem natural o que precisa ("liste os alertas em disparo e abra um incidente para o mais crítico"). O núcleo de raciocínio interpreta o pedido, consulta e altera o estado operacional através das ferramentas disponíveis (listar alertas, abrir incidente, resolver incidente) e devolve uma resposta final acompanhada do registro passo a passo de como chegou nela.

**Why this priority**: É a fatia mínima que entrega valor real — sem ela nada mais do núcleo tem propósito. Uma única estratégia funcionando de ponta a ponta já é um produto utilizável.

**Independent Test**: Executar uma estratégia isolada com um pedido de plantão e verificar que a resposta final é coerente, que o registro passo a passo contém as ações executadas com seus argumentos e resultados, e que o estado operacional reflete as mudanças pedidas.

**Acceptance Scenarios**:

1. **Given** o estado operacional pré-populado com 6 alertas (3 em disparo, 3 resolvidos), **When** o operador pede "liste os alertas em disparo", **Then** a resposta enumera exatamente os 3 alertas em disparo e o registro contém uma ação de listagem com o filtro de status aplicado e a observação correspondente.
2. **Given** um alerta em disparo em um serviço conhecido, **When** o operador pede para abrir um incidente para esse serviço, **Then** um novo incidente passa a existir com título, serviço e severidade informados, e a resposta devolve o identificador do incidente criado.
3. **Given** um incidente aberto, **When** o operador pede para resolvê-lo pelo identificador, **Then** o incidente passa a constar como resolvido e a resposta confirma a resolução.
4. **Given** um pedido que referencia um serviço inexistente, **When** a estratégia executa, **Then** a falha é reportada como erro de domínio na observação do registro e a estratégia termina com uma resposta explicando o problema, sem interromper o processo abruptamente.

---

### User Story 2 - Comparar estratégias sobre o mesmo pedido (Priority: P2)

Quem está avaliando o OpsPilot roda o mesmo pedido de plantão em uma ou mais estratégias de raciocínio de uma vez e vê, lado a lado, o passo a passo de cada uma e suas métricas (quantidade de chamadas ao modelo e latência), para decidir qual estratégia usar.

**Why this priority**: É o objetivo pedagógico e de decisão do núcleo — mas depende de pelo menos uma estratégia já existir (P1).

**Independent Test**: Executar a comparação selecionando duas estratégias com o mesmo pedido e verificar que a saída apresenta, para cada estratégia, seu nome, seu registro passo a passo formatado e suas métricas.

**Acceptance Scenarios**:

1. **Given** duas estratégias registradas, **When** o avaliador executa a comparação indicando ambas e um pedido, **Then** a saída contém um bloco por estratégia com nome, registro formatado e métricas.
2. **Given** nenhuma estratégia indicada explicitamente, **When** o avaliador executa a comparação, **Then** todas as estratégias registradas são executadas.
3. **Given** um nome de estratégia desconhecido, **When** o avaliador executa a comparação, **Then** a execução falha imediatamente com uma mensagem que lista os nomes válidos.
4. **Given** um limite de iterações informado na comparação, **When** as estratégias executam, **Then** todas respeitam esse mesmo limite.
5. **Given** uma estratégia que falha durante a execução, **When** a comparação roda com outras estratégias, **Then** o erro daquela estratégia é reportado no seu bloco e as demais ainda são executadas e apresentadas.

---

### User Story 3 - Raciocínio com plano explícito e replanejamento (Priority: P3)

Para pedidos com vários passos, o avaliador quer uma estratégia que primeiro produza um plano explícito, execute um passo de cada vez e revise o que resta após cada passo, encerrando quando não sobrar nada a fazer — para poder comparar esse comportamento com o de uma estratégia puramente reativa.

**Why this priority**: Agrega valor comparativo, mas o núcleo já é útil com uma única estratégia. Depende de P1 e ganha sentido junto com P2.

**Independent Test**: Executar essa estratégia com um pedido de múltiplos passos e verificar no registro a presença de um evento de plano inicial, eventos de ação/observação por passo executado e revisões do plano restante até o encerramento.

**Acceptance Scenarios**:

1. **Given** um pedido que exige listar alertas e depois abrir um incidente, **When** a estratégia executa, **Then** o registro começa com um evento de plano contendo a lista de passos previstos.
2. **Given** um plano com passos pendentes, **When** cada passo é executado, **Then** o registro contém a ação e a observação daquele passo, seguidas de uma revisão do plano restante.
3. **Given** um plano cuja revisão não deixa passos pendentes, **When** a revisão ocorre, **Then** a estratégia encerra e emite o evento de resposta final.
4. **Given** um pedido que geraria mais passos que o teto de 8 passos, **When** a estratégia executa, **Then** ela para no teto e devolve a melhor resposta possível informando que o limite foi atingido.

---

### Edge Cases

- **Credenciais ausentes ou inválidas para o provedor de modelo**: a execução falha imediatamente, antes de qualquer chamada, com mensagem clara sobre qual configuração está faltando — e a mensagem nunca ecoa o valor da credencial.
- **Estratégia que não converge**: ao atingir o limite de iterações, a execução para e devolve uma resposta parcial explícita, com o registro completo até ali e as métricas acumuladas; a execução nunca fica em laço infinito.
- **Modelo pede uma ferramenta inexistente ou com argumentos inválidos**: a violação de contrato vira uma observação de erro no registro e a estratégia pode tentar novamente dentro do limite de iterações, em vez de abortar.
- **Resolver um incidente já resolvido ou inexistente**: erro de domínio reportado na observação, sem alterar o estado.
- **Pedido que não requer nenhuma ferramenta**: a estratégia responde diretamente, com registro contendo apenas pensamento e resposta, e contagem de chamadas ao modelo maior que zero.
- **Estado operacional vazio (sem seed)**: a listagem devolve conjunto vazio e a resposta diz explicitamente que não há alertas, em vez de inventar dados.
- **Reexecução do script de seed**: rodar o seed duas vezes deixa o estado idêntico ao de uma execução única (sem duplicatas).

## Requirements *(mandatory)*

### Functional Requirements

#### Contrato comum de estratégia

- **FR-001**: O sistema MUST expor um contrato único de estratégia de raciocínio composto por um nome identificador e uma operação de execução que recebe um pedido em texto e devolve resposta final, registro (trace) e métricas.
- **FR-002**: O registro MUST ser uma sequência de eventos tipados, com exatamente estes tipos: `thought`, `action`, `observation`, `plan`, `critique` e `answer`.
- **FR-003**: Todo evento do tipo `action` MUST carregar o nome da ferramenta invocada e os argumentos usados; todo evento `observation` MUST carregar o resultado (ou erro) da ação que o precede.
- **FR-004**: As métricas MUST conter, no mínimo, a quantidade de chamadas ao modelo e a latência total da execução em milissegundos.
- **FR-005**: Toda estratégia MUST aceitar um limite máximo de iterações e MUST encerrar ao atingi-lo, devolvendo o registro e as métricas acumulados até o momento.
- **FR-006**: Toda estratégia MUST contabilizar cada chamada ao modelo, inclusive as ocorridas em execuções interrompidas por erro ou por limite.
- **FR-007**: O sistema MUST oferecer uma formatação textual determinística do registro — a mesma sequência de eventos sempre produz a mesma saída, sem depender de rede, relógio ou ordenação instável.

#### Configuração do modelo

- **FR-008**: O sistema MUST criar instâncias do modelo de linguagem por um único ponto de configuração compartilhado por todas as estratégias.
- **FR-009**: Esse ponto MUST ler credencial e identificador de modelo exclusivamente de variáveis de ambiente (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`) e MUST falhar com erro de domínio explícito quando qualquer uma faltar.
- **FR-010**: O sistema MUST usar temperatura 0 em todas as chamadas, para maximizar reprodutibilidade.
- **FR-011**: O sistema MUST NOT registrar, imprimir ou incluir no registro o valor da credencial.

#### Ferramentas de plantão

- **FR-012**: O sistema MUST disponibilizar às estratégias exatamente três ferramentas: listar alertas (filtrando por status), abrir incidente (título, serviço e severidade) e resolver incidente (identificador).
- **FR-013**: Os argumentos de cada ferramenta MUST ser validados por esquema antes da execução; argumentos inválidos MUST produzir erro de domínio descritivo, sem alterar o estado.
- **FR-014**: A listagem de alertas MUST aceitar os status `firing` e `resolved` e MUST permitir a listagem sem filtro.
- **FR-015**: Abrir incidente MUST rejeitar serviços não cadastrados e MUST devolver o identificador do incidente criado.
- **FR-016**: Resolver incidente MUST rejeitar identificadores inexistentes e incidentes já resolvidos, informando o motivo.
- **FR-017**: As ferramentas MUST ser puras em relação à decisão e isolar todo efeito colateral na camada de armazenamento.

#### Estado operacional e seed

- **FR-018**: O sistema MUST manter um estado operacional com serviços, alertas e incidentes, acessível apenas pela camada de armazenamento.
- **FR-019**: O sistema MUST oferecer um script de carga inicial (seed) que popula o estado com 5 serviços e 6 alertas, sendo 3 com status `firing` e 3 com status `resolved`, variados quanto a serviço e severidade.
- **FR-020**: O script de seed MUST ser idempotente: executá-lo repetidamente resulta no mesmo estado final.

#### Estratégias

- **FR-021**: O sistema MUST fornecer uma estratégia reativa (ReAct) que alterna raciocínio e uso de ferramentas até produzir a resposta, capturando no registro todos os pensamentos, ações e observações do ciclo.
- **FR-022**: O sistema MUST fornecer uma estratégia de plano e execução composta por três etapas distintas: planejamento (produz lista estruturada de passos), execução (um passo por vez, com acesso às ferramentas) e replanejamento (revisa os passos restantes após cada execução).
- **FR-023**: A estratégia de plano e execução MUST encerrar quando o replanejamento não deixar passos pendentes e MUST respeitar um teto rígido de 8 passos.
- **FR-024**: Ambas as estratégias MUST produzir registro e métricas conformes ao contrato comum, de modo a serem intercambiáveis.

#### Comparação (arena)

- **FR-025**: O sistema MUST oferecer um modo de comparação que executa uma ou mais estratégias sobre o mesmo pedido e imprime, por estratégia, o registro formatado e as métricas.
- **FR-026**: A comparação MUST aceitar a seleção das estratégias a executar e o limite de iterações aplicado a todas elas.
- **FR-027**: Quando nenhuma estratégia for selecionada, a comparação MUST executar todas as registradas.
- **FR-028**: A comparação MUST validar seus parâmetros de entrada e recusar nomes de estratégia desconhecidos, listando os nomes válidos.
- **FR-029**: A falha de uma estratégia MUST NOT impedir a execução e a apresentação das demais.

#### Testes

- **FR-030**: O sistema MUST cobrir com testes automatizados o comportamento do armazenamento (listagem por status, abertura e resolução de incidentes, casos de erro) e a formatação do registro.
- **FR-031**: Esses testes MUST ser determinísticos e MUST NOT depender de acesso à rede nem de chamadas reais ao modelo.

### Key Entities

- **Serviço**: unidade operacional monitorada; possui identificador e nome. É o alvo de alertas e incidentes.
- **Alerta**: sinal emitido sobre um serviço; possui identificador, serviço de origem, severidade, status (`firing` ou `resolved`) e um resumo.
- **Incidente**: registro de trabalho aberto em resposta a um problema; possui identificador, título, serviço, severidade e estado (aberto ou resolvido).
- **Evento de registro (trace event)**: unidade do passo a passo de uma execução; possui tipo (`thought`, `action`, `observation`, `plan`, `critique`, `answer`) e conteúdo específico do tipo — ações carregam ferramenta e argumentos.
- **Métricas de execução**: números agregados de uma execução — chamadas ao modelo e latência total.
- **Estratégia de raciocínio**: unidade nomeada que transforma um pedido em resposta, registro e métricas, seguindo o contrato comum.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador obtém, para um pedido de plantão típico, uma resposta final e o passo a passo completo em uma única execução, sem precisar de qualquer ajuste manual entre as etapas.
- **SC-002**: 100% das execuções, incluindo as que atingem o limite de iterações ou falham, devolvem registro e métricas — nenhuma execução termina sem prestação de contas.
- **SC-003**: Nenhuma execução ultrapassa o limite de iterações configurado, e a estratégia de plano e execução nunca executa mais de 8 passos.
- **SC-004**: Duas execuções da mesma estratégia sobre o mesmo estado inicial produzem sequências de ações equivalentes em pelo menos 90% dos casos de um conjunto de pedidos de referência.
- **SC-005**: Adicionar uma nova estratégia não exige alteração no modo de comparação nem nas ferramentas — basta registrá-la e ela aparece na comparação.
- **SC-006**: O avaliador consegue comparar duas estratégias sobre o mesmo pedido com um único comando e ver as métricas de ambas lado a lado.
- **SC-007**: A suíte de testes de armazenamento e formatação roda sem acesso à rede e passa de forma repetida (10 execuções consecutivas com o mesmo resultado).
- **SC-008**: A carga inicial deixa o ambiente com exatamente 5 serviços e 6 alertas (3 em disparo, 3 resolvidos), verificável por listagem.

## Assumptions

- **Público**: os usuários do núcleo são pessoas de plantão e quem avalia estratégias de raciocínio; não há interface gráfica no escopo — a interação acontece por linha de comando.
- **Idioma**: pedidos e respostas em português; nomes de ferramentas, status e campos permanecem em inglês.
- **Ferramentas mock**: as ferramentas operam sobre dados fictícios locais; não há integração com sistemas reais de alerta ou incidente neste escopo.
- **Limite de iterações padrão**: quando não informado, adota-se um valor conservador (8) coerente com o teto da estratégia de plano e execução.
- **Latência**: a métrica de latência é medida em milissegundos de ponta a ponta da execução da estratégia (o campo `latencyMds` do pedido original é interpretado como `latencyMs`).
- **Persistência**: o estado operacional é persistido em banco relacional acessado pela camada de armazenamento, conforme a stack do projeto; os testes exercitam o armazenamento sem rede.
- **Escopo excluído**: não fazem parte deste escopo a API HTTP, autenticação, autorização, benchmark automatizado de qualidade das respostas e persistência dos traces entre execuções.
- **Segredos**: `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` já estão disponíveis no ambiente de execução; o repositório não contém segredos.
- **Registro de estratégias**: existe um catálogo nomeado de estratégias consultado pelo modo de comparação, o que permite adicionar estratégias sem alterá-lo.
