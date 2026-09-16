# Feature Specification: War Room Console

**Feature Branch**: `016-war-room-console`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "War room web/ (Vite + react + TS) com as instructions de design: chat -> /chat com "ver raciocínio" abrindo o trace tipado. 202 vira cartão aprovar/negar; engrenagem com URL da API; base /opspilot; CORS"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversar com o agente durante um incidente (Priority: P1)

Um operador de plantão abre a War Room e conversa com o agente OpsPilot em linguagem natural para investigar e agir sobre um incidente em andamento.

**Why this priority**: É o fluxo central da ferramenta — sem chat funcional não há war room. Todo o resto (raciocínio, aprovações, configuração) só tem valor se o chat funciona.

**Independent Test**: Pode ser testado enviando uma mensagem no campo de chat e verificando que a resposta do agente aparece na conversa, entregando valor mesmo sem as demais funcionalidades.

**Acceptance Scenarios**:

1. **Given** a War Room aberta com a URL da API configurada, **When** o operador digita uma mensagem e envia, **Then** a mensagem aparece na conversa e a resposta do agente é exibida assim que chega.
2. **Given** uma conversa em andamento, **When** o operador envia uma nova mensagem, **Then** o histórico da conversa é preservado e a nova troca é adicionada ao final.
3. **Given** o agente está processando uma mensagem, **When** o operador aguarda a resposta, **Then** a interface indica visualmente que uma resposta está sendo processada.
4. **Given** a chamada ao agente falha (erro de rede ou erro do servidor), **When** a falha ocorre, **Then** a interface exibe uma mensagem de erro clara próxima à mensagem afetada, sem travar a conversa.

---

### User Story 2 - Inspecionar o raciocínio por trás de uma resposta (Priority: P2)

Um operador quer entender como o agente chegou a uma resposta ou decisão, então abre o "raciocínio" daquela troca para ver os passos que o agente seguiu (pensamentos, plano, ações/ferramentas usadas, observações, críticas).

**Why this priority**: Aumenta a confiança operacional e permite auditar decisões do agente antes de agir sobre elas, mas depende do chat (P1) já existir.

**Independent Test**: Pode ser testado clicando em "ver raciocínio" em uma resposta já recebida e verificando que os passos do raciocínio são exibidos de forma estruturada e legível.

**Acceptance Scenarios**:

1. **Given** uma resposta do agente exibida na conversa, **When** o operador clica em "ver raciocínio", **Then** os passos do raciocínio daquela resposta são exibidos em uma visualização estruturada (não como texto bruto).
2. **Given** o raciocínio de uma resposta contém múltiplos tipos de passo (pensamento, plano, ação, observação, crítica, resposta final, decisão de rota, contingência), **When** o operador visualiza o raciocínio, **Then** cada tipo de passo é identificável visualmente e apresenta as informações relevantes daquele tipo.
3. **Given** o raciocínio está aberto, **When** o operador termina a inspeção, **Then** ele consegue fechar a visualização e retomar a conversa sem perder o contexto.

---

### User Story 3 - Aprovar ou negar uma ação pendente (Priority: P1)

Quando o agente identifica uma ação sensível que requer confirmação humana (por exemplo, abrir ou resolver um incidente), a War Room apresenta essa ação como um cartão de decisão, e o operador aprova ou nega antes que a ação seja executada.

**Why this priority**: É um requisito de segurança operacional — ações sensíveis não podem ser executadas sem supervisão humana. Tem prioridade equivalente ao chat porque, sem esse controle, a ferramenta não é segura para operar incidentes reais.

**Independent Test**: Pode ser testado forçando uma resposta de "ação pendente" e verificando que um cartão de aprovar/negar aparece na conversa, e que a escolha do operador é enviada de volta ao agente.

**Acceptance Scenarios**:

1. **Given** o agente retorna uma ação pendente de aprovação, **When** a resposta chega à War Room, **Then** um cartão com a descrição da ação e as opções "Aprovar" e "Negar" é exibido no lugar de uma resposta comum.
2. **Given** um cartão de ação pendente exibido, **When** o operador clica em "Aprovar", **Then** a decisão é enviada ao agente e o cartão reflete que a ação foi aprovada (e o resultado, quando disponível).
3. **Given** um cartão de ação pendente exibido, **When** o operador clica em "Negar", **Then** a decisão é enviada ao agente e o cartão reflete que a ação foi negada, sem que a ação sensível seja executada.
4. **Given** um cartão de ação pendente já respondido (aprovado ou negado), **When** o operador revisita a conversa, **Then** o cartão permanece visível com a decisão tomada, não podendo ser respondido novamente.

---

### User Story 4 - Configurar a URL da API do agente (Priority: P3)

Um operador ou administrador abre as configurações (ícone de engrenagem) para apontar a War Room para uma URL de API diferente (por exemplo, ambiente local, staging ou produção).

**Why this priority**: Necessário para operar a ferramenta em múltiplos ambientes, mas não bloqueia o uso inicial se houver uma URL padrão razoável.

**Independent Test**: Pode ser testado abrindo as configurações, alterando a URL da API e verificando que as próximas interações de chat usam a nova URL.

**Acceptance Scenarios**:

1. **Given** a War Room aberta, **When** o operador clica no ícone de engrenagem, **Then** um painel de configurações é exibido com o campo de URL da API.
2. **Given** o painel de configurações aberto, **When** o operador insere uma nova URL válida e salva, **Then** as próximas mensagens de chat são enviadas para essa URL.
3. **Given** uma URL de API já configurada em uma sessão anterior, **When** o operador reabre a War Room, **Then** a URL configurada anteriormente continua em uso.
4. **Given** o operador insere uma URL em formato inválido, **When** ele tenta salvar, **Then** a interface exibe um erro de validação e não salva a URL inválida.

---

### Edge Cases

- O que acontece quando a URL da API configurada está incorreta ou o serviço está fora do ar? A interface deve indicar falha de conexão de forma clara, sem travar.
- O que acontece quando a resposta do agente demora muito para chegar (timeout)? A interface deve informar que o tempo esgotou e permitir nova tentativa.
- O que acontece quando o raciocínio de uma resposta vem vazio ou incompleto? A opção "ver raciocínio" deve indicar que não há passos detalhados, em vez de abrir uma visualização vazia sem explicação.
- O que acontece se o operador clicar em "Aprovar" ou "Negar" duas vezes rapidamente, ou se a rede falhar durante o envio da decisão? A decisão não pode ser enviada em duplicidade nem perdida silenciosamente.
- O que acontece quando a War Room é servida em um domínio diferente do domínio da API? A comunicação entre os dois deve funcionar sem erro de origem cruzada.
- O que acontece se o operador fechar/recarregar a página com uma ação ainda pendente de aprovação? Ao reabrir a conversa, a ação pendente (ou seu desfecho, se já resolvida) deve continuar visível.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST fornecer uma interface de chat onde o operador envia mensagens em texto livre e recebe as respostas do agente na mesma conversa.
- **FR-002**: O sistema MUST exibir o histórico da conversa em ordem cronológica, preservando trocas anteriores enquanto a War Room permanece aberta.
- **FR-003**: O sistema MUST indicar visualmente quando uma mensagem está sendo processada e ainda não há resposta.
- **FR-004**: O sistema MUST exibir uma mensagem de erro compreensível quando o envio de uma mensagem falhar, sem interromper o restante da conversa.
- **FR-005**: O sistema MUST oferecer, em cada resposta do agente, uma ação "ver raciocínio" que abre os passos estruturados que levaram àquela resposta.
- **FR-006**: O sistema MUST apresentar os passos do raciocínio de forma tipada/estruturada (cada tipo de passo — pensamento, plano, ação, observação, crítica, resposta, decisão de rota, contingência — reconhecível visualmente), e não como texto bruto ou JSON cru.
- **FR-007**: O sistema MUST permitir fechar a visualização de raciocínio e retornar à conversa sem perder o estado da conversa.
- **FR-008**: O sistema MUST identificar quando uma resposta do agente representa uma ação pendente de aprovação humana e, nesse caso, exibi-la como um cartão de decisão em vez de uma resposta de texto comum.
- **FR-009**: O cartão de ação pendente MUST apresentar uma descrição da ação proposta e duas opções claras: aprovar ou negar.
- **FR-010**: O sistema MUST enviar a decisão do operador (aprovar/negar) de volta ao agente e refletir o resultado dessa decisão no próprio cartão.
- **FR-011**: O sistema MUST impedir que um cartão de ação já decidido (aprovado ou negado) seja respondido novamente, mantendo visível a decisão tomada.
- **FR-012**: O sistema MUST fornecer um painel de configurações, acessível por um ícone de engrenagem, onde o operador define a URL da API do agente.
- **FR-013**: O sistema MUST validar o formato da URL da API antes de salvar a configuração, rejeitando valores inválidos com uma mensagem clara.
- **FR-014**: O sistema MUST persistir a URL da API configurada entre sessões, de forma que o operador não precise reconfigurá-la a cada acesso.
- **FR-015**: O sistema MUST usar a URL da API configurada (ou um padrão razoável, quando nenhuma configuração existir) para todas as chamadas de chat e de decisão sobre ações pendentes.
- **FR-016**: O sistema MUST funcionar corretamente quando a interface web e a API do agente são servidas em origens (domínios/portas) diferentes.
- **FR-017**: O sistema MUST seguir as diretrizes de design do produto (hierarquia visual, espaçamento em escala, estados vazios e de erro, suporte a tema claro/escuro e acessibilidade) em toda a interface da War Room.
- **FR-018**: O sistema MUST ser acessível a partir de um caminho de base dedicado da aplicação, de forma que possa conviver com outras aplicações no mesmo domínio.

*Nota sobre 202: no contrato atual da API, uma ação pendente de aprovação é sinalizada por um status HTTP 202 na resposta do chat; este comportamento faz parte do contrato entre a interface e a API e é referenciado aqui como contexto, não como requisito de implementação da interface.*

### Key Entities

- **Conversa**: sequência de trocas entre operador e agente em uma sessão da War Room; contém mensagens do operador, respostas do agente e cartões de ação pendente, em ordem cronológica.
- **Mensagem**: texto enviado pelo operador ou resposta de texto retornada pelo agente, associada a uma conversa.
- **Raciocínio (trace)**: sequência estruturada e tipada de passos associada a uma resposta do agente, representando como aquela resposta foi produzida (pensamentos, plano, ações, observações, críticas, decisões de rota, contingências).
- **Ação pendente**: proposta de ação sensível gerada pelo agente que aguarda decisão humana antes de ser executada; possui descrição, estado (pendente, aprovada, negada) e, quando resolvida, um resultado.
- **Configuração da API**: preferências do operador para a War Room, incluindo a URL da API do agente usada para todas as chamadas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador novo consegue enviar uma mensagem e ver a resposta do agente na War Room em menos de 1 minuto após abrir a aplicação, sem treinamento prévio.
- **SC-002**: 100% das ações pendentes de aprovação retornadas pelo agente são apresentadas como cartão de decisão, nunca como resposta de texto comum ou executadas sem confirmação visível do operador.
- **SC-003**: Um operador consegue localizar e abrir o raciocínio de qualquer resposta do agente em no máximo 2 cliques a partir da conversa.
- **SC-004**: Um operador consegue apontar a War Room para uma nova URL de API e confirmar que a mudança teve efeito em menos de 30 segundos, sem precisar recarregar manualmente configurações do sistema.
- **SC-005**: Nenhuma decisão de aprovar/negar é perdida ou duplicada mesmo sob falhas de rede transitórias, validado em teste de reenvio/instabilidade de conexão.
- **SC-006**: A interface permanece utilizável e legível tanto em tema claro quanto escuro, e todos os fluxos principais (chat, raciocínio, aprovação, configuração) são operáveis inteiramente por teclado.

## Assumptions

- A War Room é uma ferramenta interna de operação (uso por operadores/administradores autorizados), não uma interface pública; autenticação de usuário final está fora do escopo desta especificação.
- Existe uma API de chat do agente já disponível (contrato existente) que a War Room consome; esta especificação cobre a experiência da interface consumidora, não a API em si.
- O status HTTP 202 do lado da API como sinal de "ação pendente de aprovação" é tratado como um detalhe de contrato já definido, referenciado apenas para explicar a origem do cartão de aprovar/negar.
- Um único operador por sessão de navegador; colaboração multi-operador em tempo real na mesma conversa está fora do escopo desta versão.
- A lista de tipos de passo do raciocínio (pensamento, plano, ação, observação, crítica, resposta, rota, contingência) corresponde à estrutura já produzida pelo agente hoje; novos tipos futuros devem poder ser adicionados sem quebrar a visualização existente.
- "Base /opspilot" significa que a aplicação web é servida sob um caminho dedicado da instalação, permitindo compartilhar domínio com outras ferramentas; não implica requisitos adicionais de roteamento além disso.
