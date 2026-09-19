# Feature Specification: Modo Equipe (Supervisor Multi-Agente)

**Feature Branch**: `017-modo-equipe`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "Modo equipe em src/team/: supervisor com withStructuredOutput({ next, brief }) sobre blackboard no estado. Papéis: analista (só leitura, não propoe), planejador (sem tools), executor (incidentes, sem bypass). Evento "handoff" no trace, renderizado no "ver raciocínio". Rota "team", teto 8"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operador delega uma investigação a uma equipe de especialistas (Priority: P1)

Um operador envia uma solicitação complexa (ex.: "investigue o pico de erros e proponha uma ação") pela rota de equipe. Em vez de um único agente genérico responder, um supervisor decide, passo a passo, qual especialista (analista, planejador ou executor) deve agir a seguir, com base no que já foi descoberto até o momento (o quadro compartilhado de achados). O operador recebe uma resposta final coerente, resultado da colaboração entre os papéis.

**Why this priority**: É o comportamento central da feature — sem a orquestração supervisor→especialistas, não existe "modo equipe".

**Independent Test**: Pode ser testado enviando uma pergunta de diagnóstico à rota "team" e verificando que a resposta final reflete contribuições de pelo menos dois papéis diferentes (por exemplo, achados do analista incorporados ao plano do planejador).

**Acceptance Scenarios**:

1. **Given** uma solicitação de investigação de incidente, **When** o operador a envia pela rota de equipe, **Then** o sistema aciona sequencialmente os especialistas apropriados e devolve uma resposta final única e coerente.
2. **Given** uma investigação em andamento, **When** o supervisor decide qual especialista age a seguir, **Then** essa decisão é baseada no estado atual do quadro compartilhado de achados (o que já foi analisado, planejado ou executado).

---

### User Story 2 - Papéis respeitam seus limites de atuação (Priority: P1)

O papel analista apenas observa e relata (não propõe ações nem faz mudanças). O papel planejador organiza um plano de ação sem usar nenhuma ferramenta externa. O papel executor pode agir sobre incidentes, mas somente dentro das mesmas regras de segurança já aplicadas a ações destrutivas/sensíveis (sem burlar confirmações ou guardrails existentes).

**Why this priority**: Garante que a divisão de responsabilidades seja real e segura — é o que torna o "modo equipe" confiável para uso em operações, não apenas uma reorganização cosmética de um agente único.

**Independent Test**: Pode ser testado isoladamente verificando que (a) o analista nunca aciona ferramentas de escrita/execução nem sugere ações como se fossem decisão sua, (b) o planejador nunca aciona nenhuma ferramenta, e (c) o executor não consegue concluir uma ação sensível sem passar pela mesma confirmação/guardrail que já existe hoje.

**Acceptance Scenarios**:

1. **Given** o papel analista está ativo, **When** ele processa uma solicitação, **Then** ele apenas lê/observa dados e relata achados, sem propor ou executar ações.
2. **Given** o papel planejador está ativo, **When** ele organiza um plano, **Then** nenhuma ferramenta externa é invocada durante sua atuação.
3. **Given** o papel executor precisa agir sobre um incidente sensível, **When** a ação normalmente exigiria confirmação/guardrail, **Then** essa exigência é respeitada da mesma forma que fora do modo equipe (sem atalho).

---

### User Story 3 - Operador acompanha as transições entre especialistas no raciocínio (Priority: P2)

Ao revisar o raciocínio da conversa ("ver raciocínio"), o operador consegue ver claramente quando a responsabilidade passou de um especialista para outro (handoff), incluindo para qual papel a tarefa foi passada e um resumo do motivo/contexto dessa passagem.

**Why this priority**: Sem essa visibilidade, o modo equipe funciona como uma "caixa-preta" e perde a rastreabilidade que o produto já oferece para o raciocínio de um agente único — importante para confiança e depuração, mas não bloqueia o funcionamento básico da orquestração (P1).

**Independent Test**: Pode ser testado inspecionando o histórico de raciocínio de uma conversa no modo equipe e confirmando que cada transição entre papéis aparece como um evento distinto e legível, na ordem em que ocorreu.

**Acceptance Scenarios**:

1. **Given** uma conversa no modo equipe com múltiplas transições entre especialistas, **When** o operador abre a visualização de raciocínio, **Then** cada transição aparece como um evento de handoff identificável, mostrando o papel de destino e um breve resumo do motivo.
2. **Given** uma conversa que não envolveu troca de especialista (um único papel resolveu tudo), **When** o operador abre a visualização de raciocínio, **Then** nenhum evento de handoff é exibido indevidamente.

---

### User Story 4 - Sistema evita loops indefinidos entre especialistas (Priority: P2)

Se o supervisor continuar alternando entre especialistas sem chegar a uma resposta final, o sistema interrompe a orquestração após um número máximo de transições e entrega o melhor resultado disponível até aquele ponto, em vez de ficar preso indefinidamente.

**Why this priority**: Protege a experiência do operador e os custos operacionais contra loops de decisão, mas é uma salvaguarda sobre o fluxo principal (P1), não o comportamento central.

**Independent Test**: Pode ser testado forçando um cenário em que o supervisor tende a alternar repetidamente entre papéis e verificando que a orquestração para exatamente no limite definido, retornando uma resposta ao operador em vez de travar.

**Acceptance Scenarios**:

1. **Given** o supervisor alternando entre especialistas, **When** o número de transições atinge o teto definido, **Then** a orquestração é encerrada e uma resposta final é entregue ao operador.
2. **Given** uma investigação que se resolve em poucas transições, **When** o teto não é atingido, **Then** a orquestração termina normalmente antes do limite, sem interrupção forçada.

### Edge Cases

- O que acontece quando o supervisor não consegue decidir (saída malformada ou ambígua) qual especialista deve agir a seguir?
- Como o sistema se comporta se o analista tentar retornar uma "proposta de ação" em vez de apenas achados? A resposta deve ser tratada como observação, não como decisão executável.
- O que acontece se o executor for acionado para um incidente que não existe ou já foi resolvido?
- Como o histórico de raciocínio exibe o caso em que a orquestração é interrompida por atingir o teto de transições (deve deixar claro que foi um encerramento por limite, não uma conclusão natural)?
- O que acontece se a mesma solicitação puder ser resolvida inteiramente por um único papel (ex.: apenas o analista)? A orquestração deve poder concluir sem forçar passagem pelos outros papéis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer uma rota de conversa dedicada ao modo equipe ("team"), distinta das rotas de agente único já existentes.
- **FR-002**: O sistema MUST manter um supervisor responsável por decidir, a cada passo, qual especialista atua a seguir e por que (um breve resumo do motivo da decisão).
- **FR-003**: O supervisor MUST basear sua decisão em um quadro de achados compartilhado, acumulado ao longo da conversa, contendo as contribuições de cada especialista até o momento.
- **FR-004**: O sistema MUST oferecer pelo menos três papéis especializados: analista, planejador e executor.
- **FR-005**: O papel analista MUST apenas observar/ler informação e relatar achados, sem propor ou executar ações.
- **FR-006**: O papel planejador MUST operar sem acionar nenhuma ferramenta externa, produzindo apenas um plano com base no que já está no quadro compartilhado.
- **FR-007**: O papel executor MUST poder agir sobre incidentes, sujeito às mesmas confirmações e guardrails de segurança já exigidos para ações sensíveis/destrutivas em outros modos do sistema (nenhum atalho é criado para o modo equipe).
- **FR-008**: O sistema MUST registrar cada transição de responsabilidade entre especialistas como um evento distinto e rastreável no histórico da conversa.
- **FR-009**: Cada evento de transição MUST indicar para qual papel a responsabilidade foi passada e um resumo do motivo da passagem.
- **FR-010**: A visualização de raciocínio ("ver raciocínio") MUST exibir os eventos de transição na ordem em que ocorreram, de forma legível para o operador.
- **FR-011**: O sistema MUST limitar o número de transições entre especialistas em uma mesma conversa a um teto máximo de 8.
- **FR-012**: Ao atingir o teto de transições, o sistema MUST encerrar a orquestração e devolver uma resposta final ao operador, em vez de continuar indefinidamente.
- **FR-013**: O sistema MUST deixar claro, quando aplicável, que uma resposta foi entregue por ter atingido o teto de transições, e não por conclusão natural da investigação.

### Key Entities

- **Quadro Compartilhado (Blackboard)**: Registro acumulado, visível a todos os especialistas, dos achados, planos e ações já produzidos durante a conversa no modo equipe. Cresce a cada passo da orquestração.
- **Decisão do Supervisor**: Escolha, a cada passo, de qual especialista age a seguir, acompanhada de um breve resumo do motivo dessa escolha.
- **Papel/Especialista**: Um dos três perfis de atuação (analista, planejador, executor), cada um com permissões e limites próprios de acesso a ferramentas e ações.
- **Evento de Transição (Handoff)**: Registro de que a responsabilidade passou de um especialista para outro, contendo o papel de destino e o motivo, exibido na visualização de raciocínio.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em pelo menos 90% das investigações enviadas pela rota de equipe, a resposta final incorpora contribuições rastreáveis de mais de um especialista quando a solicitação exige análise, plano e ação.
- **SC-002**: 100% das ações sensíveis/destrutivas executadas pelo papel executor no modo equipe passam pelas mesmas confirmações/guardrails já exigidas fora do modo equipe (nenhuma exceção observada).
- **SC-003**: Em 100% das conversas do modo equipe com mais de uma transição entre especialistas, o operador consegue identificar cada transição e seu motivo ao revisar o raciocínio, sem precisar de explicação externa.
- **SC-004**: Nenhuma conversa no modo equipe excede 8 transições entre especialistas antes de retornar uma resposta ao operador.

## Assumptions

- O "modo equipe" reutiliza a mesma visualização de raciocínio ("ver raciocínio") já existente no produto, apenas adicionando um novo tipo de evento (handoff) a ela.
- O papel executor reutiliza as mesmas ferramentas/guardrails de incidentes já existentes no sistema, sem criar um caminho de execução paralelo.
- Uma "transição" é contada como cada vez que a responsabilidade passa do supervisor para um especialista (ou entre especialistas via supervisor); o teto de 8 se aplica ao total de transições dentro de uma mesma conversa/execução do modo equipe.
- O quadro compartilhado (blackboard) existe apenas durante a execução da conversa em modo equipe corrente; não há requisito de persistência entre conversas distintas.
- A rota "team" é um modo de conversa adicional, coexistindo com as rotas de agente único já existentes, sem substituí-las.
