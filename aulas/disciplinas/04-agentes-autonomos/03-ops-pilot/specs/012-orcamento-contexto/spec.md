# Feature Specification: Orçamento de Contexto por Seção

**Feature Branch**: `012-orcamento-contexto`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "context builder com orçamento por seção: src/context/context-builder.ts monta o prompt de TODAS as estratégias com teto por seção via env CONTEXT_BUDGET_*: system e mensagem intocáveis, resumo 200, janela 1200 (corta as mais antigas), memória 300 (corta o menor score). Teste: tetos baixos cortam na ordem certa"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prompt sempre cabe no orçamento configurado (Priority: P1)

Como operador do OpsPilot, eu configuro um teto máximo de tamanho para cada seção do contexto enviado ao provedor de LLM (resumo da conversa, janela de histórico recente, memórias do usuário), para que o prompt final nunca ultrapasse os limites de custo/latência que eu defini, independentemente de qual estratégia de raciocínio (ReAct, Plan-and-Execute, Reflection) está montando a chamada.

**Why this priority**: Sem um teto aplicado de forma centralizada e uniforme, cada estratégia pode montar prompts de tamanho imprevisível, gerando custo excessivo ou erros de limite de contexto do provedor. Esta é a capacidade central da feature.

**Independent Test**: Pode ser testado configurando tetos via variáveis de ambiente, fornecendo um histórico, um resumo e memórias que excedem os tetos, montando o prompt para qualquer estratégia e verificando que cada seção do resultado respeita seu teto.

**Acceptance Scenarios**:

1. **Given** um resumo de conversa com tamanho maior que o teto configurado para resumo, **When** o prompt é montado, **Then** o resumo incluído no prompt é cortado para caber no teto.
2. **Given** uma janela de histórico com mais mensagens do que cabem no teto configurado, **When** o prompt é montado, **Then** o resultado inclui apenas as mensagens mais recentes possíveis dentro do teto.
3. **Given** uma lista de memórias do usuário com tamanho total maior que o teto configurado, **When** o prompt é montado, **Then** o resultado prioriza as memórias com maior pontuação de relevância e descarta as de menor pontuação até caber no teto.
4. **Given** qualquer combinação de tetos, **When** o prompt é montado, **Then** o texto de sistema (instruções da estratégia) e a mensagem/solicitação atual do usuário nunca são cortados, mesmo que isso faça o prompt total ultrapassar a soma dos tetos das demais seções.

---

### User Story 2 - Corte na ordem correta sob tetos agressivos (Priority: P1)

Como operador, quando defino tetos muito baixos (por exemplo, para testes de estresse ou ambientes com contexto muito limitado), eu preciso que o corte aconteça de forma previsível e determinística: histórico corta do mais antigo para o mais novo, e memórias cortam da menor pontuação para a maior, para que o comportamento sob pressão de espaço seja sempre o mesmo e testável.

**Why this priority**: A ordem de corte é o requisito mais sensível a bugs sutis (off-by-one, ordenação invertida) e é o que a suíte de testes descrita pelo usuário precisa validar explicitamente.

**Independent Test**: Pode ser testado configurando tetos extremamente baixos (próximos de zero ou menores que uma única mensagem/memória) e verificando que o conteúdo remanescente é exatamente o esperado pela regra de corte (mais recentes para histórico, maior score para memória).

**Acceptance Scenarios**:

1. **Given** um teto de janela de histórico menor que o tamanho de todas as mensagens somadas, **When** o prompt é montado, **Then** as mensagens removidas são sempre as mais antigas primeiro, preservando a ordem cronológica das que restam.
2. **Given** um teto de memória menor que o tamanho de todas as memórias somadas, **When** o prompt é montado, **Then** as memórias removidas são sempre as de menor pontuação de relevância primeiro.
3. **Given** um teto tão baixo que nenhuma mensagem de histórico ou memória cabe inteira, **When** o prompt é montado, **Then** a seção correspondente é omitida do prompt sem gerar erro.

---

### User Story 3 - Configuração dos tetos via variáveis de ambiente (Priority: P2)

Como operador, eu configuro os tetos de cada seção através de variáveis de ambiente (`CONTEXT_BUDGET_*`), para que eu possa ajustar o comportamento por ambiente (desenvolvimento, produção, testes) sem alterar código.

**Why this priority**: Habilita a operação e o ajuste fino sem deploy de código, mas depende da lógica de corte da User Story 1/2 já existir.

**Independent Test**: Pode ser testado definindo as variáveis de ambiente com valores customizados, montando o prompt, e verificando que os tetos efetivamente aplicados correspondem aos valores configurados; e testado separadamente sem as variáveis definidas, verificando que os valores padrão documentados (resumo 200, janela 1200, memória 300) são usados.

**Acceptance Scenarios**:

1. **Given** as variáveis de ambiente de orçamento não definidas, **When** o prompt é montado, **Then** os tetos padrão (resumo 200, janela 1200, memória 300) são aplicados.
2. **Given** as variáveis de ambiente de orçamento definidas com valores customizados, **When** o prompt é montado, **Then** os tetos aplicados refletem exatamente os valores configurados.
3. **Given** uma variável de orçamento definida com um valor inválido (não numérico ou negativo), **When** o sistema monta o prompt, **Then** o teto padrão correspondente é usado em vez do valor inválido.

---

### Edge Cases

- O que acontece quando não há resumo, histórico ou memórias disponíveis (todas as seções vazias)? O prompt deve ser montado normalmente apenas com sistema e mensagem, sem erros.
- Como o sistema lida com um teto configurado como zero para uma seção? A seção correspondente deve ser omitida por completo do prompt.
- O que acontece quando duas memórias têm exatamente a mesma pontuação de relevância e apenas uma cabe no teto? O critério de desempate deve ser determinístico (mesma memória escolhida em execuções repetidas com a mesma entrada).
- Como o sistema se comporta quando o texto de sistema ou a mensagem atual, sozinhos, já excedem o que seria um teto razoável? Essas duas seções nunca são cortadas, conforme FR-001.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST montar o prompt final combinando, no mínimo, quatro seções: texto de sistema/instruções da estratégia, resumo da conversa, janela de histórico recente e memórias do usuário, além da mensagem/solicitação atual.
- **FR-002**: O sistema MUST nunca cortar ou truncar o texto de sistema/instruções nem a mensagem/solicitação atual do usuário, independentemente dos tetos configurados para as demais seções.
- **FR-003**: O sistema MUST aplicar um teto configurável de tamanho para a seção de resumo da conversa, com valor padrão de 200 (unidade: tokens estimados, seguindo a mesma convenção de estimativa já usada no projeto).
- **FR-004**: O sistema MUST aplicar um teto configurável de tamanho para a seção de janela de histórico recente, com valor padrão de 1200.
- **FR-005**: O sistema MUST aplicar um teto configurável de tamanho para a seção de memórias do usuário, com valor padrão de 300.
- **FR-006**: Quando a janela de histórico excede seu teto, o sistema MUST remover primeiro as mensagens mais antigas, preservando as mais recentes e sua ordem cronológica relativa.
- **FR-007**: Quando as memórias do usuário excedem seu teto, o sistema MUST remover primeiro as memórias com menor pontuação de relevância, preservando as de maior pontuação.
- **FR-008**: O sistema MUST permitir configurar cada um dos três tetos (resumo, janela, memória) de forma independente através de variáveis de ambiente com prefixo `CONTEXT_BUDGET_`.
- **FR-009**: O sistema MUST usar os valores padrão (resumo 200, janela 1200, memória 300) sempre que a variável de ambiente correspondente não estiver definida ou contiver um valor inválido.
- **FR-010**: O sistema MUST aplicar essa lógica de montagem e orçamento de forma uniforme a todas as estratégias de raciocínio existentes (ReAct, Plan-and-Execute, Reflection), sem duplicação de regras de corte por estratégia.
- **FR-011**: O sistema MUST omitir por completo uma seção do prompt (resumo, janela ou memórias) quando seu conteúdo disponível for vazio ou quando seu teto configurado for zero, sem gerar erro.
- **FR-012**: O sistema MUST produzir um resultado determinístico: para a mesma entrada (mensagens, resumo, memórias com scores) e os mesmos tetos, o conteúdo cortado deve ser sempre o mesmo em execuções repetidas.

### Key Entities

- **Seção de Contexto**: Um bloco de conteúdo candidato ao prompt (sistema, mensagem atual, resumo, janela de histórico, memórias), com um teto de tamanho associado (exceto sistema e mensagem, que são intocáveis) e uma regra própria de corte quando excede o teto.
- **Orçamento de Contexto**: O conjunto de tetos configurados (resumo, janela, memória) que delimita quanto de cada seção pode entrar no prompt final.
- **Mensagem de Histórico**: Item da janela de histórico, com uma posição cronológica que determina a prioridade de descarte (mais antiga descarta primeiro).
- **Memória do Usuário**: Item da seção de memórias, com uma pontuação de relevância (score) que determina a prioridade de descarte (menor score descarta primeiro).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para qualquer combinação válida de tetos e conteúdo de entrada, 100% dos prompts montados respeitam os tetos configurados para resumo, janela e memória, sem exceder nenhum deles.
- **SC-002**: O texto de sistema e a mensagem atual do usuário aparecem completos (sem truncamento) em 100% dos prompts montados, em qualquer cenário de teste, incluindo tetos configurados como zero para as demais seções.
- **SC-003**: Sob tetos reduzidos ao mínimo, o conteúdo remanescente de histórico corresponde exatamente às mensagens mais recentes que cabem no teto, e o conteúdo remanescente de memórias corresponde exatamente às de maior pontuação que cabem no teto, validado por testes automatizados determinísticos.
- **SC-004**: As três estratégias de raciocínio existentes no sistema produzem prompts consistentes entre si quanto à aplicação do orçamento, sem nenhuma delas ignorar ou duplicar a lógica de corte.

## Assumptions

- A unidade usada para medir o "tamanho" de cada seção e seus tetos é a mesma convenção de estimativa de tokens já utilizada no projeto (aproximação por caracteres, como em `ContextBreakdown`), não uma contagem exata de tokens do provedor.
- "Menor pontuação de relevância" para memórias refere-se ao score de recall já produzido pelo mecanismo de memória semântica existente no projeto; esta feature apenas consome esse score para decidir a ordem de corte, não o recalcula.
- Em caso de empate de pontuação entre memórias no ponto de corte, a ordem original de chegada (ou ordem de iteração) é usada como critério de desempate determinístico.
- As variáveis de ambiente `CONTEXT_BUDGET_*` são lidas uma vez na montagem do prompt (não requerem hot-reload dinâmico durante a execução do processo).
- Esta feature substitui qualquer lógica de montagem de prompt já embutida individualmente em cada estratégia, centralizando-a em um único ponto (`src/context/context-builder.ts`), sem alterar o comportamento observável de fora do sistema além da aplicação dos tetos.
