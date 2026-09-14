# Feature Specification: Reflexo de Aprendizado Automático

**Feature Branch**: `009-reflexo-aprendizado`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Refletor de aprendizado: apos cada resposta, um withStructuredOutput({ hasLearned }) le a última mensagem do usuário e destila fatos duráveis (nunca pedido pontual, nunca segredo) -> memories.remember assíncrono; tool forget_preference"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sistema aprende fatos duráveis sem pedido explícito (Priority: P1)

Depois de responder a uma mensagem, o assistente analisa o que o usuário disse e, quando identifica
um fato durável sobre o usuário (uma preferência, um contexto de trabalho, uma característica
estável), memoriza esse fato automaticamente — sem que o usuário precise pedir "lembre disso".

**Why this priority**: É o valor central desta feature — sem a extração automática, a memória
semântica (008) só funcionaria se o usuário soubesse exatamente quando e o que "ensinar", o que não
é uma experiência natural de conversa.

**Independent Test**: Enviar uma mensagem que contenha um fato durável (ex.: "eu trabalho no time de
pagamentos"), aguardar a resposta do assistente, e então verificar — em uma conversa futura — que
esse fato foi retido e influencia respostas relacionadas.

**Acceptance Scenarios**:

1. **Given** uma mensagem do usuário que expressa uma preferência ou característica estável, **When**
   o assistente termina de responder, **Then** o fato durável identificado é memorizado para aquele
   usuário.
2. **Given** um fato já memorizado anteriormente, **When** o usuário expressa o mesmo fato de novo (ou
   uma variação próxima), **Then** nenhuma memória duplicada é criada (reaproveita a deduplicação já
   garantida pela memória semântica).

---

### User Story 2 - Sistema não aprende pedidos pontuais nem informações sensíveis (Priority: P1)

O processo de aprendizado automático distingue um fato durável (algo que vale reaproveitar em
conversas futuras) de um pedido pontual (uma ação ou pergunta válida só para aquele momento) e de uma
informação sensível/confidencial (que não deve ser retida). Apenas fatos duráveis e não sensíveis são
memorizados.

**Why this priority**: Sem essa distinção, a memória se poluiria rapidamente com pedidos de uso único
e passaria a reter informação sensível indevidamente — haveria risco de privacidade e de respostas
futuras contaminadas por contexto irrelevante. É tão crítico quanto a User Story 1, mas depende dela
existir para ter o que restringir.

**Independent Test**: Enviar uma mensagem contendo apenas um pedido pontual (ex.: "abra um incidente
para o serviço de checkout agora") e verificar que nenhum fato novo é memorizado. Repetir com uma
mensagem contendo uma informação sensível (ex.: uma senha ou dado confidencial) e verificar o mesmo
resultado.

**Acceptance Scenarios**:

1. **Given** uma mensagem que é apenas um pedido de ação pontual, sem nenhum fato durável sobre o
   usuário, **When** o assistente termina de responder, **Then** nenhuma memória nova é criada.
2. **Given** uma mensagem que contém uma informação sensível ou confidencial, **When** o assistente
   termina de responder, **Then** essa informação não é memorizada.
3. **Given** uma mensagem que mistura um pedido pontual com um fato durável (ex.: "abra um incidente
   pro checkout — aliás, eu só trabalho de manhã"), **When** o assistente termina de responder,
   **Then** apenas o fato durável é memorizado; o pedido pontual não gera memória.

---

### User Story 3 - Usuário pode pedir para o assistente esquecer uma preferência (Priority: P2)

Durante a conversa, o usuário pode pedir explicitamente que uma preferência específica seja
esquecida (ex.: "não preciso mais que você lembre que eu prefiro respostas curtas"), e o assistente
executa essa remoção como parte da própria conversa, sem precisar de um canal separado.

**Why this priority**: Complementa o ciclo de vida da memória (correção e controle do usuário sobre o
que é retido), mas o valor central do aprendizado automático (US1/US2) já existe sem esta capacidade.

**Independent Test**: Memorizar uma preferência (via aprendizado automático ou não), pedir ao
assistente para esquecê-la durante a conversa, e confirmar que ela não é mais usada em respostas
futuras.

**Acceptance Scenarios**:

1. **Given** uma preferência memorizada para o usuário, **When** o usuário pede ao assistente, na
   conversa, para esquecer essa preferência, **Then** a preferência é removida e deixa de influenciar
   respostas futuras.
2. **Given** um pedido para esquecer uma preferência que não existe (ou já foi removida), **When** o
   assistente processa o pedido, **Then** ele confirma que não havia nada a esquecer, sem erro.

---

### Edge Cases

- O que acontece se a análise de aprendizado (identificar fatos duráveis) falhar ou demorar? A
  resposta já entregue ao usuário não é atrasada nem afetada — o aprendizado ocorre de forma
  assíncrona, em segundo plano, após a resposta já ter sido enviada.
- O que acontece com uma mensagem que não contém nenhum fato durável nem pedido sensível (ex.: uma
  saudação)? Nenhuma memória é criada; nada de errado acontece.
- Como o sistema decide se algo é "sensível"? Informações como senhas, dados de acesso, segredos ou
  qualquer conteúdo que o próprio usuário sinalize como confidencial nunca são memorizadas.
- O que acontece se o mesmo fato durável for expressado em várias mensagens seguidas? Cada tentativa
  de aprendizado passa pela mesma verificação de deduplicação já usada pela memória semântica — não
  há acúmulo de memórias repetidas.
- O que acontece se o pedido de "esquecer" for ambíguo (não deixa claro qual preferência remover)?
  O assistente responde pedindo para o usuário especificar qual fato deve ser esquecido, em vez de
  remover algo ao acaso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Após cada resposta do assistente, o sistema MUST analisar a última mensagem do usuário
  em busca de fatos duráveis sobre esse usuário.
- **FR-002**: Quando um fato durável for identificado, o sistema MUST memorizá-lo para o usuário da
  conversa, reaproveitando as garantias de deduplicação já existentes na memória semântica.
- **FR-003**: O sistema MUST distinguir fatos duráveis (preferências, características estáveis,
  contexto de longo prazo) de pedidos pontuais (ações ou perguntas válidas apenas para o momento
  atual) e MUST memorizar somente os fatos duráveis.
- **FR-004**: O sistema MUST excluir da memorização qualquer informação sensível ou confidencial
  (ex.: senhas, segredos, dados de acesso), mesmo quando ela aparecer misturada a um fato durável.
- **FR-005**: Quando uma mensagem misturar um pedido pontual e um fato durável, o sistema MUST
  memorizar apenas a parte durável, sem gerar memória para a parte pontual.
- **FR-006**: A análise de aprendizado MUST ocorrer de forma assíncrona em relação à resposta já
  entregue ao usuário — uma falha ou demora nessa análise MUST NOT atrasar, alterar ou falhar a
  resposta que o usuário já recebeu.
- **FR-007**: O sistema MUST oferecer, durante a conversa, uma forma de o usuário pedir para
  esquecer uma preferência memorizada específica.
- **FR-008**: Um pedido de esquecer uma preferência que não existe (ou já foi removida) MUST ser
  tratado sem erro, apenas confirmando que não havia nada a remover.
- **FR-009**: Uma mensagem sem nenhum fato durável e sem informação sensível MUST resultar em
  nenhuma memória nova, sem erro.

### Key Entities *(include if feature involves data)*

- **Fato durável**: Um dado sobre o usuário destilado de uma mensagem, com valor de reaproveitamento
  em conversas futuras (preferência, característica, contexto estável). Diferencia-se de um "pedido
  pontual" (ação/pergunta de uso único) e de "informação sensível" (nunca retida).
- **Preferência memorizada**: Um fato durável já armazenado na memória semântica (008), que pode ser
  removido a pedido do usuário através desta feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um fato durável mencionado de forma natural (sem o usuário pedir explicitamente "lembre
  disso") é retido e influencia uma conversa futura relacionada.
- **SC-002**: Uma mensagem contendo apenas um pedido pontual nunca resulta em uma nova memória.
- **SC-003**: Nenhuma informação sensível ou confidencial mencionada pelo usuário é encontrada em
  memórias armazenadas.
- **SC-004**: O tempo de resposta percebido pelo usuário não aumenta de forma perceptível por causa
  do processo de aprendizado (a análise ocorre depois que a resposta já foi entregue).
- **SC-005**: Um pedido de "esquecer uma preferência" feito na conversa resulta na remoção efetiva
  dessa preferência, verificável por ela não influenciar mais respostas futuras.
- **SC-006**: Uma mensagem que mistura pedido pontual e fato durável nunca gera memória para a parte
  pontual, apenas para a parte durável.

## Assumptions

- Esta feature depende da memória semântica por usuário (008-memoria-semantica) já existir: a
  distinção aqui é sobre *quando e o que* memorizar automaticamente, não sobre como a memória em si é
  armazenada, buscada ou removida.
- "Fato durável" e "informação sensível" são julgamentos feitos pela própria análise do sistema a
  partir do conteúdo da mensagem — não há, nesta versão, uma lista fixa e exaustiva de categorias
  sensíveis mantida por configuração; a exclusão de segredos é uma responsabilidade da análise em si.
- A capacidade de "esquecer uma preferência" pela conversa (US3) opera sobre o mesmo mecanismo de
  remoção já definido pela memória semântica (008); esta feature apenas expõe esse mecanismo como algo
  que o usuário pode acionar dizendo o que quer esquecer, em linguagem natural, em vez de precisar de
  um identificador técnico da memória.
- Erros ou indisponibilidade da análise de aprendizado são tratados como "nada aprendido nesta vez" —
  não interrompem a conversa nem geram mensagem de erro visível ao usuário.
- O escopo desta feature é aprender a partir da última mensagem do usuário após cada resposta; não
  inclui reprocessar retroativamente o histórico de conversas anteriores à sua ativação.
