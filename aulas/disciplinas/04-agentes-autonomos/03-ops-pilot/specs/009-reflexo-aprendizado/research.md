# Research: Reflexo de Aprendizado Automático

## 1. Como distinguir fato durável de pedido pontual e de informação sensível

**Decision**: um passo de reflexão dedicado, via `createModel().withStructuredOutput(schema)`, com
`schema = z.object({ hasLearned: z.boolean(), fact: z.string().min(1).optional() })`. O prompt do
sistema instrui explicitamente: extrair no máximo um fato durável (preferência, característica,
contexto estável) da última mensagem do usuário, considerando a resposta do assistente como
contexto; NUNCA transformar um pedido de ação pontual em fato; NUNCA extrair senhas, segredos, dados
de acesso ou qualquer informação que o usuário sinalize como confidencial. Se nada qualificar,
`hasLearned: false` e `fact` ausente.

**Rationale**: é o mecanismo pedido explicitamente (`withStructuredOutput({ hasLearned })`); reaproveita
o padrão já usado em `src/agents/reflection.ts` (`critique`/`verdictSchema`) — mesmo `createModel()`,
mesma validação Zod na fronteira da saída do modelo (Princípio II da Constitution).

**Alternatives considered**:
- Regras heurísticas (regex/palavras-chave) para detectar "fato durável" vs. "pedido pontual":
  rejeitado — a distinção depende de semântica e contexto (ex.: "abra um incidente" é claramente
  pontual, mas "eu só trabalho de manhã, então abra isso mais tarde" mistura os dois), o que heurística
  textual não captura de forma confiável.
- Reaproveitar o mesmo call do agente principal (fazer o próprio agente decidir e chamar `remember`
  como uma tool): rejeitado — misturaria a política de "o que lembrar" com o raciocínio da tarefa
  operacional do agente, e tornaria o aprendizado dependente do agente ter escolhido usar essa tool,
  contra FR-001 ("depois de cada resposta... MUST analisar").

## 2. Como garantir que o aprendizado nunca atrasa a resposta (FR-006)

**Decision**: em `src/http/server.ts`, depois de `res.status(200).json(...)` (resposta já enviada),
disparar `reflectLearning(...)` sem `await` (fire-and-forget), com seu próprio `.catch(() => {})`
interno — qualquer falha (rede, saída malformada, timeout) é absorvida ali, nunca propagada.

**Rationale**: é a única forma de garantir, por construção, que a latência da reflexão não soma à
latência percebida pelo usuário (SC-004) — mesmo padrão de "best-effort" que 008 já usava para
`remember`, agora aplicado à chamada de reflexão que precede o `remember`.

**Alternatives considered**: rodar a reflexão em paralelo com a estratégia principal (antes da
resposta), via `Promise.all`: rejeitado — a reflexão depende da resposta final do assistente como
contexto (o prompt usa "última mensagem do usuário" e a resposta gerada), então só faz sentido depois
que `result.answer` existe; rodá-la em paralelo exigiria duplicar/adiantar esse contexto sem ganho
real de latência (a resposta ao usuário já não espera por ela de qualquer forma).

## 3. Tool `forget_preference`: como resolver qual memória esquecer a partir de linguagem natural

**Decision**: nova tool em `src/agents/tools.ts`, criada por `makeMemoryTools(memoryStore, userId)`,
schema `{ description: string }` ("descrição em linguagem natural do que esquecer"). Implementação:
chama `memoryStore.recall(userId, description, 3)`; se não houver nenhum resultado, devolve
`ok: false` com mensagem para o agente pedir mais detalhes ao usuário; se houver exatamente um
resultado claramente acima do corte de relevância, chama `memoryStore.forget(userId, id)` e confirma;
se houver mais de um candidato plausível, devolve a lista de candidatos (sem apagar nada) para o
agente escolher com o usuário qual deles esquecer.

**Rationale**: reaproveita o `recall` já existente (008) em vez de expor um id técnico de memória ao
usuário final — a spec (US3, Assumptions) exige que o usuário descreva o que quer esquecer em
linguagem natural, não que ele saiba um identificador interno. O padrão de "devolver candidatos e
deixar o agente esclarecer com o usuário" resolve o edge case de pedido ambíguo sem a tool precisar
decidir por conta própria.

**Alternatives considered**: a tool aceitar diretamente um `memoryId`: rejeitado — exigiria que o
agente (ou o usuário) já soubesse o id, que nunca é exposto em nenhuma resposta hoje; forçaria uma
segunda tool só para listar memórias com seus ids, aumentando a superfície sem necessidade.

## 4. Onde a tool nova fica disponível (quais estratégias)

**Decision**: `forget_preference` é adicionada à lista de tools do agente ReAct
(`src/agents/react.ts`) e do executor do plan-and-execute (`src/agents/plan-and-execute.ts`), do
mesmo jeito que `makeTools(input.store)` já é passado para ambos hoje. Requer que `StrategyInput`
(`src/domain/strategy.ts`) ganhe dois campos opcionais: `userId?: string` e
`memoryStore?: MemoryStore` — preenchidos pelo `/chat` (que já tem ambos disponíveis).

**Rationale**: mantém o mesmo padrão de injeção de dependência de tools já estabelecido (`store` para
`OpsStore`), sem introduzir um segundo mecanismo. Tornar os campos opcionais evita quebrar chamadores
que não usam a tool (ex.: testes de estratégia que não passam `memoryStore`/`userId` simplesmente não
ganham a tool).

**Alternatives considered**: criar uma estratégia/agente separado só para "gerenciar memória":
rejeitado — o usuário pede para esquecer algo dentro da conversa normal (US3: "durante a conversa"),
então a tool precisa estar disponível no mesmo agente que já está respondendo.

## Todas as NEEDS CLARIFICATION resolvidas

Nenhum item do Technical Context ficou marcado como `NEEDS CLARIFICATION` — decisões acima cobrem o
mecanismo de distinção fato/pedido/sensível, a garantia de não bloqueio, a resolução de qual memória
esquecer, e onde a tool nova é exposta.
