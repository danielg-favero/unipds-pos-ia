# Research: Memória Semântica por Usuário

## 1. Biblioteca de embeddings local

**Decision**: `@huggingface/transformers` (pacote `transformers.js`, sucessor de
`@xenova/transformers`), modelo `Xenova/all-MiniLM-L6-v2`, `pipeline("feature-extraction", ...)`
com `{ pooling: "mean", normalize: true }`.

**Rationale**: é o requisito explícito do solicitante; roda 100% local (ONNX Runtime via WASM/Node),
sem chamada de rede em tempo de inferência após o primeiro download/cache do modelo, compatível com
o requisito de custo/privacidade da spec (Assumptions). `normalize: true` faz o pipeline devolver
vetores unitários, o que torna produto escalar equivalente a similaridade de cosseno — mesma métrica
pedida para dedup (>0.92) e recall (min 0.3).

**Alternatives considered**:
- Chamar um provedor externo de embeddings (ex.: OpenAI/OpenRouter): rejeitado — viola a restrição
  de processamento local da spec e adiciona custo/latência de rede por fato memorizado.
- `onnxruntime-node` direto sem `transformers.js`: rejeitado — reimplementaria tokenização e pooling
  já resolvidos pela biblioteca pedida, sem ganho.

## 2. Armazenamento do vetor em SQLite

**Decision**: coluna `embedding BLOB NOT NULL`, gravando o `Float32Array` via `Buffer.from(vector.buffer)`
e lendo de volta com `new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)`.

**Rationale**: `node:sqlite` (`DatabaseSync`) já é o padrão do projeto (`SqliteConversationStore`,
`SqliteOpsStore`); não há extensão de vetor disponível nessa API nativa, então a similaridade é
calculada em memória, em TypeScript, após carregar as memórias do usuário — aceitável para o volume
de escala descrito (Technical Context: dezenas a centenas de fatos por usuário).

**Alternatives considered**:
- Serializar o vetor como JSON de números: rejeitado — BLOB é o formato pedido explicitamente e é
  mais compacto/rápido de (de)serializar que JSON.
- Extensão SQLite de busca vetorial (ex.: `sqlite-vss`): rejeitado — dependência nativa extra fora do
  padrão atual do projeto (`node:sqlite` puro), desproporcional à escala do dado.

## 3. Similaridade e limites (dedup / recall)

**Decision**: com vetores normalizados, produto escalar (`dot product`) simples é usado tanto para
dedup quanto para recall. `remember`: se o produto escalar contra qualquer memória existente do
mesmo usuário for `> 0.92`, o novo fato é descartado (memória existente mantida). `recall`: calcular
produto escalar do embedding da consulta contra cada memória do usuário, ordenar desc, manter apenas
`score >= 0.3`, retornar os 3 primeiros.

**Rationale**: valores e métrica vieram explicitamente do pedido do usuário; com `normalize: true`
produto escalar = similaridade de cosseno, então não é necessário dividir por normas.

**Alternatives considered**: recalcular cosseno completo (dividindo por normas) a cada comparação —
equivalente mas mais caro; descartado porque os vetores já saem normalizados do pipeline.

## 4. Onde injetar o recall no fluxo do `/chat`

**Decision**: em `src/http/server.ts`, após validar o corpo e resolver a `strategy`, chamar
`memoryStore.recall(userId, message)` e passar o resultado para `strategy.run(...)` como um novo
campo opcional em `StrategyInput` (`memories?: readonly string[]`), consumido pelos agentes do mesmo
jeito que `history` já é hoje (mensagem de contexto adicional antes do prompt do usuário).
`remember` é chamado de forma best-effort após a resposta ter sucesso (mesmo ponto em que
`conversationStore.append` já é chamado), usando o texto da mensagem do usuário como fato candidato.

**Rationale**: mantém a camada HTTP fina (só orquestra chamadas de store, como já faz hoje com
`conversationStore`) e reaproveita o mecanismo existente de contexto extra pré-agente (`history`),
sem introduzir um segundo canal de I/O dentro dos agentes.

**Alternatives considered**: cada estratégia chamar `MemoryStore` diretamente — rejeitado, violaria
a Camada I (Camadas Explícitas: `http` → `service` → `store`; estratégias não deveriam decidir *se*
e *quando* memorizar, isso é política do endpoint).

## 5. `userId` no contrato de `/chat`

**Decision**: `chatRequestSchema` ganha `userId: z.string().min(1)` obrigatório (novo campo, não
opcional) — diferente de `conversation`, que continua opcional.

**Rationale**: a spec (FR-009) exige que toda interação do chat identifique o usuário; sem `userId`
não há como isolar memórias entre usuários (FR-001), então tratá-lo como obrigatório evita o estado
ambíguo de "memória sem dono".

**Alternatives considered**: `userId` opcional com fallback para um id anônimo — rejeitado, criaria
uma memória compartilhada entre chamadores anônimos, quebrando o isolamento por usuário exigido pela
spec (Edge Cases / FR-001).

## Todas as NEEDS CLARIFICATION resolvidas

Nenhum item do Technical Context ficou marcado como `NEEDS CLARIFICATION` — decisões acima cobrem
biblioteca, armazenamento, métrica de similaridade, ponto de integração e contrato HTTP.
