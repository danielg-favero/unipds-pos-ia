# Feature Specification: Sumarização de Histórico (Pruning de Contexto)

**Feature Branch**: `011-sumarizacao-historico`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "sumarização de histórico (pruning): tabela conversation_sumarries; o que sai das 8 mensagens recentes vira resumo de ~150 tokens preservando decisões, fatos e pendências, MESCLANDO ao resumo anterior e persistindo - refeito só quando 8 novas saem da janela, nunca a cada request. Resumo entra no contexto; evento 'summarize'. Com teste fake"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contexto permanece coerente em conversas longas (Priority: P1)

Como usuário que conversa com o assistente por muitas mensagens, quero que o sistema mantenha as decisões, fatos e pendências importantes da conversa mesmo depois que as mensagens originais saiam da janela de contexto recente, para que o assistente não "esqueça" o que já foi combinado.

**Why this priority**: É o valor central da funcionalidade — sem isso, o sistema perde informação relevante assim que a conversa cresce além da janela de mensagens recentes, degradando a qualidade das respostas.

**Independent Test**: Pode ser testado enviando mais de 8 mensagens em uma conversa e verificando que fatos mencionados nas mensagens mais antigas (já fora da janela) continuam influenciando as respostas do assistente, através do resumo incluído no contexto.

**Acceptance Scenarios**:

1. **Given** uma conversa com 8 mensagens na janela recente, **When** uma 9ª mensagem é enviada, **Then** a mensagem mais antiga sai da janela recente e um resumo é gerado (ou atualizado) contendo as decisões, fatos e pendências dessa mensagem.
2. **Given** uma conversa com um resumo já existente, **When** uma nova mensagem faz uma 8ª mensagem antiga sair da janela, **Then** o novo conteúdo é mesclado ao resumo anterior (não substitui, acumula) e o resultado é persistido.
3. **Given** uma conversa com um resumo persistido, **When** o assistente monta o contexto para responder, **Then** o resumo é incluído no contexto junto das mensagens recentes.

---

### User Story 2 - Resumo não é refeito a cada request (Priority: P2)

Como responsável por operar o sistema, quero que a sumarização só seja recalculada quando de fato 8 novas mensagens saírem da janela recente, para evitar custo e latência desnecessários em cada requisição.

**Why this priority**: Garante eficiência e previsibilidade de custo; sem essa regra, cada request poderia re-sumarizar desnecessariamente, aumentando latência e custo de forma proporcional ao volume de mensagens.

**Independent Test**: Pode ser testado enviando várias mensagens consecutivas sem completar um novo lote de 8 mensagens saindo da janela e verificando (via evento/log "summarize") que nenhuma nova sumarização foi disparada nesse intervalo.

**Acceptance Scenarios**:

1. **Given** um resumo já atualizado e menos de 8 novas mensagens desde a última atualização, **When** novas mensagens são enviadas (mas ainda dentro do lote de 8), **Then** nenhum novo evento de sumarização é disparado e o resumo existente permanece inalterado.
2. **Given** exatamente 8 novas mensagens saíram da janela recente desde a última sumarização, **When** a próxima mensagem é processada, **Then** um evento "summarize" é disparado e o resumo é atualizado.

---

### User Story 3 - Resumo preserva informação essencial de forma compacta (Priority: P3)

Como usuário, quero que o resumo gerado seja compacto (cerca de 150 tokens) mas preserve decisões, fatos e pendências relevantes, para que o contexto adicional não infle demais o custo/tamanho de cada requisição.

**Why this priority**: Importante para o equilíbrio entre completude e custo, mas depende das mecânicas de acumulação (US1) e do gatilho de atualização (US2) já estarem funcionando.

**Independent Test**: Pode ser testado gerando um resumo a partir de mensagens conhecidas e verificando que o resultado contém as decisões/fatos/pendências esperadas e fica dentro de uma faixa de tamanho aproximada de 150 tokens.

**Acceptance Scenarios**:

1. **Given** um lote de 8 mensagens contendo uma decisão explícita, um fato e uma pendência, **When** o resumo é gerado, **Then** o texto resultante menciona os três elementos e tem tamanho aproximado de 150 tokens.
2. **Given** um resumo anterior e um novo lote de 8 mensagens, **When** os dois são mesclados, **Then** o resumo mesclado preserva as informações essenciais de ambos, sem simplesmente concatená-los sem controle de tamanho.

---

### Edge Cases

- O que acontece na primeira conversa, antes de existir qualquer resumo (nenhuma linha em `conversation_summaries` para aquela conversa)? O contexto deve funcionar normalmente sem resumo.
- Como o sistema lida com uma conversa que nunca ultrapassa 8 mensagens? Nenhuma sumarização deve ocorrer, e não deve haver erro.
- O que acontece se o processo de sumarização (chamada ao modelo/serviço que gera o resumo) falhar? A conversa deve continuar funcionando com o resumo anterior (ou sem resumo, se ainda não havia um), sem quebrar a resposta ao usuário.
- Como o sistema evita gerar múltiplos resumos duplicados se várias mensagens forem processadas em rápida sucessão para a mesma conversa?
- O que acontece se o resumo mesclado ultrapassar significativamente os ~150 tokens esperados (ex: conversas muito densas em decisões)? O sistema deve ter um comportamento definido (compressão adicional) em vez de crescer sem limite.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST manter uma janela das 8 mensagens mais recentes de cada conversa para uso direto no contexto, sem sumarização.
- **FR-002**: O sistema MUST, quando uma nova mensagem faz com que mensagens antigas saiam da janela das 8 mais recentes, gerar um resumo do conteúdo que saiu, preservando decisões, fatos e pendências.
- **FR-003**: O sistema MUST persistir os resumos gerados em uma tabela/estrutura dedicada (`conversation_summaries`), associada à conversa correspondente.
- **FR-004**: O sistema MUST mesclar cada novo resumo gerado com o resumo anterior já persistido para aquela conversa, produzindo um único resumo acumulado atualizado, em vez de manter múltiplos resumos parciais separados.
- **FR-005**: O sistema MUST disparar a (re)geração do resumo apenas quando um novo lote completo de 8 mensagens sair da janela recente, e não a cada request/mensagem individual.
- **FR-006**: O sistema MUST emitir um evento (ou registro equivalente) chamado "summarize" toda vez que uma sumarização for executada, permitindo rastreabilidade de quando e com que frequência ela ocorre.
- **FR-007**: O sistema MUST incluir o resumo persistido da conversa (quando existente) no contexto usado para gerar respostas, junto com as mensagens recentes.
- **FR-008**: O sistema MUST gerar resumos com tamanho alvo de aproximadamente 150 tokens, priorizando a preservação de decisões, fatos e pendências sobre detalhes redundantes ou de baixo valor.
- **FR-009**: O sistema MUST continuar operando normalmente (respondendo ao usuário) quando não existir ainda nenhum resumo para a conversa, tratando esse estado como "sem resumo" em vez de erro.
- **FR-010**: O sistema MUST tratar falhas no processo de geração/mesclagem de resumo sem interromper o fluxo principal de resposta ao usuário, retendo o resumo anterior (ou o estado "sem resumo") e tentando novamente a sumarização em um request futuro, em vez de descartar mensagens sem preservar seu conteúdo.
- **FR-011**: O sistema MUST fornecer (para fins de teste automatizado) uma forma de simular/injetar um resumidor "fake" que produza saídas determinísticas, permitindo testar a lógica de janela, mesclagem e persistência sem depender de um serviço de sumarização real.

### Key Entities *(include if feature involves data)*

- **ConversationSummary** (tabela `conversation_summaries`): representa o resumo acumulado de uma conversa. Atributos principais: identificador da conversa, texto do resumo (decisões, fatos, pendências), tamanho aproximado (tokens), timestamp/versão da última atualização, contador de mensagens já incorporadas ao resumo (para saber quando o próximo lote de 8 se completa).
- **Conversation Message Window**: representa as mensagens recentes de uma conversa mantidas fora do resumo; conceitualmente é a "janela deslizante" das últimas 8 mensagens.
- **Summarize Event**: representa o registro de que uma operação de sumarização ocorreu para uma conversa, usado para rastreabilidade/observabilidade.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em conversas com mais de 8 mensagens, informações de decisões, fatos e pendências citadas nas mensagens iniciais continuam refletidas nas respostas do assistente mesmo após saírem da janela recente, em pelo menos 95% dos casos testados.
- **SC-002**: A sumarização é recalculada apenas quando um lote completo de 8 mensagens sai da janela — nenhuma sumarização adicional ocorre nos requests intermediários, verificável a 100% via contagem de eventos "summarize".
- **SC-003**: O resumo persistido de uma conversa mantém tamanho próximo de ~150 tokens (variação aceitável de até 30%) mesmo após múltiplas mesclagens sucessivas.
- **SC-004**: O contexto enviado para gerar uma resposta inclui o resumo persistido (quando existir) em 100% das conversas que já passaram do primeiro lote de 8 mensagens.
- **SC-005**: A suíte de testes automatizados cobre o fluxo de janela, mesclagem e persistência usando um resumidor fake, sem depender de chamadas reais a serviços externos de sumarização.

## Assumptions

- "Mensagens recentes" refere-se às últimas 8 mensagens de uma mesma conversa (não 8 mensagens do usuário e 8 do assistente separadamente); o corte de janela é sobre a sequência total de mensagens.
- Existe apenas um resumo acumulado por conversa (não um histórico de múltiplas versões de resumo), sendo cada atualização uma mesclagem sobre o mesmo registro.
- A geração do texto do resumo (extração de decisões/fatos/pendências) pode ser feita por um serviço/chamada de sumarização (ex: modelo de linguagem) já usado em outras partes do sistema; para testes, esse serviço é substituído por uma implementação fake determinística.
- O "evento summarize" é um mecanismo de observabilidade (log estruturado ou registro interno) e não necessariamente uma fila/mensageria externa, salvo indicação em contrário do time.
- Conversas que nunca ultrapassam 8 mensagens não geram nenhuma linha em `conversation_summaries`.
- O comportamento em caso de falha na sumarização (FR-010) será resolvido com um padrão conservador (reter mensagens até conseguir sumarizar, tentando novamente em request futuro) caso não haja decisão explícita do time.
