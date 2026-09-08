# Feature Specification: Camada de Reflexão (Self-Critique)

**Feature Branch**: `002-reflection-layer`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Camada Reflection: withReflection(strategy, opts) decora qualquer ReasoningStrategy: executa a base; um crítico (mesmo modelo, saída estruturada {approved, feedback}) avalia as respostas contra as observações do trace; se o crítico reprovar, regenera com o feedback no contexto; para em approved ou maxReflection (default: 2). Evento \"critique\" no trace; métricas somam as chamadas extras. Arena: reflect:react e reflect:plan-and-execute"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Obter uma resposta revisada antes de confiar nela (Priority: P1)

Quem avalia o OpsPilot quer que uma estratégia de raciocínio já entregue uma resposta que passou por uma segunda checagem: um crítico compara a resposta final com o que foi de fato observado durante a execução (os alertas listados, os incidentes abertos, os erros retornados) e só a entrega como está se ela for consistente com essas observações. Se não for, a estratégia tenta de novo levando em conta o que o crítico apontou.

**Why this priority**: É o valor central da camada — sem revisão automática, ela não existe. Uma única passagem de crítica que decida "aprovar" ou "corrigir" já entrega o essencial: reduzir respostas que contradizem o que foi observado.

**Independent Test**: Envolver uma estratégia com reflexão, rodar um pedido de plantão, e verificar que a resposta final é consistente com as observações do trace, e que o registro mostra o veredito da crítica.

**Acceptance Scenarios**:

1. **Given** uma execução cuja resposta final é consistente com o que as ferramentas observaram, **When** o crítico avalia, **Then** ele aprova na primeira passagem e a resposta é entregue sem nova tentativa.
2. **Given** uma execução cuja resposta contradiz ou ignora uma observação do trace (por exemplo, afirma que um incidente foi aberto quando a ferramenta retornou erro), **When** o crítico avalia, **Then** ele reprova, aponta o motivo, e a estratégia é executada novamente levando esse apontamento em conta.
3. **Given** uma segunda tentativa cuja resposta corrige o problema apontado, **When** o crítico avalia essa nova resposta, **Then** ele aprova e a execução encerra ali, sem uma terceira tentativa.

---

### User Story 2 - Nunca ficar preso revisando indefinidamente (Priority: P1)

Quem avalia o OpsPilot precisa ter garantia de que a revisão automática tem um limite: mesmo que o crítico nunca aprove, a execução termina em um número prático de tentativas e ainda assim entrega uma resposta, o registro completo do processo e as métricas — nunca trava, nunca estoura silenciosamente o orçamento de chamadas ao modelo.

**Why this priority**: Sem esse limite, a camada de reflexão é um risco operacional (custo e tempo descontrolados), não uma melhoria. É tão fundamental quanto a própria revisão.

**Independent Test**: Envolver uma estratégia com reflexão configurada para sempre reprovar (ou usar um cenário que nunca satisfaz o crítico) e verificar que a execução para no número máximo de tentativas configurado, entrega a última resposta obtida, e o registro mostra todas as tentativas e vereditos.

**Acceptance Scenarios**:

1. **Given** um número máximo de tentativas de revisão não informado, **When** a execução roda, **Then** o padrão de 2 tentativas adicionais é aplicado.
2. **Given** um crítico que reprova em todas as tentativas até o limite, **When** o limite é atingido, **Then** a execução encerra com a última resposta obtida (não descarta o trabalho feito), o registro mostra cada tentativa e cada veredito, e nenhuma tentativa extra é feita além do limite.
3. **Given** um limite de tentativas customizado pelo avaliador, **When** a execução roda, **Then** esse limite é respeitado em vez do padrão.

---

### User Story 3 - Comparar estratégias com e sem revisão automática (Priority: P2)

Quem avalia o OpsPilot quer comparar, lado a lado, uma estratégia "crua" (sem revisão) com a mesma estratégia envolvida em reflexão, para decidir se o ganho de qualidade compensa o custo extra de chamadas ao modelo. Isso deve funcionar tanto para a estratégia reativa quanto para a estratégia de plano e execução.

**Why this priority**: É o que torna a camada de reflexão avaliável na prática — depende das User Stories 1 e 2 já existirem, mas sem essa comparação a decisão de adotar reflexão fica sem evidência.

**Independent Test**: Rodar a comparação apontando tanto a versão sem revisão quanto a versão com revisão de uma mesma estratégia sobre o mesmo pedido, e verificar que ambos os blocos aparecem, com métricas distintas (a versão com revisão mostrando chamadas adicionais quando houve reprovação).

**Acceptance Scenarios**:

1. **Given** a estratégia reativa registrada tanto na forma crua quanto envolvida em reflexão, **When** o avaliador roda a comparação apontando as duas, **Then** ambos os blocos aparecem com seus próprios registros e métricas.
2. **Given** a estratégia de plano e execução envolvida em reflexão, **When** ela é executada, **Then** o comportamento de revisão (crítica, possível nova tentativa, limite) se aplica a ela do mesmo jeito que à estratégia reativa.
3. **Given** uma execução com reflexão em que houve pelo menos uma reprovação, **When** as métricas são comparadas com uma execução sem reflexão do mesmo pedido, **Then** a contagem de chamadas ao modelo da versão com reflexão é maior, refletindo o custo das tentativas extras.

---

### Edge Cases

- **Crítico devolve um veredito mal formado ou incompleto**: tratado como reprovação com um apontamento genérico, para que a execução ainda tente se corrigir em vez de travar ou de aprovar por acidente.
- **Estratégia base já falha ou devolve resposta parcial (por limite de iterações da própria estratégia)**: o crítico ainda avalia o que foi produzido; se reprovado, a nova tentativa roda a estratégia base do zero novamente, contando como uma tentativa de revisão.
- **Estratégia base não produz nenhuma observação no trace** (respondeu sem usar ferramentas): o crítico avalia a resposta pela ausência de observações que a sustentem, e pode reprovar se a resposta afirmar algo que exigiria uma ferramenta para ser verificado.
- **`maxReflection` configurado como zero**: a resposta da estratégia base é entregue sem nenhuma chamada ao crítico.
- **Falha de configuração ou do provedor de modelo durante a chamada ao crítico**: tratada como as demais falhas de execução — a execução encerra com uma resposta parcial explícita, preservando o trace e as métricas já acumulados, em vez de perder o trabalho feito.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer uma forma de envolver qualquer estratégia de raciocínio existente em uma camada de revisão automática, sem exigir mudanças na estratégia envolvida.
- **FR-002**: A estratégia envolvida em revisão MUST continuar respeitando o mesmo contrato de execução (pedido em texto → resposta, registro e métricas) que qualquer outra estratégia, de modo a ser intercambiável com as demais.
- **FR-003**: Após cada execução da estratégia base, o sistema MUST avaliar a resposta produzida contra as observações registradas durante essa execução, usando o mesmo modelo de linguagem configurado para as estratégias.
- **FR-004**: A avaliação MUST produzir um veredito estruturado com, no mínimo, uma aprovação ou reprovação e uma justificativa/apontamento.
- **FR-005**: Quando o veredito for de reprovação, o sistema MUST executar novamente a estratégia base, incluindo o apontamento do crítico como contexto adicional para a nova tentativa.
- **FR-006**: O sistema MUST parar de tentar novamente assim que a avaliação aprovar a resposta mais recente.
- **FR-007**: O sistema MUST impor um número máximo de tentativas adicionais de revisão, com padrão de 2 quando não especificado, e MUST parar ao atingir esse número mesmo sem aprovação.
- **FR-008**: Ao atingir o número máximo de tentativas sem aprovação, o sistema MUST entregar a resposta mais recente obtida (não descartar o trabalho realizado) e MUST marcar essa entrega como não plenamente aprovada.
- **FR-009**: O registro (trace) da execução envolvida em revisão MUST conter um evento por avaliação do crítico, incluindo o veredito e o apontamento, e MUST preservar os eventos de todas as tentativas da estratégia base, na ordem em que ocorreram.
- **FR-010**: As métricas da execução envolvida em revisão MUST somar as chamadas ao modelo de todas as tentativas da estratégia base mais as chamadas feitas pelo crítico, e a latência MUST refletir o tempo total de ponta a ponta, incluindo todas as tentativas.
- **FR-011**: A camada de revisão MUST respeitar o mesmo limite de iterações fornecido à execução, sem permitir que a soma de tentativas e chamadas ao crítico ultrapasse esse orçamento de forma descontrolada.
- **FR-012**: O sistema MUST permitir configurar o número máximo de tentativas adicionais de revisão por execução.
- **FR-013**: O catálogo de estratégias disponíveis para comparação MUST incluir, para cada estratégia de raciocínio existente, uma variante equivalente envolvida em revisão automática, identificável separadamente da variante sem revisão.
- **FR-014**: Um veredito do crítico mal formado ou incompleto MUST ser tratado como reprovação com um apontamento genérico, nunca como aprovação silenciosa nem como falha que interrompe a execução.
- **FR-015**: Quando o número máximo de tentativas adicionais for configurado como zero, o sistema MUST entregar a resposta da estratégia base sem realizar nenhuma chamada ao crítico.

### Key Entities

- **Camada de Reflexão**: envoltório aplicado a uma estratégia de raciocínio existente, responsável por orquestrar a execução da estratégia base, a avaliação crítica e as tentativas adicionais, sem alterar o comportamento interno da estratégia envolvida.
- **Veredito de Crítica**: resultado de uma avaliação, contendo a decisão (aprovado ou não) e um apontamento textual explicando o motivo — usado tanto para decidir se há nova tentativa quanto para orientar essa nova tentativa.
- **Tentativa de Revisão**: uma execução completa da estratégia base seguida de uma avaliação crítica; a execução envolvida em revisão é composta por uma ou mais tentativas, até o limite configurado.
- **Evento de Crítica no Registro**: unidade do passo a passo que documenta uma avaliação do crítico — sua decisão e seu apontamento — inserida no registro na posição em que ocorreu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma execução cuja primeira resposta já é consistente com as observações do trace é aprovada e entregue sem nenhuma tentativa adicional, mantendo o custo de chamadas ao modelo igual ao da estratégia base mais uma única avaliação crítica.
- **SC-002**: 100% das execuções envolvidas em revisão terminam com uma resposta, um registro completo (incluindo todas as tentativas e vereditos) e métricas — nenhuma execução perde o trabalho já realizado, mesmo ao atingir o limite de tentativas sem aprovação.
- **SC-003**: Nenhuma execução envolvida em revisão realiza mais tentativas adicionais do que o limite configurado (padrão 2), verificável em um conjunto de cenários que nunca satisfazem o crítico.
- **SC-004**: O avaliador consegue comparar, com um único comando, a mesma estratégia com e sem revisão automática sobre o mesmo pedido, vendo as métricas de ambas lado a lado.
- **SC-005**: Envolver uma estratégia existente em revisão automática não exige nenhuma alteração no código dessa estratégia.

## Assumptions

- **Modelo do crítico**: o crítico usa o mesmo modelo de linguagem já configurado para as estratégias (mesma fábrica, mesma credencial), não um modelo separado.
- **Escopo da crítica**: a avaliação compara a resposta final contra as observações (sucessos e erros de ferramentas) do trace da execução mais recente; não envolve critérios de estilo ou formatação, apenas consistência factual com o que foi observado.
- **Contagem de tentativas**: "tentativas adicionais" conta as regenerações após uma reprovação; o padrão de 2 significa, no pior caso, até 3 execuções da estratégia base (a original mais 2 regenerações) e até 3 avaliações do crítico.
- **Nomenclatura no catálogo**: as variantes envolvidas em revisão são identificadas de forma distinta das variantes sem revisão (por exemplo, um prefixo), para que ambas coexistam no catálogo de estratégias comparável na arena.
- **Escopo excluído**: esta funcionalidade não introduz uma nova estratégia de raciocínio própria — ela reaproveita as estratégias existentes (reativa e de plano e execução) como base a ser revisada.
