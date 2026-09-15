# Feature Specification: Resiliência do Modelo de Linguagem

**Feature Branch**: `014-resiliencia-modelo`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "resiliência modelo: .env: OPENROUTER_MODEL_FALLBACK; fábrica model.ts: withRetry no primário; withFallback([reserva]); trace: evento "fallback"; metrics.modelUsed. Caso nada funcione, [NEEDS CLARIFICATION: comportamento não especificado]"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recuperação automática de falha transitória do modelo primário (Priority: P1)

Como operador do OpsPilot, quando o modelo de linguagem primário falha momentaneamente (timeout, erro 5xx, instabilidade da API), quero que o sistema tente novamente automaticamente antes de desistir, para que o usuário não veja uma falha por uma instabilidade passageira.

**Why this priority**: É a forma mais comum de falha (transitória) e a que gera o maior ganho de disponibilidade percebida com o menor risco, já que reutiliza o mesmo modelo configurado.

**Independent Test**: Pode ser testado isoladamente simulando uma falha transitória no modelo primário e verificando que a interação é concluída com sucesso após uma nova tentativa, sem envolver o modelo de reserva.

**Acceptance Scenarios**:

1. **Given** o modelo primário configurado, **When** a primeira chamada falha por erro transitório e a repetição subsequente tem sucesso, **Then** a interação é concluída normalmente usando o modelo primário.
2. **Given** o modelo primário configurado, **When** todas as tentativas de repetição no modelo primário falham, **Then** o sistema aciona o modelo de reserva (User Story 2) em vez de falhar imediatamente.

---

### User Story 2 - Uso do modelo de reserva quando o primário se esgota (Priority: P2)

Como operador do OpsPilot, quando o modelo primário continua falhando mesmo após novas tentativas, quero que o sistema mude automaticamente para um modelo de reserva configurado, para que a interação seja concluída sempre que possível.

**Why this priority**: Depende da User Story 1 (esgotamento das tentativas do primário) e cobre o cenário de indisponibilidade mais duradoura do modelo primário.

**Independent Test**: Pode ser testado isoladamente configurando um modelo primário que sempre falha e um modelo de reserva funcional, verificando que a interação é concluída usando o modelo de reserva.

**Acceptance Scenarios**:

1. **Given** um modelo de reserva configurado via variável de ambiente, **When** o modelo primário se esgota após as tentativas de repetição, **Then** o sistema chama o modelo de reserva e conclui a interação com sucesso, caso ele funcione.
2. **Given** uma troca para o modelo de reserva, **When** a troca ocorre, **Then** o sistema registra um evento de rastreamento (trace) do tipo "fallback" contendo a informação de que a troca ocorreu.
3. **Given** uma interação concluída (com ou sem troca de modelo), **When** as métricas da interação são reportadas, **Then** elas indicam qual modelo foi efetivamente usado para gerar a resposta final.

---

### User Story 3 - Comportamento quando nenhum modelo responde (Priority: P3)

Como operador do OpsPilot, quando tanto o modelo primário quanto o modelo de reserva falham, quero que o sistema informe claramente essa falha total, para que eu entenda que a interação não pôde ser concluída e possa agir (verificar credenciais, status dos provedores, etc.).

**Why this priority**: Cenário de exceção (falha total de dois modelos), menos frequente, mas precisa de tratamento explícito para não deixar o usuário sem retorno algum.

**Independent Test**: Pode ser testado isoladamente configurando tanto o modelo primário quanto o de reserva para falhar sempre, verificando que o sistema retorna um erro claro e registra evento(s) de rastreamento adequados, sem deixar a interação pendente.

**Acceptance Scenarios**:

1. **Given** o modelo primário esgotado e o modelo de reserva também falhando, **When** a última tentativa no modelo de reserva falha, **Then** o sistema encerra a interação com um erro claro (sem tentativas infinitas) e o erro não expõe segredos de configuração (chaves de API).
2. **Given** a falha total de ambos os modelos, **When** o erro é reportado, **Then** o rastreamento (trace) e as métricas da interação refletem que ambos os modelos falharam.

---

### Edge Cases

- Se `OPENROUTER_MODEL_FALLBACK` não estiver definido no ambiente, o sistema opera apenas com repetição no modelo primário (ver FR-008), sem tratar isso como erro de configuração.
- O que acontece se o modelo de reserva for igual ao modelo primário (mesma variável configurada duas vezes)?
- Como o sistema distingue um erro que vale a pena repetir (timeout, 5xx, instabilidade de rede) de um erro que não deve ser repetido (erro de autenticação, requisição inválida)?
- O que acontece quando o modelo de reserva também esgota suas próprias tentativas de repetição, e não apenas falha uma vez?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir configurar um modelo de reserva por meio de uma variável de ambiente dedicada, distinta da variável do modelo primário.
- **FR-002**: O sistema MUST tentar novamente automaticamente a chamada ao modelo primário um número limitado de vezes antes de considerá-lo indisponível para aquela interação.
- **FR-003**: O sistema MUST acionar o modelo de reserva automaticamente somente depois que as tentativas de repetição no modelo primário se esgotarem, sem exigir ação manual do usuário.
- **FR-004**: O sistema MUST registrar um evento de rastreamento identificável como "fallback" toda vez que uma interação passar a usar o modelo de reserva.
- **FR-005**: O sistema MUST incluir, nas métricas de cada interação, qual modelo (primário ou reserva) efetivamente produziu a resposta final.
- **FR-006**: O sistema MUST informar de forma clara e não silenciosa quando nenhum dos modelos (primário e reserva) conseguir concluir a interação, encerrando a tentativa em vez de repetir indefinidamente.
- **FR-007**: O sistema MUST NOT expor valores de credenciais (chaves de API) em mensagens de erro, eventos de rastreamento ou métricas relacionados à falha de modelo.
- **FR-008**: O sistema MUST continuar funcionando (usando apenas o modelo primário com repetição) quando a variável de ambiente do modelo de reserva não estiver definida.

### Key Entities

- **Configuração de Modelo**: representa a definição do modelo primário e, opcionalmente, do modelo de reserva, lida a partir de variáveis de ambiente.
- **Evento de Rastreamento "fallback"**: registro emitido durante a execução de uma interação indicando que houve troca do modelo primário para o modelo de reserva.
- **Métrica de Interação**: conjunto de dados reportados ao final de uma interação, incluindo qual modelo foi efetivamente usado para a resposta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Interações que enfrentam falhas transitórias no modelo primário são concluídas com sucesso sem intervenção manual em pelo menos 95% dos casos simulados de falha transitória isolada.
- **SC-002**: Quando o modelo primário está totalmente indisponível mas o modelo de reserva está saudável, 100% das interações de teste são concluídas com sucesso usando o modelo de reserva.
- **SC-003**: 100% das interações que utilizam o modelo de reserva possuem um evento de rastreamento "fallback" correspondente e uma métrica indicando o modelo efetivamente usado.
- **SC-004**: Quando ambos os modelos estão indisponíveis, 100% das interações de teste terminam em um erro claro e reportado em tempo hábil (sem ficar pendentes indefinidamente), sem vazar credenciais.

## Assumptions

- O modelo de reserva é único (uma única variável de ambiente `OPENROUTER_MODEL_FALLBACK`), não uma lista de múltiplos modelos de reserva em cascata.
- O provedor de modelos (OpenRouter) e o mecanismo de autenticação continuam os mesmos usados hoje pelo modelo primário; a troca é apenas de qual modelo é solicitado.
- O número de tentativas de repetição (retry) tanto no modelo primário quanto no modelo de reserva segue um padrão razoável de mercado (poucas tentativas, com espera crescente entre elas), na ausência de um valor explícito informado pelo usuário.
- O comportamento quando nenhum modelo funciona é sinalizar falha da interação ao usuário/chamador (não há fila de reprocessamento nem retorno de resposta parcial), conforme detalhado no FR-006 — assumido como padrão razoável diante da descrição incompleta do usuário ("Caso nada funcione,").
