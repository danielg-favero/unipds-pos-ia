# Constitution - OpsPilot

Princípios não-negociáveis que toda spec, plano, tarefa e código seguem

1. Camadas explícitas. Dependências fluem http/cli -> service -> store. Domínio não faz I/O
2. Validações na fronteira. Toda entrada externa é validada com Zod antes de virar domínio
3. Erros são de domínio. Falhas previsíveis viram classes de erro, traduzidas em status/saída na borda
4. Teste é parte da tarefa e nenhuma lógica nova entra sem teste. typecheck e teste devem estar verdes
5. Segurança por padrão. Sem segredos no repo, nunca ler `.env`. Ações destrutivas passam por guardrails (deny list), não pela confiança no modelo.
6. Spec antes de código. Mudanças relevantes passam por /specs.specify -> /plan -> /task -> /implement, com revisão humana entre as fases
7. Pequeno e reversível. Cada tarefa cabe em um commit
8. Funções puras por padrão. Efeitos colaterais ficam isolados na camada de store/infra

## Stack

Node 24 LTS, TypeScript ESM, `strict: true`, Zod, `node:test` via `tsx`, Express com MySQL (Sequelize), LangChain/LangGraph sobre OpenRouter
