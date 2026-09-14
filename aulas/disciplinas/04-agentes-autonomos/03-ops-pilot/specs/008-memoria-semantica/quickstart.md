# Quickstart: Memória Semântica por Usuário

## Pré-requisitos

- Node 24 LTS, dependências instaladas (`npm install`, incluindo a nova dependência
  `@huggingface/transformers` adicionada em `package.json`).
- Primeira execução baixa e faz cache local do modelo `Xenova/all-MiniLM-L6-v2` (requer rede na
  primeira vez; chamadas seguintes são locais).

## Rodando os testes automatizados (validação principal)

```bash
npm test
```

Cobre, no mínimo (ver [contracts/memory-store.md](./contracts/memory-store.md)):

- `remember` grava um fato e não duplica ao repetir o mesmo fato (ou reformulação muito próxima).
- `recall` encontra um fato relevante mesmo sem palavra em comum com a consulta (teste explícito
  pedido na feature — ex.: memorizar "prefiro reuniões pela manhã" e recall com "qual o melhor
  horário para marcar uma call comigo?").
- `recall` nunca retorna mais que 3 resultados, nem resultados com score abaixo de 0.3.
- `forget` remove um fato existente e é idempotente para um id inexistente.
- Memórias de um `userId` nunca aparecem no `recall` de outro `userId`.
- `POST /chat` sem `userId` retorna `400`.

## Validação manual end-to-end (`/chat`)

```bash
npm run http
```

1. Ensinar um fato:

   ```bash
   curl -s http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"u1","message":"Só trabalho com Node e prefiro respostas curtas."}'
   ```

2. Nova conversa, mesma `userId`, pergunta relacionada sem palavras em comum com o fato acima:

   ```bash
   curl -s http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"u1","message":"Que linguagem de programação você recomendaria pra mim usar aqui?"}'
   ```

   A resposta deve refletir a preferência memorizada (Node), mesmo sem repetir os termos originais.

3. Confirmar isolamento por usuário — mesma pergunta, `userId` diferente:

   ```bash
   curl -s http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"u2","message":"Que linguagem de programação você recomendaria pra mim usar aqui?"}'
   ```

   Não deve refletir a preferência memorizada para `u1` (SC-005).

## Expected Outcomes

- Fatos memorizados influenciam respostas futuras relacionadas semanticamente (SC-001).
- Repetir um fato não cria memórias duplicadas (SC-002).
- `recall` nunca extrapola 3 resultados nem inclui fatos de baixa relevância (SC-003).
- Memórias removidas (`forget`) nunca mais aparecem (SC-004).
- Conversas de usuários sem memórias funcionam normalmente (SC-006).
