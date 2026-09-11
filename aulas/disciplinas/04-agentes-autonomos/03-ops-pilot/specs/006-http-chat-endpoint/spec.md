# Feature Specification: Endpoint HTTP de Chat

**Feature Branch**: `006-http-chat-endpoint`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "POST /chat em src/http/server.ts (ou padrão do express) : body { message, strategy?, reflect } validado com zod; default react. 200 {answer, trace, metrics}; 400 body inválido (issues do zod); 422 estratégia desconhecida; timout 180s -> 504. Registry em src/agents/index.ts (nome -> estratégia; reflect aplica withReflection). Teste de integração com estratégia fake determinística, sem rede"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultar o OpsPilot via HTTP com a estratégia padrão (Priority: P1)

Quem integra um cliente (dashboard, CLI, outro serviço) ao OpsPilot quer enviar uma pergunta de plantão em uma requisição HTTP simples e receber de volta a resposta, o rastro de execução e as métricas, sem precisar escolher uma estratégia de raciocínio a cada chamada.

**Why this priority**: É o caminho principal do endpoint — sem ele não há integração HTTP nenhuma. Uma chamada mínima (`{ message }`) já deve produzir uma resposta completa usando a estratégia padrão.

**Independent Test**: Enviar `POST /chat` com apenas `message` no corpo e verificar que a resposta HTTP 200 traz `answer`, `trace` e `metrics` coerentes com a execução da estratégia padrão (react).

**Acceptance Scenarios**:

1. **Given** o servidor HTTP no ar, **When** um cliente envia `POST /chat` com `{ "message": "quais incidentes estão abertos?" }`, **Then** o servidor responde 200 com um corpo contendo `answer` (string), `trace` (o rastro da execução) e `metrics` (chamadas ao modelo e latência).
2. **Given** o mesmo cliente, **When** ele não informa `strategy`, **Then** a execução usa a estratégia `react` por padrão.

---

### User Story 2 - Escolher estratégia e ativar autocrítica (Priority: P2)

Quem está comparando estratégias de raciocínio (ou quer uma resposta revisada antes de confiar nela) quer poder escolher qual estratégia usar e opcionalmente pedir que a resposta passe pela camada de reflexão, na mesma chamada HTTP.

**Why this priority**: Estende o caso principal para os usos de avaliação/comparação já suportados internamente (arena, reflection), tornando-os acessíveis via HTTP. Depende do User Story 1 já funcionando.

**Independent Test**: Enviar `POST /chat` com `strategy: "plan-and-execute"` e `reflect: true` e verificar que a execução usada é a variante com autocrítica dessa estratégia, refletida no `trace` (evento de crítica) e nas `metrics` (chamadas extras).

**Acceptance Scenarios**:

1. **Given** um corpo com `strategy: "plan-and-execute"` e `reflect: false` (ou omitido), **When** a requisição é processada, **Then** a execução usa a estratégia `plan-and-execute` sem reflexão.
2. **Given** um corpo com `strategy: "react"` e `reflect: true`, **When** a requisição é processada, **Then** a execução usa a estratégia `react` envolvida em autocrítica (equivalente a `reflect:react`), e o `trace` retornado contém o(s) evento(s) de crítica.
3. **Given** um corpo com `strategy` que não existe no catálogo de estratégias, **When** a requisição é processada, **Then** o servidor responde 422 identificando a estratégia desconhecida (e idealmente listando as estratégias válidas).

---

### User Story 3 - Receber erros claros e previsíveis (Priority: P2)

Quem integra com o endpoint precisa distinguir entre "eu mandei algo errado" (corpo inválido, estratégia inexistente) e "o servidor não conseguiu responder a tempo" (execução lenta ou travada), para poder tratar cada caso no cliente.

**Why this priority**: Sem contratos de erro previsíveis, o endpoint é frágil de integrar e depurar. É um requisito de qualidade que acompanha os dois primeiros stories.

**Independent Test**: Enviar corpos inválidos (faltando `message`, tipos errados) e verificar 400 com os detalhes de validação; simular uma execução que não termina dentro do limite de tempo e verificar 504.

**Acceptance Scenarios**:

1. **Given** um corpo sem `message` (ou com `message` de tipo errado), **When** a requisição é processada, **Then** o servidor responde 400 com os problemas de validação reportados pelo zod (`issues`).
2. **Given** uma execução que ultrapassa 180 segundos, **When** o tempo limite é atingido, **Then** o servidor responde 504 e não deixa a requisição pendurada indefinidamente.
3. **Given** uma estratégia desconhecida informada no corpo, **When** a requisição é processada, **Then** o servidor responde 422 (não 400), distinguindo "corpo malformado" de "estratégia não reconhecida".

---

### Edge Cases

- O que acontece se `message` for uma string vazia ou só espaços em branco? (Tratado como corpo inválido — 400.)
- O que acontece se `reflect` for enviado com um valor não booleano (ex.: string "true")? (Tratado como corpo inválido — 400, seguindo a validação estrita do zod.)
- O que acontece se a estratégia subjacente lançar um erro durante a execução (não relacionado a timeout)? (Deve resultar em uma resposta de erro do servidor, sem vazar detalhes internos sensíveis, e sem impedir requisições futuras.)
- O que acontece se duas requisições concorrentes chegarem ao mesmo tempo? (Cada uma deve ser processada de forma independente, com suas próprias métricas e trace.)
- O que acontece se o corpo da requisição não for JSON válido? (Tratado como corpo inválido — 400.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE expor um endpoint HTTP `POST /chat` que aceita um corpo JSON com os campos `message` (obrigatório, string não vazia), `strategy` (opcional, string) e `reflect` (opcional, booleano, default `false`).
- **FR-002**: O sistema DEVE validar o corpo da requisição contra um schema antes de processá-la, rejeitando corpos que não atendam ao formato esperado.
- **FR-003**: Quando `strategy` não for informado, o sistema DEVE usar a estratégia padrão `react`.
- **FR-004**: Quando `reflect` for `true`, o sistema DEVE aplicar a camada de autocrítica (reflection) sobre a estratégia selecionada antes de executá-la.
- **FR-005**: O sistema DEVE resolver o nome da estratégia contra um catálogo nomeado central (registry de estratégias por nome), reutilizando o mesmo catálogo usado pelo restante do sistema (arena/CLI).
- **FR-006**: Em caso de sucesso, o sistema DEVE responder HTTP 200 com um corpo contendo `answer` (a resposta final), `trace` (o rastro de observações/eventos da execução) e `metrics` (número de chamadas ao modelo e latência da execução).
- **FR-007**: Em caso de corpo de requisição inválido, o sistema DEVE responder HTTP 400 com os detalhes de validação (`issues`) retornados pelo validador.
- **FR-008**: Em caso de `strategy` informado mas não reconhecido no catálogo, o sistema DEVE responder HTTP 422, distinto do erro de corpo inválido.
- **FR-009**: O sistema DEVE impor um tempo limite de 180 segundos por requisição; se a execução não terminar dentro desse limite, o sistema DEVE responder HTTP 504 e liberar os recursos da requisição.
- **FR-010**: O sistema NÃO DEVE realizar chamadas de rede reais durante os testes automatizados do endpoint; o comportamento DEVE ser verificável com uma estratégia de teste determinística que não depende de rede.
- **FR-011**: O sistema DEVE processar requisições concorrentes de forma isolada, sem que o estado (trace, métricas) de uma requisição vaze ou interfira em outra.

### Key Entities

- **Requisição de Chat**: representa o pedido recebido pelo endpoint — contém a mensagem do usuário, o nome opcional da estratégia e a flag opcional de reflexão.
- **Resposta de Chat**: representa o resultado devolvido ao cliente — contém a resposta final, o rastro de execução (trace) e as métricas de execução (chamadas ao modelo, latência).
- **Catálogo de Estratégias (Registry)**: mapeamento entre nomes de estratégia e sua implementação, incluindo as variantes com reflexão; é a fonte de verdade usada para resolver o nome recebido na requisição.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma requisição válida com apenas `message` recebe resposta 200 com `answer`, `trace` e `metrics` presentes e coerentes em praticamente todas as tentativas (sem falhas espúrias) em ambiente de teste sem rede.
- **SC-002**: 100% das requisições com corpo malformado recebem 400 com os problemas de validação listados, sem exceções não tratadas vazando ao cliente.
- **SC-003**: 100% das requisições com estratégia desconhecida recebem 422, nunca 400 ou 500.
- **SC-004**: Nenhuma requisição fica pendente além de 180 segundos; ao atingir o limite, o cliente recebe 504 de forma consistente.
- **SC-005**: A suíte de testes de integração do endpoint roda de ponta a ponta sem qualquer chamada de rede real, usando uma estratégia determinística.

## Assumptions

- O endpoint roda sobre uma stack HTTP baseada em Express (ou compatível com seus padrões de middleware), conforme indicado na descrição da feature.
- O catálogo de estratégias já existente em `src/agents/registry.ts` (ou um equivalente exposto via `src/agents/index.ts`) é reaproveitado como fonte de verdade para nomes de estratégia; não é criado um catálogo paralelo.
- "Trace" e "metrics" no corpo de resposta seguem os mesmos formatos já produzidos internamente pelas estratégias de raciocínio (`RunMetrics`, trace de execução), sem necessidade de um novo formato específico para HTTP.
- Não há autenticação/autorização especificada para este endpoint nesta fase; presume-se uso interno/confiável, e controle de acesso fica fora do escopo desta feature.
- O timeout de 180s é medido do lado do servidor (não depende de configuração do cliente) e cobre a execução completa da estratégia (incluindo reflexão, quando ativada).
