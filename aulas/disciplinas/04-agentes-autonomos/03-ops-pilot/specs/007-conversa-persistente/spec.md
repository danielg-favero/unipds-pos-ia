# Feature Specification: Conversa Persistente

**Feature Branch**: `[007-conversa-persistente]`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "Conversa Persistente: ConversationStore (append/lastMessages/create) + uma tabela messages como SqliteStore; /chat: conversation opcional, devolvido na resposta; 12 últimas mensagens no prompt via composição; métrica historyMessages; testes \":memory:\" + fake"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plantonista continua uma conversa anterior com o assistente (Priority: P1)

Um plantonista está trocando mensagens com o OpsPilot pelo endpoint `POST /chat`. Hoje cada requisição
é tratada isoladamente — o assistente não lembra do que foi dito antes. O plantonista precisa poder
enviar uma pergunta de acompanhamento ("e o serviço de pagamentos, também foi afetado?") e receber uma
resposta que leve em conta o que já foi conversado.

**Why this priority**: É o problema central da feature — sem histórico persistido, o assistente não
consegue manter contexto entre requisições, o que quebra qualquer interação de múltiplos turnos.

**Independent Test**: Enviar `POST /chat` sem indicar uma conversa, obter o identificador de conversa
na resposta, enviar uma segunda requisição referenciando esse identificador e confirmar que a resposta
reflete o contexto da primeira mensagem.

**Acceptance Scenarios**:

1. **Given** nenhuma conversa existente, **When** o plantonista envia `POST /chat` sem indicar uma
   conversa, **Then** uma nova conversa é criada automaticamente e seu identificador é devolvido junto
   com a resposta.
2. **Given** uma conversa já existente com mensagens trocadas, **When** o plantonista envia uma nova
   requisição a `POST /chat` indicando o identificador dessa conversa, **Then** a resposta é gerada
   considerando o histórico de mensagens anteriores daquela conversa.
3. **Given** uma conversa existente, **When** uma nova mensagem é enviada, **Then** tanto a mensagem do
   usuário quanto a resposta do assistente são registradas de forma durável na conversa.

---

### User Story 2 - Assistente mantém respostas relevantes mesmo em conversas longas (Priority: P2)

Conforme uma conversa cresce, o assistente não deve carregar todo o histórico indefinidamente — apenas
uma janela recente o suficiente para manter contexto sem degradar desempenho ou custo.

**Why this priority**: Garante que a feature funcione de forma sustentável em conversas longas, sem
crescer sem limite o volume de dados enviado a cada interação.

**Independent Test**: Criar uma conversa com mais de 12 mensagens trocadas, enviar uma nova requisição
e confirmar (via métrica de execução) que apenas as 12 mensagens mais recentes foram usadas para compor
o contexto da resposta.

**Acceptance Scenarios**:

1. **Given** uma conversa com mais de 12 mensagens registradas, **When** uma nova mensagem é enviada,
   **Then** somente as 12 mensagens mais recentes anteriores são incluídas no contexto enviado ao
   assistente.
2. **Given** qualquer execução que use histórico de conversa, **When** a resposta é produzida,
   **Then** o número de mensagens de histórico efetivamente utilizadas fica disponível como métrica da
   execução.

---

### User Story 3 - Histórico de conversas sobrevive a reinícios do processo (Priority: P2)

Assim como incidentes e alertas, as conversas e suas mensagens devem sobreviver a reinícios do processo
do OpsPilot (deploy, crash, restart), evitando que o contexto se perca junto com o processo.

**Why this priority**: Sem persistência real, a conversa some a cada reinício, tornando o histórico
útil apenas durante uma única execução do processo — o mesmo problema já resolvido para incidentes.

**Independent Test**: Criar uma conversa e trocar mensagens, reiniciar o processo que serve o servidor
HTTP, e confirmar que uma nova mensagem enviada com o mesmo identificador de conversa ainda enxerga o
histórico anterior.

**Acceptance Scenarios**:

1. **Given** uma conversa com mensagens registradas antes de um reinício do processo, **When** o
   processo é reiniciado e uma nova mensagem é enviada para a mesma conversa, **Then** as mensagens
   anteriores continuam disponíveis como histórico.

---

### Edge Cases

- O que acontece quando o plantonista envia um identificador de conversa que não existe? O sistema deve
  tratar isso de forma previsível (criando uma nova conversa com esse identificador), em vez de falhar
  silenciosamente.
- O que acontece quando uma conversa ainda não tem nenhuma mensagem (conversa recém-criada)? O contexto
  de histórico deve ser vazio, sem erro.
- O que acontece quando uma mensagem individual é muito longa? O sistema deve continuar funcionando,
  ainda que apenas as 12 mensagens mais recentes sejam consideradas independentemente do tamanho de
  cada uma.
- O que acontece se o histórico de conversa for combinado com a escolha de estratégia e a reflexão já
  suportadas por `POST /chat`? A composição do histórico no prompt deve funcionar independentemente da
  estratégia de raciocínio ou de o `reflect` estar ativo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir criar uma nova conversa persistida quando o plantonista envia uma
  mensagem sem indicar uma conversa existente.
- **FR-002**: O sistema MUST permitir registrar (append) novas mensagens — tanto do usuário quanto do
  assistente — em uma conversa existente, de forma durável.
- **FR-003**: O sistema MUST permitir recuperar as mensagens mais recentes de uma conversa, em ordem
  cronológica, para uso como contexto.
- **FR-004**: O endpoint `POST /chat` MUST aceitar um identificador de conversa opcional no corpo da
  requisição; quando omitido, uma nova conversa MUST ser criada automaticamente.
- **FR-005**: A resposta de `POST /chat` MUST sempre incluir o identificador da conversa utilizada
  (seja a informada, seja a recém-criada), permitindo que o cliente continue a mesma conversa depois.
- **FR-006**: Ao compor o contexto enviado ao assistente para gerar uma resposta, o sistema MUST incluir
  no máximo as 12 mensagens mais recentes da conversa, em ordem cronológica.
- **FR-007**: Cada execução que utilize histórico de conversa MUST expor, como métrica, a quantidade de
  mensagens de histórico efetivamente incluídas no contexto (`historyMessages`).
- **FR-008**: As conversas e suas mensagens MUST persistir de forma durável, sobrevivendo a reinícios do
  processo, seguindo o mesmo padrão de persistência já usado para os demais dados de operação (SQLite).
- **FR-009**: O sistema MUST oferecer uma implementação de armazenamento de conversas em memória (fake)
  para uso em testes, equivalente em comportamento à implementação persistente.
- **FR-010**: O histórico de conversa MUST ser compatível com as demais opções já aceitas por
  `POST /chat` (escolha de estratégia de raciocínio e ativação de autocrítica/reflexão), sem exigir que
  o cliente escolha entre usar histórico e usar essas outras opções.

## Key Entities *(include if feature involves data)*

- **Conversation**: Representa uma sessão de conversa entre o plantonista e o assistente. Possui um
  identificador único e um momento de criação.
- **Message**: Representa uma mensagem individual dentro de uma conversa. Possui a conversa a que
  pertence, o autor (usuário ou assistente), o conteúdo textual e o momento em que foi registrada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um plantonista consegue fazer uma pergunta de acompanhamento referenciando uma conversa
  anterior via `POST /chat` e obter uma resposta coerente com o que já foi dito, em 100% das interações
  testadas.
- **SC-002**: Em conversas com mais de 12 mensagens, o contexto usado para gerar cada resposta nunca
  ultrapassa as 12 mensagens mais recentes.
- **SC-003**: Mensagens e conversas registradas antes de um reinício do processo continuam acessíveis
  após o reinício, sem nenhuma perda de dado nos casos testados.
- **SC-004**: O identificador da conversa está presente em 100% das respostas de `POST /chat`,
  permitindo que o cliente sempre saiba como continuar a interação.

## Assumptions

- Uma "mensagem" no histórico corresponde tanto às mensagens enviadas pelo plantonista quanto às
  respostas produzidas pelo assistente, ambas contando para o limite das 12 mais recentes.
- O identificador de conversa é opaco ao cliente (não precisa ser legível), apenas precisa ser
  devolvido e reenviado para continuar a conversa.
- A janela de 12 mensagens é fixa para esta feature (não configurável por requisição).
- O armazenamento persistente de conversas segue o mesmo mecanismo (SQLite) já adotado para os demais
  dados do OpsPilot, mantendo consistência arquitetural.
- Quando um identificador de conversa informado não corresponde a nenhuma conversa existente, o
  comportamento padrão é criar uma nova conversa com esse identificador, em vez de retornar erro —
  privilegiando continuidade da interação do plantonista.
- Esta feature estende o endpoint `POST /chat` já existente (`src/http/server.ts`), sem alterar seu
  contrato de estratégia (`strategy`) e reflexão (`reflect`) já implementados.
