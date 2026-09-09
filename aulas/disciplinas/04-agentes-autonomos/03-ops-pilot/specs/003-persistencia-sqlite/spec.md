# Feature Specification: Persistência Real de Operações (SQLite)

**Feature Branch**: `[003-persistencia-sqlite]`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Persistência real de operações: SQLiteOpsStore implementa a interface OpsStore existente via node:sqlite; 4 tabelas (services, alerts, incidents, runbooks) espelhando os tipos do domínio; seed idempotente do cenário Mercadinho; prepared statements em todas as queries; tools novas list_incidents e consultar_runbook; composição injeta o SqliteOpsStore; mock in memory fica para testes e bench; testes sobre \":memory:\"."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plantonista consulta incidentes já registrados entre reinícios (Priority: P1)

Um plantonista abre um incidente durante o turno. Depois que o processo do OpsPilot é reiniciado
(deploy, crash, restart do agente), o incidente aberto continua existindo e pode ser consultado —
hoje isso se perde porque o armazenamento é apenas em memória.

**Why this priority**: É o problema central da feature: sem persistência real, todo histórico de
incidentes é descartado a cada reinício, o que torna o assistente inútil em produção contínua.

**Independent Test**: Abrir um incidente, reiniciar o processo que serve o agente, e confirmar via
`list_incidents` que o incidente aberto anteriormente ainda aparece com os mesmos dados.

**Acceptance Scenarios**:

1. **Given** o processo do OpsPilot rodando com armazenamento configurado, **When** um incidente é
   aberto para um serviço existente, **Then** o incidente passa a existir de forma durável (sobrevive
   ao reinício do processo).
2. **Given** um incidente aberto anteriormente e o processo reiniciado, **When** o plantonista pede a
   lista de incidentes abertos, **Then** o incidente aparece com título, serviço, severidade e status
   corretos.

---

### User Story 2 - Plantonista lista e filtra incidentes por status (Priority: P1)

O plantonista quer saber rapidamente quais incidentes estão abertos, quais já foram resolvidos, ou
ver o histórico completo, sem precisar guardar ids manualmente.

**Why this priority**: É a capacidade que torna o histórico persistido útil no dia a dia — sem uma
forma de listar/filtrar incidentes, a persistência sozinha não ajuda o plantonista a agir.

**Independent Test**: Com incidentes abertos e resolvidos previamente cadastrados, pedir a lista
filtrando por "abertos", por "resolvidos" e por "todos", e conferir que cada filtro devolve o
conjunto correto.

**Acceptance Scenarios**:

1. **Given** existem incidentes abertos e resolvidos, **When** o plantonista pede os incidentes sem
   especificar filtro, **Then** somente os incidentes abertos são devolvidos (esse é o padrão).
2. **Given** existem incidentes abertos e resolvidos, **When** o plantonista pede explicitamente os
   incidentes resolvidos, **Then** apenas os resolvidos são devolvidos, incluindo quando e com que
   resumo foram fechados.
3. **Given** existem incidentes abertos e resolvidos, **When** o plantonista pede "todos" os
   incidentes, **Then** o conjunto completo é devolvido.

---

### User Story 3 - Plantonista consulta o runbook de um serviço (Priority: P2)

Diante de um alerta ou incidente, o plantonista quer saber os passos recomendados de resposta para
aquele serviço (ex.: checkout, payments, auth) sem precisar procurar em outro sistema.

**Why this priority**: Acelera a resposta a incidentes reais, mas depende dos dados de serviços e do
seed já existirem — por isso vem depois da persistência e da listagem de incidentes.

**Independent Test**: Pedir o runbook de um serviço com runbook cadastrado e confirmar que o conteúdo
correto é devolvido; pedir o runbook de um serviço sem runbook cadastrado e confirmar uma resposta
clara de "não encontrado".

**Acceptance Scenarios**:

1. **Given** o serviço "checkout" tem um runbook cadastrado, **When** o plantonista consulta o
   runbook desse serviço, **Then** o conteúdo do runbook é devolvido.
2. **Given** um serviço existe mas não tem runbook cadastrado, **When** o plantonista consulta o
   runbook desse serviço, **Then** o sistema informa que não há runbook disponível, sem falhar.
3. **Given** um serviço que não existe é informado, **When** o plantonista consulta o runbook,
   **Then** o sistema informa que o serviço não foi encontrado.

---

### User Story 4 - Ambiente de demonstração é populado automaticamente e de forma estável (Priority: P2)

Ao subir o OpsPilot pela primeira vez (ou em qualquer ambiente novo), o cenário de demonstração
"Mercadinho" (serviços, alertas, runbooks) já deve existir, sem duplicar dados em reinícios
subsequentes.

**Why this priority**: Necessário para demos e para o bench funcionarem de forma previsível, mas é
consequência direta de já ter persistência e schema — por isso vem depois das histórias 1–3.

**Independent Test**: Iniciar o OpsPilot em um armazenamento vazio e conferir que os 5 serviços, 6
alertas (3 disparados, 3 resolvidos) e os runbooks de checkout/payments/auth aparecem; reiniciar o
processo novamente sobre o mesmo armazenamento e confirmar que a quantidade de dados não dobra.

**Acceptance Scenarios**:

1. **Given** um armazenamento novo/vazio, **When** o OpsPilot inicia, **Then** o cenário Mercadinho
   completo (5 serviços, 6 alertas, runbooks de checkout/payments/auth) é criado automaticamente.
2. **Given** o OpsPilot já foi iniciado uma vez sobre um armazenamento, **When** o processo é
   reiniciado sobre o mesmo armazenamento, **Then** os dados do cenário Mercadinho não são
   duplicados.

---

### Edge Cases

- O que acontece quando o plantonista tenta abrir um incidente para um serviço que não existe no
  armazenamento persistente? (deve continuar falhando com o mesmo erro de domínio de hoje)
- O que acontece quando um dado que violaria uma regra de domínio fechada (ex.: severidade ou status
  fora dos valores válidos) tenta ser gravado? (a gravação deve ser recusada, nunca aceita
  silenciosamente)
- O que acontece quando dois plantonistas pedem para resolver o mesmo incidente já resolvido? (a
  segunda tentativa deve falhar com o mesmo erro de "já resolvido" que existe hoje)
- O que acontece se o arquivo/local de armazenamento configurado não existir ainda (primeira
  execução em uma máquina nova)? (o sistema deve criá-lo e popular o cenário Mercadinho, sem exigir
  passo manual)
- O que acontece durante a execução dos testes automatizados? (cada execução deve partir de um
  armazenamento limpo e isolado, sem interferir em dados de outra execução ou do ambiente real)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST persistir serviços, alertas, incidentes e runbooks de forma durável,
  de modo que os dados sobrevivam a um reinício do processo.
- **FR-002**: O sistema MUST permitir configurar onde os dados persistentes ficam armazenados por
  ambiente (ex.: variável de ambiente dedicada), com um local padrão sensato quando não configurado.
- **FR-003**: O sistema MUST expor uma forma de listar incidentes filtrando por "abertos",
  "resolvidos" ou "todos", com "abertos" como comportamento padrão quando nenhum filtro é informado.
- **FR-004**: Um incidente resolvido MUST reter quando foi resolvido e um resumo do fechamento,
  visíveis ao ser listado ou consultado.
- **FR-005**: O sistema MUST expor uma forma de consultar o runbook associado a um serviço pelo
  identificador/nome do serviço.
- **FR-006**: Consultar o runbook de um serviço sem runbook cadastrado MUST devolver uma resposta
  informativa de ausência, não um erro genérico ou falha silenciosa.
- **FR-007**: Consultar o runbook de um serviço inexistente MUST devolver o mesmo tipo de erro de
  domínio já usado hoje para serviço não encontrado.
- **FR-008**: O sistema MUST rejeitar a gravação de qualquer incidente, alerta ou serviço cujo campo
  de valor fechado (ex.: severidade, status) esteja fora dos valores de domínio válidos.
- **FR-009**: O sistema MUST inicializar automaticamente a estrutura de armazenamento (schema) na
  primeira execução sobre um armazenamento novo, sem exigir passo manual de setup.
- **FR-010**: O sistema MUST popular o cenário de demonstração "Mercadinho" (5 serviços, 6 alertas —
  3 disparados e 3 resolvidos — e runbooks de checkout, payments e auth) automaticamente quando o
  armazenamento está vazio.
- **FR-011**: Repetir a inicialização sobre um armazenamento já populado MUST NOT duplicar os dados
  do cenário Mercadinho.
- **FR-012**: O comportamento hoje existente de abrir e resolver incidentes (incluindo os erros de
  domínio para serviço inexistente, incidente inexistente e incidente já resolvido) MUST continuar
  válido com o novo armazenamento persistente.
- **FR-013**: Toda operação de escrita e leitura de dados MUST usar consultas parametrizadas — texto
  vindo de fora do sistema (título de incidente, id, nome de serviço etc.) MUST NEVER ser concatenado
  diretamente na formação de uma consulta.
- **FR-014**: Os testes automatizados do sistema MUST rodar contra um armazenamento isolado e
  descartável por execução, sem depender de nem afetar dados de um armazenamento real/compartilhado.
- **FR-015**: O sistema MUST continuar oferecendo um modo de armazenamento apenas em memória (não
  durável) para uso em testes automatizados e nos cenários reproduzíveis do bench, coexistindo com o
  armazenamento durável usado no dia a dia.
- **FR-016**: A descrição de cada ferramenta exposta ao agente (incluindo as novas de listagem de
  incidentes e consulta de runbook) MUST indicar claramente quando o plantonista deve usá-la e
  documentar o significado de cada campo de entrada, incluindo os valores possíveis quando o campo
  aceita um conjunto fechado de opções.

### Key Entities *(include if feature involves data)*

- **Serviço**: um serviço monitorado (ex.: checkout, payments, auth); possui identificador e nome;
  é referenciado por alertas, incidentes e runbooks.
- **Alerta**: um sinal de monitoramento associado a um serviço, com severidade e status (disparado
  ou resolvido) e um resumo do que está ocorrendo.
- **Incidente**: um registro de resposta operacional aberto para um serviço, com título, severidade,
  status (aberto ou resolvido) e, quando resolvido, o momento da resolução e um resumo de fechamento.
- **Runbook**: o conjunto de passos recomendados de resposta associado a um serviço; um serviço pode
  não ter runbook cadastrado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um incidente aberto continua visível e correto após um reinício completo do processo,
  em 100% das verificações.
- **SC-002**: O plantonista consegue obter a lista de incidentes filtrada por status (abertos,
  resolvidos, todos) em uma única interação, sem precisar cruzar informações manualmente.
- **SC-003**: O plantonista consegue obter o runbook de um serviço em uma única interação, com
  resposta clara mesmo quando não há runbook cadastrado.
- **SC-004**: Um ambiente novo, ao ser iniciado pela primeira vez, já exibe o cenário completo de
  demonstração sem qualquer passo manual de carga de dados.
- **SC-005**: Reiniciar o processo repetidamente sobre o mesmo ambiente nunca duplica os dados do
  cenário de demonstração nem produz dados inválidos (fora dos valores de domínio permitidos).
- **SC-006**: Todos os comportamentos de abertura/resolução de incidente hoje cobertos por teste
  continuam passando sob o novo armazenamento persistente, sem regressão perceptível de tempo de
  resposta para o plantonista.

## Assumptions

- O armazenamento durável é local ao processo/ambiente onde o OpsPilot roda (não é um serviço de
  banco de dados externo compartilhado entre múltiplas instâncias).
- O cenário "Mercadinho" (5 serviços, 6 alertas, runbooks de checkout/payments/auth) é o único
  conjunto de seed necessário nesta fase; não há requisito de seeds alternativos por ambiente.
- O comportamento e os erros de domínio já existentes para abrir/resolver incidentes e listar
  alertas permanecem inalterados — esta feature troca apenas onde e como os dados são guardados, não
  as regras de negócio.
- O modo de armazenamento apenas em memória continua sendo o padrão usado por testes automatizados e
  pelo bench, para manter cenários reproduzíveis sem depender de arquivos em disco.
- Não há requisito de migração de dados de uma versão anterior do armazenamento — trata-se de uma
  fundação nova de persistência.
