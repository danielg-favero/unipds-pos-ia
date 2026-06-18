# Spec-Driven Development (SDD)

Prática de escrever uma especificação clara e estruturada **antes** da IA implementar uma funcionalidade.  
O objetivo é reduzir ambiguidades, aumentar a previsibilidade das entregas e melhorar a qualidade do código gerado pelos agentes.

---

## Exemplo de prompt ruim

```txt
"Adiciona um limite diário de transferência.
Contas premium: R$ 1500,00
Contas gold: R$ 1000,00
Contas free: R$ 500,00"
```

### Problemas

- Não define regras de negócio completas
- Não explica comportamento esperado em erros
- Não informa onde aplicar a lógica
- Não cita testes, edge cases ou persistência
- Ambíguo para agentes de IA

---

## Exemplo melhor de Spec

```md
# Feature: Limite diário de transferência

## Objetivo

Implementar limite diário de transferências por tipo de conta.

## Regras de negócio

- Conta Premium: limite diário de R$ 1500
- Conta Gold: limite diário de R$ 1000
- Conta Free: limite diário de R$ 500

## Comportamento esperado

- O valor utilizado deve resetar diariamente às 00:00
- Transferências acima do limite devem retornar erro
- O saldo não deve ser alterado em caso de falha

## Testes esperados

- Permitir transferência dentro do limite
- Bloquear transferência acima do limite
- Resetar limite no próximo dia
```

---

## Arquivos de spec por harness/agente

| Arquivo     | Utilizado por                 |
| ----------- | ----------------------------- |
| `CLAUDE.md` | Claude                        |
| `DESIGN.md` | Claude (features específicas) |
| `AGENTS.md` | Codex / OpenAI                |
| `GEMINI.md` | Gemini                        |

---

## Quando SDD vale mais a pena?

- Features novas e bem definidas
- Projetos com testes automatizados
- Fluxos com múltiplos agentes
- Equipes que mantêm specs atualizadas
- Sistemas com regras de negócio complexas

---

## Benefícios do SDD

- Menos ambiguidades
- Melhor alinhamento entre humano e IA
- Código mais previsível
- Menos retrabalho
- Facilita onboarding e manutenção
- Cria documentação viva do sistema

---

## Estudo de Stanford

> “LLMs têm cerca de 36% de chance de concluir uma spec complexa com sucesso.”

### Exemplo probabilístico

Se:

- Cada instrução possui **95%** de chance de sucesso
- A spec contém **20 instruções**

Então:

```math
0.95^{20} \approx 0.36
```

Ou seja, mesmo pequenas taxas de erro se acumulam rapidamente em specs longas e complexas.

---

## Ideia principal

Quanto melhor a especificação, maior a chance da IA:

- implementar corretamente,
- seguir padrões do projeto,
- escrever testes adequados,
- e exigir menos correções humanas.
