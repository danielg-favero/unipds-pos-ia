# Feature Specification: Medição de Consumo de Contexto

**Feature Branch**: `010-medicao-contexto`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Instrumente a medição de contexto: src/context/tokens.ts com estimateTokens (chars/4) e o usage real do LangChain; métricas do /chat com promptTokens real e contextBreakdown estimado por fonte"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operador vê o consumo real de tokens de cada resposta (Priority: P1)

Quem opera ou depura o OpsPilot precisa saber, para cada resposta do `/chat`, quantos tokens de
prompt foram efetivamente consumidos pelo provedor de linguagem — não uma estimativa, o número real
reportado pela chamada — para entender custo e uso de capacidade do modelo por interação.

**Why this priority**: É o dado mais confiável de consumo; sem ele, qualquer decisão sobre custo ou
limite de contexto fica baseada em suposição. É o valor central desta feature.

**Independent Test**: Enviar uma mensagem ao `/chat` e verificar que a resposta inclui a contagem
real de tokens de prompt usada por aquela interação.

**Acceptance Scenarios**:

1. **Given** uma mensagem enviada ao `/chat`, **When** a resposta é gerada com sucesso, **Then** a
   resposta inclui a quantidade real de tokens de prompt consumida, conforme reportado pelo provedor
   de linguagem usado na interação.
2. **Given** uma interação que envolve mais de uma chamada ao modelo (ex.: com autocrítica/revisão
   ativada), **When** a resposta é gerada, **Then** a contagem real de tokens de prompt reflete o
   total consumido em todas as chamadas dessa interação, não apenas a última.

---

### User Story 2 - Operador entende de onde vem o consumo de contexto (Priority: P1)

Além do total de tokens, quem investiga uma resposta lenta, cara ou com contexto "cheio" precisa
entender a composição desse contexto: quanto veio do histórico da conversa, quanto veio de fatos
memorizados do usuário, quanto veio das instruções fixas do assistente, e quanto veio da própria
mensagem atual — para saber o que cortar ou otimizar.

**Why this priority**: Sem essa composição, um número total de tokens não é acionável — o operador
não sabe se o problema é histórico longo, memória acumulada ou instruções extensas. É tão importante
quanto o total (US1), mas depende dele existir para fazer sentido lado a lado.

**Independent Test**: Enviar uma mensagem ao `/chat` com histórico de conversa e fatos memorizados
presentes, e verificar que a resposta detalha uma estimativa de quantos tokens vieram de cada fonte
de contexto (histórico, memórias, instruções do assistente, mensagem atual).

**Acceptance Scenarios**:

1. **Given** uma interação que usa histórico de conversa, fatos memorizados e a mensagem atual,
   **When** a resposta é gerada, **Then** a resposta inclui uma composição estimada indicando quanto
   do contexto veio de cada uma dessas fontes.
2. **Given** uma interação sem histórico e sem fatos memorizados (primeira mensagem de um usuário
   novo), **When** a resposta é gerada, **Then** a composição estimada reflete corretamente que
   essas fontes contribuíram com zero, sem erro.
3. **Given** a soma das estimativas por fonte, **When** comparada ao consumo real de tokens (US1),
   **Then** ela serve como uma aproximação da mesma ordem de grandeza — não precisa ser exata, mas
   deve refletir a proporção real entre as fontes.

---

### User Story 3 - Medição de contexto nunca impede o operador de ver as demais métricas (Priority: P2)

Quando o provedor de linguagem não reportar o consumo real de tokens de uma chamada (por qualquer
motivo), o operador ainda deve ver as demais métricas da resposta normalmente, com uma indicação
clara de que o dado real não estava disponível para aquela interação.

**Why this priority**: Garante robustez — a instrumentação de contexto é um complemento observável,
não pode se tornar um ponto de falha do `/chat`. É um cuidado de borda sobre US1/US2, não um valor
novo por si só.

**Independent Test**: Simular uma resposta do modelo sem informação de consumo de tokens e verificar
que o `/chat` ainda responde normalmente, com as demais métricas presentes e uma indicação explícita
de que o consumo real não estava disponível.

**Acceptance Scenarios**:

1. **Given** uma chamada ao modelo que não reporta consumo real de tokens, **When** a resposta é
   processada, **Then** o `/chat` responde normalmente, sem erro, e a métrica de tokens reais
   indica ausência do dado (em vez de um número inventado ou zero enganoso).

---

### Edge Cases

- O que acontece quando a mensagem atual, o histórico e as memórias estão todos vazios (praticamente
  impossível, mas por segurança)? A composição estimada reflete zero para as fontes vazias, sem
  erro.
- Como a composição estimada trata o texto de instruções fixas do assistente (a "personalidade"
  padrão do OpsPilot), que não varia por requisição? Ela entra como sua própria fonte na composição,
  já que também ocupa espaço no contexto enviado ao modelo.
- O que acontece numa interação com múltiplas chamadas ao modelo (ex.: replanejamento, autocrítica)?
  O consumo real de tokens (US1) soma todas as chamadas da interação; a composição estimada (US2)
  descreve o contexto da interação como um todo, não uma chamada isolada.
- O que acontece se o número real de tokens divergir muito da soma das estimativas por fonte? Isso é
  esperado e aceitável — a composição por fonte é uma estimativa para orientar investigação, não uma
  reconciliação exata do total real.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST reportar, para cada resposta bem-sucedida do `/chat`, a quantidade real
  de tokens de prompt consumida, conforme informado pelo provedor de linguagem usado na interação.
- **FR-002**: Quando uma interação envolver mais de uma chamada ao modelo, o sistema MUST somar o
  consumo real de tokens de todas as chamadas dessa interação em um único total reportado.
- **FR-003**: O sistema MUST estimar a composição do contexto de cada interação, indicando a
  contribuição aproximada de, no mínimo: histórico da conversa, fatos memorizados do usuário,
  instruções fixas do assistente, e a mensagem atual do usuário.
- **FR-004**: A composição estimada MUST refletir corretamente fontes vazias (zero), sem erro,
  quando alguma delas não estiver presente na interação (ex.: sem histórico, sem memórias).
- **FR-005**: Quando o provedor de linguagem não reportar o consumo real de tokens de uma
  interação, o sistema MUST indicar explicitamente a ausência desse dado, em vez de reportar um
  número inventado ou um zero que possa ser confundido com consumo real nulo.
- **FR-006**: A ausência do dado real de consumo de tokens (FR-005) MUST NOT impedir o `/chat` de
  responder normalmente com as demais métricas já existentes.
- **FR-007**: As novas métricas de contexto (consumo real e composição estimada) MUST acompanhar
  cada resposta do `/chat`, ao lado das métricas já existentes (chamadas ao modelo, latência,
  mensagens de histórico).

### Key Entities *(include if feature involves data)*

- **Consumo real de tokens**: Quantidade de tokens de prompt efetivamente usada em uma interação do
  `/chat`, conforme reportado pelo provedor de linguagem; soma de todas as chamadas ao modelo dentro
  dessa interação, quando houver mais de uma. Pode estar ausente quando o provedor não a reporta.
- **Composição estimada de contexto**: Uma decomposição aproximada do contexto de uma interação,
  atribuindo uma contribuição estimada de tokens a cada fonte relevante (histórico da conversa,
  fatos memorizados, instruções fixas do assistente, mensagem atual do usuário).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Toda resposta bem-sucedida do `/chat` traz consigo a quantidade real de tokens de
  prompt consumida naquela interação (ou uma indicação explícita de indisponibilidade), sem exceção.
- **SC-002**: Toda resposta bem-sucedida do `/chat` traz consigo uma composição estimada do
  contexto por, no mínimo, quatro fontes (histórico, memórias, instruções fixas, mensagem atual).
- **SC-003**: Um operador consegue, a partir de uma única resposta do `/chat`, identificar qual
  fonte de contexto mais contribuiu para o tamanho do prompt daquela interação, sem precisar de
  ferramentas externas.
- **SC-004**: A ausência de dado real de tokens em uma interação nunca resulta em falha ou resposta
  incompleta do `/chat` — 100% dessas interações ainda entregam as demais métricas normalmente.
- **SC-005**: Interações com múltiplas chamadas ao modelo (ex.: autocrítica) reportam um único total
  real de tokens consistente com a soma das chamadas envolvidas.

## Assumptions

- "Tokens" é medido na mesma unidade que o provedor de linguagem já usa para relatar consumo — esta
  feature não introduz sua própria tokenização exata para o valor "real", apenas repassa o que o
  provedor informa.
- A composição estimada por fonte é necessariamente aproximada (não depende do tokenizador exato do
  modelo em uso); um método simples e determinístico de estimativa é aceitável, desde que
  consistente entre chamadas e proporcional ao tamanho do texto de cada fonte.
- As quatro fontes mínimas da composição (histórico, memórias, instruções fixas, mensagem atual)
  cobrem a composição de contexto de todas as estratégias de raciocínio já existentes no `/chat`;
  fontes adicionais podem ser incluídas no futuro sem invalidar esta especificação.
- Esta feature é apenas observabilidade: não altera o comportamento de resposta do `/chat`, não trunca
  nem modifica o contexto enviado ao modelo — apenas mede e reporta o que já é enviado.
- Falha ao calcular a composição estimada (algo inesperado no processamento das fontes) é tratada da
  mesma forma que a ausência de dado real (FR-005/FR-006): não impede a resposta do `/chat`.
