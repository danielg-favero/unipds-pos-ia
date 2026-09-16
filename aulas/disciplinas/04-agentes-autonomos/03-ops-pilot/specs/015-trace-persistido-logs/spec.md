# Feature Specification: Trace Persistido e Logs Estruturados

**Feature Branch**: `015-trace-persistido-logs`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Trace persistido + logs JSON: /chat: requestId no corpo e no header X-Request-Id; SQLite: requests (métricas) e trace_events (node, payloads); src/obs/logger.ts: 1 linha JSON por evento, só metadados; GET /requests/:id registro + trace ordenado"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correlacionar uma requisição do início ao fim (Priority: P1)

Como operador investigando um problema relatado por um usuário, eu quero pegar o identificador de uma requisição de chat e recuperar exatamente o que aconteceu durante seu processamento, para diagnosticar falhas ou comportamentos inesperados sem precisar reproduzir o problema.

**Why this priority**: Sem um identificador de correlação confiável e um jeito de consultar seu histórico, não há observabilidade nenhuma — esta é a capacidade fundamental que todas as outras dependem.

**Independent Test**: Pode ser testado enviando uma requisição de chat, capturando o identificador retornado, e usando-o para consultar o registro da requisição — deve retornar dados consistentes com o que foi processado.

**Acceptance Scenarios**:

1. **Given** uma requisição enviada ao endpoint de chat, **When** a resposta é recebida, **Then** o identificador da requisição está presente tanto no corpo da resposta quanto em um cabeçalho de resposta dedicado.
2. **Given** um identificador de requisição válido obtido anteriormente, **When** ele é usado para consultar o registro da requisição, **Then** o sistema retorna os dados da requisição junto com a sequência de eventos ocorridos durante seu processamento, em ordem cronológica.
3. **Given** um identificador de requisição desconhecido, **When** ele é usado para consultar o registro, **Then** o sistema informa que a requisição não foi encontrada.

---

### User Story 2 - Inspecionar as etapas internas de processamento (Priority: P2)

Como operador ou desenvolvedor, eu quero ver quais etapas (nós) o processamento de uma requisição percorreu e quais dados entraram e saíram de cada etapa, para entender onde um comportamento inesperado se originou.

**Why this priority**: Depois de localizar a requisição (US1), o próximo valor está em enxergar o "caminho" percorrido internamente — isso é o que realmente permite diagnosticar a causa raiz, mas depende da capacidade de correlação já existir.

**Independent Test**: Pode ser testado processando uma requisição que passe por múltiplas etapas internas e verificando que cada etapa aparece como um evento distinto e ordenado ao consultar o registro da requisição, com os dados relevantes de cada etapa visíveis.

**Acceptance Scenarios**:

1. **Given** uma requisição que passou por múltiplas etapas de processamento, **When** seu registro é consultado, **Then** cada etapa aparece como um evento separado, identificado pelo nome da etapa, na ordem em que ocorreu.
2. **Given** uma etapa de processamento que recebeu e produziu dados, **When** o evento correspondente é consultado, **Then** os dados de entrada e saída dessa etapa estão associados ao evento.

---

### User Story 3 - Monitorar a saúde do sistema via logs operacionais (Priority: P3)

Como operador responsável por manter o sistema no ar, eu quero que cada evento relevante gere uma linha de log estruturada e enxuta, para poder acompanhar a operação em tempo real ou alimentar ferramentas externas de monitoramento sem precisar consultar o banco de dados.

**Why this priority**: É um complemento valioso à persistência (US1/US2), útil para monitoramento em tempo real e integração com ferramentas externas, mas não é estritamente necessário para investigações pontuais já cobertas pelas histórias anteriores.

**Independent Test**: Pode ser testado processando uma requisição e verificando que, para cada evento relevante, uma linha de log estruturada foi emitida, contendo apenas metadados (sem os payloads completos).

**Acceptance Scenarios**:

1. **Given** uma requisição sendo processada, **When** um evento relevante ocorre, **Then** uma linha de log estruturada é emitida imediatamente, contendo metadados do evento (identificador da requisição, etapa, timestamp, status).
2. **Given** uma linha de log gerada, **When** seu conteúdo é inspecionado, **Then** ela não contém os payloads completos de entrada/saída, apenas metadados que identificam o evento.

### Edge Cases

- O que acontece quando o cliente da requisição de chat fornece seu próprio identificador de requisição? O sistema deve aceitar e propagar, ou sempre gerar um novo?
- Como o sistema se comporta se a escrita no armazenamento de trace falhar (ex.: banco indisponível)? O processamento da requisição principal deve continuar ou ser interrompido?
- O que acontece com requisições que falham no meio do processamento — o registro e os eventos parciais já ocorridos ficam persistidos e consultáveis?
- Como o sistema lida com payloads muito grandes em uma etapa (ex.: respostas extensas de modelo)? Há necessidade de truncar ou limitar o tamanho armazenado?
- O que ocorre quando duas requisições concorrentes geram eventos para etapas com o mesmo nome — a ordenação e associação ao registro correto permanecem corretas?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST gerar um identificador único para cada requisição processada pelo endpoint de chat.
- **FR-002**: O sistema MUST retornar o identificador da requisição tanto no corpo da resposta quanto em um cabeçalho de resposta dedicado (`X-Request-Id`).
- **FR-003**: O sistema MUST persistir um registro por requisição contendo suas métricas de execução (ex.: horário de início/fim, duração, status final).
- **FR-004**: O sistema MUST persistir, para cada requisição, a sequência de eventos internos de processamento, cada um identificado pela etapa (nó) a que pertence e contendo os dados associados a essa etapa.
- **FR-005**: O sistema MUST preservar a ordem cronológica dos eventos de uma requisição, de forma que possam ser recuperados na sequência exata em que ocorreram.
- **FR-006**: O sistema MUST expor uma forma de consulta por identificador de requisição que retorne o registro da requisição junto com seus eventos ordenados.
- **FR-007**: O sistema MUST informar de forma clara quando um identificador de requisição consultado não existir.
- **FR-008**: O sistema MUST emitir uma linha de log estruturada por evento relevante de processamento, contendo apenas metadados do evento (não os payloads completos).
- **FR-009**: O sistema MUST manter os registros de requisições e eventos disponíveis para consulta além do tempo de vida do processo que os gerou (armazenamento persistente).

### Key Entities

- **Requisição (Request)**: Representa uma chamada ao endpoint de chat. Principais atributos: identificador único, métricas de execução (início, fim, duração, status).
- **Evento de Trace (Trace Event)**: Representa uma etapa individual de processamento dentro de uma requisição. Principais atributos: identificador da requisição a que pertence, nome da etapa (nó), dados de entrada/saída associados, posição/ordem na sequência.
- **Linha de Log**: Representa um registro operacional enxuto de um evento, contendo apenas metadados (identificador da requisição, etapa, timestamp, status) — sem os dados completos do evento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador consegue localizar o histórico completo de qualquer requisição processada nos últimos 30 dias usando apenas o identificador da requisição, em menos de 10 segundos.
- **SC-002**: 100% das requisições processadas pelo endpoint de chat possuem um identificador retornado tanto no corpo quanto no cabeçalho da resposta.
- **SC-003**: 100% dos eventos de processamento persistidos são recuperáveis na ordem exata em que ocorreram.
- **SC-004**: Um operador consegue identificar, a partir dos logs operacionais, em qual etapa uma requisição está ou parou, sem precisar consultar o armazenamento persistente.
- **SC-005**: Nenhuma linha de log operacional expõe o conteúdo completo de payloads de entrada/saída processados pelo sistema.

## Assumptions

- O endpoint de chat já existe e é o único ponto de entrada relevante para esta funcionalidade nesta fase.
- "SQLite" e os nomes de tabela/arquivo citados na descrição da funcionalidade (`requests`, `trace_events`, `src/obs/logger.ts`) refletem uma decisão de implementação já tomada pela equipe; esta especificação foca no comportamento observável, e esses detalhes serão formalizados na fase de planejamento técnico.
- Quando o cliente não fornecer um identificador de requisição, o sistema gera um novo automaticamente.
- Falha ao persistir dados de trace não deve impedir o processamento e a resposta da requisição principal ao usuário (observabilidade é um efeito colateral, não um bloqueador funcional).
- Não há requisito de retenção específico informado; assume-se retenção indefinida nesta fase, podendo ser revisitada conforme volume de dados.
- Não há requisito de controle de acesso específico informado para a consulta de requisições; assume-se que o endpoint de consulta está disponível para uso interno/operacional, no mesmo nível de confiança do restante do sistema.
