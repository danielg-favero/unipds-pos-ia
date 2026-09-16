# Agentes Autônomos

Um agente é um sistema que percebe um ambiente, toma decisões com base em objetivos e executa ações de forma autônoma.

$$
Agente = Percepcao + Politica + Acao + Feedback
$$

> Não é um chatbot com memória

> Não é um script com LLM no meio

> Todo o objetivo de um agente deve ser explícito

## Índice

1. [Agent Loop](#agent-loop)
2. [Tipos de agente](#tipos-de-agente)
3. [Spec Driven Development (SDD)](#spec-driven-development-sdd)
4. [Arquitetura de agentes de código](#arquitetura-de-agentes-de-código)
5. [Laboratório: `notas-api`](#laboratório-notas-api)

## Agent Loop

Enquanto uma automação executa passos determinados, um agente opera em ciclos. Enquanto o objetivo não for atingido, ele observa o estado, decide os próximos passos, executa e avalia. E então decide de novo.

```
        ┌──────────────┐
        │  Percepção   │◄───────────┐
        └──────┬───────┘            │
               ▼                    │
        ┌──────────────┐            │
        │  Raciocínio  │            │
        └──────┬───────┘            │
               ▼                    │
        ┌──────────────┐            │
        │     Ação     │            │
        └──────┬───────┘            │
               ▼                    │
        ┌──────────────┐            │
        │   Feedback   │────────────┘
        └──────┬───────┘
               ▼
     critério de parada atingido?
```

### Entendendo as etapas da tomada de decisão

#### Percepção

É montagem de estado.

$$
Estado = Input + Contexto + Histórico + Sinais_{risco}
$$

> Sinais de risco podem ser tentativas repetidas, custo aumentando, acesso sem permissão etc.

> Sem a percepção correta, não existe decisão correta (Garbage in -> Garbage out)

#### Ação

É execução controlada. O agente opera exclusivamente dentro de **capacidades definidas**, **limitadas**, **autorizadas** e **observáveis** (Ex: Desenvolvedor de software com acesso a banco de dados de produção).

Se uma ação não está disponível, **ELA NÃO EXISTE**.

#### Feedback

Depois da ação o agente recebe uma resposta e precisa verificar se a ação foi efetiva e correta. Sem a validação da resposta, o fluxo continua com erro e fica normalizado no sistema.

> "Vamos continuar essa ação?"
> "Vamos replanejar a ação?"
> "Vamos pedir mais informações?"

#### Critério de parada

Sem um critério de parada bem definido, o agente continua em loop. Um agente que não para, começa a amplificar o problema.

### Exemplo de agente

Dado um agente que toma decisões baseadas em incidentes de software:

1. **Entrada**: _Alerta de incidência_
2. **Percepção**: Identifica o serviço e o contexto
3. **Raciocínio**: Decide consultar métricas de implementação
4. **Ação**: Executa consulta no banco
5. **Retroalimentação**: Detecta degradação após implantação. Atualiza o estado

## Tipos de agente

Importante perceber que o mesmo `runtime` executa agentes diferentes usando a mesma estrutura.

| Tipo            | Entrada             | Interação humana            | Planeja?                      |
| --------------- | ------------------- | --------------------------- | ----------------------------- |
| **Task-Based**  | Tarefa bem definida | Nenhuma durante a execução  | Não (poucos passos)           |
| **Interactive** | Tarefa bem definida | Pergunta durante a execução | Não                           |
| **Goal-Based**  | Objetivo amplo      | Revisão entre fases         | Sim (gera um plano/todo list) |
| **Autonomous**  | Evento / trigger    | Nenhuma                     | Sim                           |

### Task-Based

Recebe uma tarefa bem definida, executa em poucos passos e entrega o resultado. Não faz perguntas para humanos.

### Interactive

Age da mesma forma que o task-based, mas faz perguntas ao humano durante a execução.

### Goal-Based

Ele recebe um objetivo amplo, transforma em um plano executável (todo list) e executa todos após isso.

### Autonomous

Não recebe nenhuma instrução humana, o agente reage a eventos / triggers.

## Spec Driven Development (SDD)

É uma especificação escrita, versionada e revisada antes de implementar.

O SDD é a forma de transformar um agente de código em um agente **goal-based auditável**: cada fase produz um artefato versionado no repositório, e a revisão humana acontece _entre_ as fases — não depois de 40 arquivos alterados.

### Passos do SDD

Cada etapa é uma skill carregada na memória da LLM com instruções claras do que deve ser feito:

| Fase        | Skill          | Pergunta que responde | Artefato                    |
| ----------- | -------------- | --------------------- | --------------------------- |
| Especificar | `/especificar` | O QUE e por quê?      | `specs/NNN-<slug>-spec.md`  |
| Planejar    | `/planejar`    | COMO?                 | `specs/NNN-<slug>-plan.md`  |
| Tarefas     | `/tarefas`     | Em que ordem?         | `specs/NNN-<slug>-tasks.md` |
| Implementar | `/implementar` | —                     | Código + testes             |

- **Especificar**: dá contexto, escreve requisitos, critérios de aceite e descreve o que está fora de escopo
- **Planejar**: traduz a especificação em um plano de execução com passos, dependências, trade-offs e estratégia de teste
- **Tarefas**: quebra o plano em tarefas pequenas, ordenadas e testáveis
- **Implementar**: implementa uma tarefa por vez, com testes e feedback

> Regra prática: se a spec está errada, o agente **para** e pede revisão. Ele nunca "conserta" desabilitando teste ou afrouxando tipo.

## Arquitetura de agentes de código

Um agente de código é o agent loop aplicado a um repositório. O que muda de projeto para projeto não é o runtime — é o **contexto** que você monta ao redor dele. Na prática, quatro camadas:

### 1. Constituição — princípios não-negociáveis

Documento curto que toda spec, plano, tarefa e código precisa respeitar. É o critério objetivo para o agente (e para o revisor humano) dizer "isso não pode entrar".

Exemplo real do laboratório ([`specs/constitution.md`](02-arquitetura-de-agentes-de-codigo/notas-api/specs/constitution.md)):

1. Camadas explícitas: `http`/`cli` → `service` → `store`. Domínio não faz I/O
2. Validação na fronteira, com Zod, antes de virar domínio
3. Falhas previsíveis viram classes de erro, traduzidas na borda
4. Teste é parte da tarefa — `typecheck` e `test` verdes
5. Segurança por padrão: guardrails, não confiança no modelo
6. Spec antes de código, com revisão humana entre as fases
7. Pequeno e reversível: cada tarefa cabe em um commit

### 2. Regras / instruções — o contexto do projeto

Descreve stack, comandos, estrutura de pastas, convenções e **limitações conhecidas**. É o que o agente lê antes de decidir qualquer coisa — a etapa de _percepção_ do loop.

O trecho mais valioso costuma ser o das armadilhas já pagas com sangue. Em [`.claude/rules/instructions.md`](02-arquitetura-de-agentes-de-codigo/notas-api/.claude/rules/instructions.md):

- `tasks.json` fica no diretório de onde o comando é executado — rodar a CLI de outra pasta enxerga outro conjunto de tarefas
- A escrita é atômica (arquivo temporário + `rename`), mas **não há lock entre processos**: CLI e servidor escrevendo juntos podem perder uma atualização
- Na CLI, usar `program.parseAsync()` — com `parse()` o processo encerra antes de a escrita terminar

Regras podem ser escopadas por caminho, restringindo o alcance de uma instrução:

```markdown
---
applyTo: "src/service/**"
---

Regras de service: funções puras onde possível; nunca importar de src/http
```

### 3. Skills — as capacidades do agente

Cada skill é um procedimento nomeado, carregado sob demanda. Uma skill boa diz o que fazer, o que **não** fazer e quando parar:

```markdown
---
description: Cria a especificação (o QUE e por que) de uma feature sem código
---

Regras:

- Leia specs/constitution.md e respeite todos os princípios
- Não escreva código nem decisões de implementação
- Crie specs/<NNN>-<slug>-spec.md com contexto, user stories,
  requisitos (RF-1...), critérios de aceite em EARS, fora de escopo
- Se algo estiver ambíguo, PERGUNTE antes de finalizar
```

> Repare no critério de parada embutido: _"se algo estiver ambíguo, PERGUNTE"_. É o que transforma um agente task-based em interactive na hora certa.

### 4. Guardrails — o que o agente pode executar

Capacidade não declarada não existe. A allow/deny list é o contorno da etapa de _ação_:

```json
{
  "permissions": {
    "allow": [
      "npm run",
      "npm test",
      "node",
      "/^git(status|diff|add|commit)\\b/"
    ],
    "deny": ["rm -rf", "sudo", "/^git push\\b.*--force/", "cat .env"]
  }
}
```

Guardrails são **mecanismo**, não instrução. "Não apague arquivos" no prompt é uma sugestão; uma deny list é uma barreira. Segredos e ações destrutivas ficam sempre do lado do mecanismo.

## Padrões de raciocínio

### 1. ReAct: Thought -> Action -> Observation

Exemplo: Agente de monitoramento de incidentes

Prompt:

```
Quais os alteras críticos que estão acontecendo agora
```

```
thought:        O plantonista quer a contagem de alertas críticos. Vou listar os que disparam

action:         list_alerts {"status": "firing"}

observation:    [{"serice": "checkout", "severity": "critical", ...}, {"service": "payments", "severity": "critical", ...}]

thought         Dois são críticos. Posso responder.

answer          2 alertas críticos disparando: checkout (p99 > 2s) e payments (5xx em 8%)
```

> Esse rastro de pensamento é chamado de `reasoning trace`

> **Contras:** decide um passo por vez. Cada passo carrega o histórico inteiro. Risco de loop infinito

### 2. Plan-and-Execute

1. Planeja passo a passo
2. Replaneja caso necessário
3. Revisa o plano restante

> Custo controlado, passos independentes e paralelizados

> **Contras:** Se o plano ficar muito velho, será preciso de um replanejamento

### 3. Reflection

1. Gerador
2. Crítico: Verifica o que é gerado pelo gerador e da feedback para o gerador (É preciso ter um teto limite para o crítico para evitar loop infinito)
3. Aprova ou não o gerador

> O crítico avalia contra critérios explícitos

## [Spec Kit](https://github.com/github/spec-kit)

Framework para SDD criado e mantido pelo github. Ele é instalado como ferramenta de linha de comando no terminal:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
```

e inicializado no projeto desejado:

```bash
specify init my-project
```

ou direto no pasta do projeto

```bash
specify init .
```

## Memória de agentes

É uma gestão de contexto entre os agentes.

### Histórico de conversa persistente

É o ato de persistir dados de conversa com o usuário em banco de dados e utilizá-los novamente para novas conversas

### Refletor de aprendizado

É uma chamada extra depois de cada resposta, que resume numa frase durável, o que vale a pena lembrar sem ninguém cadastrar nada.

### Esquecimento

Uma ferramenta que apaga, a pedido do usuário, o que o sistema aprendeu dele

### Tipos de memória

- **Conversa curta**: Conversa em andamento (working memory)
- **Conversa longa**: Memória que sobrevive em disco. Ex: Arquivos `.md` para consulta (`instructions.md`)
- **Memória Episódica**: Diário do que aconteceu e na ordem que aconteceu. Fluxo de uma memória episódica

```typescript
const history = // recurar o histórico de mensagens
const result = // Injeta o histórico no contexto

// Restante da execuçãi
```

- **Memória semântica**: Fatos e preferências do usuário guardados como embeddings

## Observabilidade

A observabilidade é a capacidade de entender o que está acontecendo em um sistema apenas olhando para sinais que ele emite.

Em um software comum, é auditável o que aconteceu no sistema. Em softwares com agentes autônomos é preciso auditar o por que ele tomou determinada decisão

### Matriz de autonomia

Toda ação do agente vai cair em 4 faixas de possibilidade:

1. **O agente decide sozinho** (ação com 0 risco, como responder a uma pergunta, pode ser reversível)
2. **Decide e registra** (ação reversível, mas que muda algum estado)
3. **Pedir aprovação** (Ações destrutivas)
4. **Não fazer nada**
