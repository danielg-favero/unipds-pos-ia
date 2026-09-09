# Feature Specification: Servidor MCP do OpsPilot

**Feature Branch**: `005-opspilot-mcp-server`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "MCP server do OpsPilot: src/mcp/server.ts com @modelcontextprotocol/sdk, transport stdio, expondo list_alerts, open_incident e resolve_incident - reutilizando o mesmo OpsStore e os mesmos schemas zod das tools existentes (uma única fonte de verdade). Nome do server: opspilot. Script npm: mcp = \"tsx src/mcp/server.ts\" (se precisar de env, alterar o script e carregar ela antes). REGRA CRÍTICA: nenhum console.log no server - no stdio o stdout é o canal do protocolo; diagnóstico vai para o stderr. Test: sobre o server e valida o list de tools"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cliente MCP descobre as capacidades do OpsPilot (Priority: P1)

Um cliente MCP (ex.: um assistente de IA externo ou uma ferramenta de operações) conecta-se ao servidor OpsPilot via stdio e solicita a lista de ferramentas disponíveis, para saber o que pode fazer sem precisar consultar documentação externa.

**Why this priority**: Sem descoberta de capacidades funcionando corretamente, nenhum outro fluxo do MCP é utilizável — é o pré-requisito de qualquer integração.

**Independent Test**: Iniciar o servidor, enviar a requisição padrão de listagem de ferramentas do protocolo MCP e verificar que a resposta contém exatamente as três ferramentas esperadas, cada uma com nome e descrição de parâmetros compatíveis com as regras já usadas pelo agente interno do OpsPilot.

**Acceptance Scenarios**:

1. **Given** o servidor OpsPilot está rodando e aguardando conexões, **When** um cliente MCP solicita a lista de ferramentas, **Then** o servidor retorna as ferramentas `list_alerts`, `open_incident` e `resolve_incident`, cada uma com seu esquema de entrada.
2. **Given** o servidor está rodando, **When** um cliente pergunta pelo nome/identidade do servidor, **Then** o servidor se identifica como `opspilot`.

---

### User Story 2 - Cliente MCP consulta alertas ativos (Priority: P1)

Um operador, através de um cliente MCP, invoca a ferramenta `list_alerts` para ver quais alertas estão disparando (ou resolvidos/todos), sem precisar acessar diretamente o sistema interno do OpsPilot.

**Why this priority**: É a operação de leitura mais básica de monitoramento; a maioria dos fluxos de triagem de incidentes começa por aqui.

**Independent Test**: Com dados de alerta pré-existentes no armazenamento do OpsPilot, invocar a ferramenta `list_alerts` via MCP com cada filtro de status (`firing`, `resolved`, `all`) e confirmar que os resultados retornados correspondem aos alertas esperados para cada filtro.

**Acceptance Scenarios**:

1. **Given** existem alertas em disparo e alertas resolvidos armazenados, **When** o cliente MCP invoca `list_alerts` sem informar filtro, **Then** o servidor retorna apenas os alertas em disparo (comportamento padrão).
2. **Given** existem alertas em disparo e resolvidos, **When** o cliente MCP invoca `list_alerts` com o filtro `all`, **Then** o servidor retorna todos os alertas, independentemente do status.
3. **Given** o cliente informa um filtro de status inválido, **When** a ferramenta é invocada, **Then** o servidor recusa a chamada com um erro de validação claro, sem processar a requisição.

---

### User Story 3 - Cliente MCP abre e resolve incidentes (Priority: P2)

Um operador, através de um cliente MCP, abre um novo incidente para um serviço afetado e, posteriormente, marca esse incidente como resolvido — usando as mesmas regras de negócio já aplicadas pelo agente interno do OpsPilot.

**Why this priority**: Depende da leitura de alertas (US2) para ter contexto, mas é o valor central do produto: permitir ação (não só consulta) via MCP.

**Independent Test**: Invocar `open_incident` via MCP com um serviço válido, severidade válida e título, confirmar que o incidente é criado e aparece como aberto; depois invocar `resolve_incident` com o id retornado e confirmar que o incidente passa a constar como resolvido.

**Acceptance Scenarios**:

1. **Given** um serviço válido já cadastrado, **When** o cliente MCP invoca `open_incident` com título, serviço e severidade válidos, **Then** um novo incidente é criado e seu identificador é retornado ao cliente.
2. **Given** um incidente aberto existente, **When** o cliente MCP invoca `resolve_incident` com o id desse incidente, **Then** o incidente passa a constar como resolvido.
3. **Given** um id de incidente inexistente, **When** o cliente MCP invoca `resolve_incident` com esse id, **Then** o servidor retorna um erro de domínio informando que o incidente não foi encontrado, sem quebrar a conexão.
4. **Given** dados de entrada inválidos (ex.: severidade fora do conjunto permitido, serviço vazio), **When** `open_incident` é invocado, **Then** o servidor recusa a chamada com um erro de validação claro.

---

### User Story 4 - Regras de negócio permanecem consistentes entre o agente interno e o MCP (Priority: P2)

Um mantenedor do OpsPilot precisa ter confiança de que qualquer regra de validação ou de negócio aplicada às ferramentas internas do agente (ex.: severidades permitidas, formato de título) é automaticamente refletida no servidor MCP, sem duplicação de código que possa divergir com o tempo.

**Why this priority**: É uma garantia estrutural de qualidade e manutenção, não uma funcionalidade nova ponta a ponta — mas evita divergência silenciosa de comportamento entre as duas superfícies.

**Independent Test**: Alterar uma regra de validação nas ferramentas internas existentes (ex.: severidade aceita) e confirmar, sem alterar código do servidor MCP, que o comportamento do servidor MCP reflete a mudança.

**Acceptance Scenarios**:

1. **Given** as ferramentas internas do agente definem um conjunto de severidades válidas, **When** o servidor MCP valida uma chamada de `open_incident`, **Then** ele aplica exatamente o mesmo conjunto de severidades, sem defini-lo de forma independente.
2. **Given** o armazenamento de dados (alertas, incidentes) usado pelo agente interno, **When** o servidor MCP responde a qualquer uma das três ferramentas, **Then** os dados retornados refletem o mesmo estado armazenado, sem uma cópia paralela de dados.

---

### Edge Cases

- O que acontece se o cliente MCP fechar a conexão (stdin/stdout) abruptamente no meio de uma chamada de ferramenta? O servidor deve encerrar de forma limpa, sem travar ou deixar processos pendentes.
- Como o servidor se comporta se receber uma chamada para uma ferramenta com nome desconhecido (não é uma das três expostas)? Deve responder com um erro de "ferramenta não encontrada", sem expor detalhes internos sensíveis.
- Como o servidor se comporta se o armazenamento subjacente (dados de alertas/incidentes) estiver indisponível ou vazio? As três ferramentas devem responder de forma previsível (ex.: lista vazia para `list_alerts`, erro de domínio para `resolve_incident` de um id inexistente), sem exceções não tratadas encerrando o processo.
- Qualquer saída de diagnóstico, log ou erro interno não pode ser escrita no canal padrão de saída usado pelo protocolo, sob risco de corromper a comunicação com o cliente MCP.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE expor um servidor MCP identificado como `opspilot`, acessível por um cliente MCP através do transporte de entrada/saída padrão (stdio).
- **FR-002**: O servidor MCP DEVE expor exatamente três ferramentas para o cliente: `list_alerts`, `open_incident` e `resolve_incident`.
- **FR-003**: Ao ser consultado pela lista de ferramentas, o servidor DEVE retornar nome, descrição e esquema de entrada de cada uma das três ferramentas.
- **FR-004**: A ferramenta `list_alerts` DEVE aceitar um filtro de status opcional entre `firing` (padrão), `resolved` e `all`, e retornar os alertas armazenados correspondentes a esse filtro.
- **FR-005**: A ferramenta `open_incident` DEVE aceitar título, serviço afetado e severidade, validar esses dados e criar um novo incidente no mesmo armazenamento usado pelo restante do sistema, retornando o identificador do incidente criado.
- **FR-006**: A ferramenta `resolve_incident` DEVE aceitar o identificador de um incidente e marcá-lo como resolvido no mesmo armazenamento usado pelo restante do sistema.
- **FR-007**: As regras de validação de entrada (formatos aceitos, valores permitidos, campos obrigatórios) e as regras de negócio aplicadas por cada ferramenta MCP DEVEM ser exatamente as mesmas já aplicadas pelas ferramentas equivalentes do agente interno do OpsPilot, sem redefinição paralela.
- **FR-008**: As três ferramentas do servidor MCP DEVEM ler e escrever no mesmo armazenamento de dados (alertas e incidentes) usado pelo restante da aplicação, de forma que uma ação feita via MCP seja visível para o agente interno e vice-versa.
- **FR-009**: Quando uma chamada de ferramenta falhar por dado inválido, o servidor DEVE retornar ao cliente uma mensagem de erro clara indicando qual validação falhou, sem interromper a disponibilidade do servidor para chamadas subsequentes.
- **FR-010**: Quando uma chamada de ferramenta falhar por uma condição de negócio prevista (ex.: incidente inexistente ao resolver), o servidor DEVE retornar ao cliente um erro de domínio identificável, sem interromper a disponibilidade do servidor para chamadas subsequentes.
- **FR-011**: O servidor NÃO DEVE escrever nada no canal de saída padrão usado pelo protocolo (stdout) além das mensagens do próprio protocolo MCP; qualquer informação de diagnóstico DEVE ser direcionada ao canal de erro padrão (stderr).
- **FR-012**: O sistema DEVE fornecer um comando de execução dedicado (script) que inicie o servidor MCP do OpsPilot.
- **FR-013**: O sistema DEVE incluir um teste automatizado que inicie o servidor MCP e valide que a listagem de ferramentas retornada contém exatamente as três ferramentas esperadas com seus nomes corretos.

### Key Entities

- **Ferramenta MCP (Tool)**: Capacidade exposta pelo servidor a um cliente externo; possui nome, descrição e esquema de entrada. Neste recurso: `list_alerts`, `open_incident`, `resolve_incident`.
- **Alerta**: Registro de monitoramento com status (disparando, resolvido), já existente no domínio do OpsPilot; apenas consultado por este recurso.
- **Incidente**: Registro de um problema operacional aberto para um serviço, com título, serviço afetado, severidade e status (aberto/resolvido); criado e atualizado por este recurso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um cliente MCP genérico consegue descobrir e listar as três ferramentas do OpsPilot na primeira tentativa de conexão, sem configuração adicional além de apontar para o comando de execução do servidor.
- **SC-002**: 100% das chamadas de ferramenta com dados válidos produzem o mesmo resultado que a chamada equivalente feita pelo agente interno do OpsPilot sobre o mesmo estado de dados.
- **SC-003**: 100% das chamadas de ferramenta com dados inválidos ou condições de erro previstas retornam um erro tratado ao cliente, sem neningum caso de encerramento inesperado do processo do servidor.
- **SC-004**: A saída padrão do processo do servidor contém exclusivamente mensagens do protocolo MCP, verificável por inspeção automatizada em teste.

## Assumptions

- O cliente MCP consumidor (ex.: um assistente de IA) já sabe como iniciar um processo local e se comunicar por stdio segundo o protocolo MCP padrão; não é necessário documentar esse protocolo aqui.
- As regras de validação e de negócio já existentes nas ferramentas internas do agente (severidades aceitas, campos obrigatórios, mensagens de erro de domínio) são consideradas corretas e não estão sendo alteradas por este recurso — apenas reaproveitadas.
- Não há requisito de autenticação/autorização adicional para o servidor MCP além do controle de quem pode iniciar o processo localmente (execução via stdio, não exposta em rede).
- O armazenamento de dados (alertas e incidentes) já é compartilhado e persistente conforme definido pelo restante do sistema; este recurso não introduz um novo mecanismo de persistência.
- Variáveis de ambiente eventualmente necessárias para o servidor MCP seguem o mesmo mecanismo de carregamento já usado pelos demais scripts do projeto.
