# Feature Specification: Memória Semântica por Usuário

**Feature Branch**: `008-memoria-semantica`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Memória semântica: MemoryStore por userId - remember (dedup > 0.92), recall top-3 por produto escalar (min 0.3), forget; tabela memories, embedding all-MiniLM-L6-v2 local com BLOB; /chat ganhar userId e injeta o recall no prompt; teste: recall acha fato sem palavra comum."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sistema lembra fatos ditos pelo usuário (Priority: P1)

Um usuário conversa com o assistente ao longo de múltiplas sessões. Fatos relevantes que ele compartilha (preferências, contexto de trabalho, decisões) devem ser retidos e reaproveitados automaticamente em conversas futuras, sem que o usuário precise repeti-los.

**Why this priority**: É o valor central da feature — sem retenção de fatos não há memória, e as demais capacidades (busca, remoção) não têm propósito.

**Independent Test**: Enviar uma mensagem ao chat contendo um fato sobre o usuário, iniciar uma nova conversa e verificar que uma mensagem relacionada ao fato recebe uma resposta que reflete esse conhecimento, mesmo sem repetir as mesmas palavras.

**Acceptance Scenarios**:

1. **Given** um usuário identificado sem fatos memorizados, **When** ele compartilha um fato relevante durante o chat, **Then** o fato é armazenado como memória associada a esse usuário.
2. **Given** um fato já memorizado para um usuário, **When** o mesmo fato (ou uma reformulação muito próxima) é compartilhado novamente, **Then** o sistema não cria uma memória duplicada.

---

### User Story 2 - Assistente usa memórias relevantes na conversa (Priority: P1)

Ao responder uma nova mensagem de um usuário, o assistente deve recuperar automaticamente os fatos mais relevantes já memorizados para aquele usuário e usá-los como contexto adicional na geração da resposta — mesmo quando a mensagem atual não compartilha palavras com o fato memorizado, desde que o significado seja relacionado.

**Why this priority**: É o que torna a memória útil na prática; sem recuperação e injeção no prompt, os fatos armazenados nunca influenciam as respostas.

**Independent Test**: Memorizar um fato descrito com um determinado vocabulário e depois enviar uma mensagem sobre o mesmo assunto usando palavras diferentes; verificar que o fato memorizado é recuperado e influencia a resposta.

**Acceptance Scenarios**:

1. **Given** um usuário com fatos memorizados, **When** ele envia uma nova mensagem no chat, **Then** o assistente recupera os fatos mais relevantes para essa mensagem e os usa como contexto antes de responder.
2. **Given** um fato memorizado sobre um tema, **When** o usuário pergunta sobre esse tema usando termos diferentes dos originais (sem palavras em comum), **Then** o fato ainda é recuperado por ser semanticamente relacionado.
3. **Given** um usuário sem nenhum fato memorizado, **When** ele envia uma mensagem, **Then** o chat responde normalmente sem contexto adicional de memória.
4. **Given** fatos memorizados de pouca relevância para a mensagem atual, **When** a recuperação é realizada, **Then** fatos abaixo do limite mínimo de relevância não são incluídos no contexto.

---

### User Story 3 - Usuário pode remover um fato memorizado (Priority: P2)

Um usuário (ou operador em seu nome) deve poder solicitar a remoção de um fato específico anteriormente memorizado, para corrigir informações incorretas ou desatualizadas, ou por preferência de privacidade.

**Why this priority**: Importante para correção e privacidade, mas o sistema já entrega valor central (P1) sem essa capacidade — é um complemento operacional.

**Independent Test**: Memorizar um fato, solicitar sua remoção e confirmar que ele não é mais retornado em buscas futuras nem influencia novas respostas.

**Acceptance Scenarios**:

1. **Given** um fato memorizado para um usuário, **When** a remoção desse fato é solicitada, **Then** o fato deixa de existir na memória e não é mais retornado em recuperações futuras.
2. **Given** uma solicitação de remoção de um fato que não existe, **When** a remoção é executada, **Then** o sistema trata a solicitação sem erro, indicando que não havia nada a remover.

---

### Edge Cases

- O que acontece quando dois fatos são quase idênticos, mas não idênticos (ex.: pequena variação de redação)? O fato quase-duplicado (similaridade acima do limite de deduplicação) não deve gerar uma nova memória.
- Como o sistema se comporta quando um usuário nunca conversou antes (nenhuma memória e nenhum histórico)? A conversa deve funcionar normalmente, sem contexto de memória.
- O que acontece quando nenhum fato memorizado atinge o limite mínimo de relevância para a mensagem atual? Nenhum fato é injetado no contexto da resposta.
- Como memórias de usuários diferentes são isoladas? Um fato memorizado para um usuário nunca deve ser recuperado ou influenciar a conversa de outro usuário.
- O que acontece se o mesmo fato for compartilhado por dois usuários diferentes? Cada usuário mantém sua própria cópia isolada; não há deduplicação entre usuários.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST associar cada fato memorizado a um identificador de usuário (userId), isolando memórias entre usuários diferentes.
- **FR-002**: O sistema MUST permitir registrar ("remember") um novo fato para um usuário.
- **FR-003**: O sistema MUST impedir a criação de um fato duplicado (ou quase-duplicado, acima de um limite alto de similaridade semântica) para o mesmo usuário, mantendo apenas a versão já existente.
- **FR-004**: O sistema MUST permitir recuperar ("recall") os fatos mais relevantes de um usuário dada uma consulta (ex.: a mensagem atual do chat), retornando no máximo os 3 fatos mais relevantes.
- **FR-005**: O sistema MUST excluir da recuperação fatos cuja relevância semântica em relação à consulta esteja abaixo de um limite mínimo definido.
- **FR-006**: A recuperação de fatos relevantes MUST funcionar mesmo quando a consulta e o fato memorizado não compartilham palavras em comum, desde que sejam semanticamente relacionados.
- **FR-007**: O sistema MUST permitir remover ("forget") um fato memorizado específico de um usuário.
- **FR-008**: A remoção de um fato inexistente MUST ser tratada de forma idempotente, sem erro.
- **FR-009**: O endpoint de chat MUST identificar o usuário da conversa (userId) para toda interação.
- **FR-010**: Antes de gerar cada resposta do chat, o sistema MUST recuperar os fatos memorizados relevantes do usuário e incluí-los como contexto adicional para o assistente.
- **FR-011**: Quando não houver fatos relevantes memorizados para a consulta atual, o chat MUST continuar respondendo normalmente, sem contexto de memória.
- **FR-012**: Cada fato memorizado MUST reter, no mínimo, o texto do fato e o momento em que foi criado, além do vínculo com o usuário.

### Key Entities *(include if feature involves data)*

- **Memória (fato memorizado)**: Representa uma informação atômica retida sobre um usuário. Atributos conceituais: identificador único, usuário ao qual pertence, texto do fato, representação semântica usada para busca por relevância, e momento de criação.
- **Usuário**: Identificado por um userId único na conversa; possui um conjunto isolado de memórias.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um fato compartilhado em uma conversa é reaproveitado em uma consulta posterior semanticamente relacionada, mesmo sem repetir nenhuma palavra da frase original.
- **SC-002**: Compartilhar o mesmo fato (ou uma reformulação muito próxima) mais de uma vez resulta em exatamente uma memória armazenada, não múltiplas.
- **SC-003**: Ao consultar as memórias de um usuário, no máximo 3 fatos são retornados, e nenhum fato de baixa relevância (abaixo do limite mínimo definido) aparece no resultado.
- **SC-004**: Após a remoção de um fato, ele nunca mais aparece em buscas ou influencia respostas futuras para aquele usuário.
- **SC-005**: Memórias de um usuário nunca aparecem nas respostas ou buscas de outro usuário.
- **SC-006**: Uma conversa de um usuário sem fatos memorizados funciona normalmente, sem erros ou degradação perceptível de resposta.

## Assumptions

- O userId é fornecido pelo chamador do chat (ex.: cliente da API) e não requer um sistema de autenticação/login novo nesta feature.
- O limite de deduplicação (similaridade alta) e o limite mínimo de relevância na recuperação seguem os valores fornecidos pelo solicitante da feature (deduplicação acima de 0.92, relevância mínima de 0.3 de produto escalar) como padrões de negócio, não como detalhe de implementação.
- O número máximo de fatos recuperados por consulta é 3, conforme especificado.
- Fatos memorizados não expiram automaticamente nesta versão; a única forma de remoção é a solicitação explícita ("forget").
- Não há, nesta versão, uma interface para o usuário final visualizar ou editar diretamente a lista completa de suas memórias — apenas registrar, recuperar (uso interno do chat) e remover um fato específico.
- O processamento de similaridade semântica ocorre localmente, sem depender de serviços externos, mas essa é uma restrição de negócio (custo/privacidade) e não altera o comportamento observável descrito nos requisitos.
