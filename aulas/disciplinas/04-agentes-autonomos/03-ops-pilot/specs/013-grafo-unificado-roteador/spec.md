# Feature Specification: Grafo Unificado com Roteamento Automático de Estratégia

**Feature Branch**: `013-grafo-unificado-roteador`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "Grafo unificado:
- production-graph.ts: nós contexto, roteador, as 3 estratégias como nós e resposta
- Roteador: withStructuredOutput (route, reason); tabela no prompt; evento "route" e cada node em todo evento de trace
- /chat: strategy opcional (se vier, é override no trace)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolha automática da estratégia de raciocínio (Priority: P1)

Como usuário do OpsPilot, ao enviar uma pergunta pelo `/chat` sem indicar explicitamente qual estratégia de raciocínio usar, o sistema deve escolher automaticamente a estratégia mais adequada (entre as estratégias disponíveis) para aquela pergunta, sem exigir que eu conheça as diferenças técnicas entre elas.

**Why this priority**: É o valor central da funcionalidade — hoje o usuário precisa saber de antemão qual estratégia pedir; a escolha automática remove esse conhecimento prévio necessário e é a base sobre a qual as demais histórias se apoiam.

**Independent Test**: Enviar uma pergunta ao `/chat` sem o campo de estratégia e verificar que uma resposta é produzida usando uma das estratégias existentes, escolhida com base no conteúdo da pergunta.

**Acceptance Scenarios**:

1. **Given** uma pergunta simples e direta enviada sem estratégia especificada, **When** o pedido é processado, **Then** o sistema seleciona automaticamente uma estratégia adequada e retorna uma resposta.
2. **Given** uma pergunta que exige múltiplos passos de investigação, **When** o pedido é processado sem estratégia especificada, **Then** o sistema seleciona uma estratégia adequada a esse tipo de tarefa e retorna uma resposta.
3. **Given** duas perguntas de naturezas claramente distintas (uma simples, uma complexa), **When** ambas são processadas sem estratégia especificada, **Then** o sistema pode selecionar estratégias diferentes para cada uma, de acordo com a natureza de cada pergunta.

---

### User Story 2 - Visibilidade da decisão de roteamento (Priority: P2)

Como usuário avançado (ou desenvolvedor depurando o comportamento do agente), quero ver, no histórico de raciocínio (trace) da interação, qual estratégia foi escolhida automaticamente e por quê, além de acompanhar cada etapa do processamento (obtenção de contexto, decisão de roteamento, execução da estratégia, geração da resposta).

**Why this priority**: Sem essa visibilidade, a escolha automática vira uma "caixa-preta" que dificulta confiança e depuração; depende da História 1 já existir, por isso é P2.

**Independent Test**: Enviar uma pergunta ao `/chat` sem estratégia especificada e inspecionar o trace retornado, confirmando que ele contém a decisão de roteamento (estratégia escolhida e justificativa) e um registro de cada etapa percorrida no processamento.

**Acceptance Scenarios**:

1. **Given** um pedido processado sem estratégia especificada, **When** a resposta é retornada, **Then** o trace inclui um evento indicando a estratégia escolhida e o motivo da escolha.
2. **Given** um pedido qualquer processado com sucesso, **When** o trace é inspecionado, **Then** cada etapa do processamento (obtenção de contexto, roteamento, execução da estratégia, resposta final) aparece registrada no trace, na ordem em que ocorreu.

---

### User Story 3 - Override manual da estratégia (Priority: P3)

Como usuário que já sabe qual estratégia quer usar (por exemplo, para comparar comportamentos ou repetir um teste anterior), quero poder continuar informando explicitamente a estratégia desejada no `/chat`, e ter essa escolha respeitada e sinalizada como override no trace, em vez de ser sobrescrita pela decisão automática.

**Why this priority**: Preserva uma capacidade que já existe hoje (escolha manual de estratégia); é importante para não quebrar fluxos existentes, mas depende do roteamento automático (História 1) estar implementado como novo comportamento padrão, por isso é P3.

**Independent Test**: Enviar uma pergunta ao `/chat` informando explicitamente uma estratégia e confirmar que essa estratégia (e não outra) foi a que efetivamente processou o pedido, e que o trace sinaliza que houve override manual.

**Acceptance Scenarios**:

1. **Given** um pedido enviado com uma estratégia explicitamente indicada, **When** o pedido é processado, **Then** a estratégia indicada é a que efetivamente gera a resposta, sem passar pela decisão automática de roteamento.
2. **Given** um pedido enviado com uma estratégia explicitamente indicada, **When** o trace é inspecionado, **Then** ele indica claramente que a estratégia foi definida manualmente (override), e não pela decisão automática.

---

### Edge Cases

- O que acontece quando a decisão automática de roteamento não consegue identificar com confiança qual estratégia usar (por exemplo, resposta ambígua ou fora das opções esperadas)? O sistema deve cair em uma estratégia padrão pré-definida em vez de falhar o pedido.
- O que acontece quando o usuário informa, no override manual, o nome de uma estratégia que não existe? O sistema deve retornar um erro claro, assim como já ocorre hoje para nomes de estratégia inválidos.
- O que acontece se a etapa de decisão automática falhar tecnicamente (por exemplo, indisponibilidade do provedor de linguagem usado para decidir)? O pedido não deve travar silenciosamente; o sistema deve reportar a falha ou aplicar a estratégia padrão, de forma consistente com o tratamento de erros já existente em outras etapas do processamento.
- O que acontece com pedidos que já usam a opção de autocrítica (reflexão) sobre uma estratégia? A escolha automática ou o override manual de estratégia deve continuar podendo ser combinado com a autocrítica, como já é possível hoje.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST, quando o usuário não especificar uma estratégia no pedido, decidir automaticamente qual estratégia de raciocínio, entre as disponíveis no catálogo atual, será usada para processar aquele pedido.
- **FR-002**: A decisão automática de estratégia MUST ser baseada no conteúdo do pedido do usuário.
- **FR-003**: O sistema MUST registrar, para cada pedido processado sem estratégia especificada, a estratégia escolhida automaticamente e a justificativa dessa escolha, tornando essa informação disponível junto com a resposta.
- **FR-004**: O sistema MUST continuar registrando, no histórico de raciocínio de cada pedido, cada etapa relevante do processamento (obtenção de contexto, decisão sobre a estratégia, execução da estratégia escolhida, geração da resposta final), na ordem em que ocorreram.
- **FR-005**: O sistema MUST permitir que o usuário continue informando explicitamente qual estratégia deseja usar no pedido, contornando a decisão automática.
- **FR-006**: Quando uma estratégia for informada explicitamente pelo usuário, o sistema MUST usar exatamente essa estratégia para processar o pedido, sem aplicar a decisão automática de roteamento.
- **FR-007**: Quando uma estratégia for informada explicitamente pelo usuário, o histórico de raciocínio do pedido MUST indicar que a estratégia foi definida manualmente (override), distinguindo esse caso do caso de decisão automática.
- **FR-008**: Se a decisão automática de roteamento não resultar em uma estratégia válida dentre as disponíveis, o sistema MUST aplicar uma estratégia padrão pré-definida em vez de falhar o pedido.
- **FR-009**: O sistema MUST continuar suportando a combinação da escolha de estratégia (automática ou manual) com a opção existente de autocrítica (reflexão) sobre o resultado.
- **FR-010**: O sistema MUST continuar retornando um erro claro quando o usuário especificar explicitamente uma estratégia que não exista no catálogo disponível.
- **FR-011**: O comportamento observável do `/chat` para pedidos que já especificam uma estratégia válida (resposta produzida, formato do histórico de raciocínio, uso de contexto/memória/resumo de conversa) MUST permanecer equivalente ao comportamento atual, exceto pela adição da sinalização de override descrita em FR-007.

### Key Entities

- **Decisão de Roteamento**: Representa o resultado do processo de escolha automática de estratégia para um pedido — contém a estratégia escolhida (entre as disponíveis) e a justificativa dessa escolha. Está associada a um único pedido do usuário.
- **Etapa de Processamento (nó do fluxo)**: Representa uma fase distinta pela qual um pedido passa até virar resposta — obtenção de contexto, decisão de roteamento, execução da estratégia de raciocínio escolhida e geração da resposta final. Cada etapa gera um registro correspondente no histórico de raciocínio do pedido.
- **Override de Estratégia**: Representa a indicação explícita, feita pelo usuário no pedido, de qual estratégia deve ser usada, substituindo a decisão automática de roteamento para aquele pedido específico.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuários conseguem obter uma resposta do `/chat` sem precisar informar qual estratégia de raciocínio usar, em 100% dos pedidos válidos (que hoje já seriam aceitos com uma estratégia explícita).
- **SC-002**: Para pedidos idênticos enviados repetidamente, a decisão automática de estratégia é consistente o suficiente para que o mesmo tipo de pedido (mesma complexidade/natureza) resulte, de forma esperável, na mesma categoria de estratégia.
- **SC-003**: 100% dos pedidos processados sem estratégia especificada retornam, no histórico de raciocínio, a estratégia escolhida e o motivo da escolha, permitindo auditoria posterior sem necessidade de acesso a logs internos.
- **SC-004**: 100% dos pedidos que especificam explicitamente uma estratégia continuam sendo processados exatamente por essa estratégia, e o histórico de raciocínio sinaliza esse override de forma inequívoca.
- **SC-005**: Pedidos com decisão automática ambígua ou falha na etapa de roteamento ainda recebem uma resposta (via estratégia padrão) em vez de falharem, em 100% dos casos.

## Assumptions

- O conjunto de estratégias de raciocínio disponíveis para escolha automática é o catálogo já existente no sistema (atualmente três estratégias-base), sem adicionar novas estratégias como parte desta funcionalidade.
- A estratégia padrão usada como fallback, quando a decisão automática falha ou é ambígua, é a estratégia já usada hoje como padrão do `/chat` quando nenhuma é especificada.
- A decisão automática de roteamento é feita uma única vez por pedido, no início do processamento, e não muda de estratégia no meio da execução de um mesmo pedido.
- O comportamento de combinar a escolha de estratégia com a opção de autocrítica (reflexão) segue as mesmas regras já existentes hoje para combinação manual de estratégia com reflexão.
- Usuários que hoje já informam a estratégia manualmente continuam podendo fazer isso sem qualquer mudança na forma de enviar o pedido; a única mudança perceptível para eles é a sinalização adicional de override no histórico de raciocínio.
