# 06 - Context7 MCP

Demonstração de como usar o **Context7 MCP** para que um agente de IA gere código consultando a **documentação oficial e atualizada** da biblioteca, evitando alucinações sobre versões antigas.

## Contexto

LLMs são treinadas com dados que ficam desatualizados. O [Context7](https://context7.com) é um MCP que busca a documentação atual de uma biblioteca e injeta no contexto da LLM (uma aplicação de **RAG**) antes dela escrever o código.

Aqui o experimento foi: pedir a um agente que **gere do zero uma demo de autenticação** consultando o Context7 para a doc atual do **Better Auth**.

- `prompt.md` — o prompt estruturado usado para guiar o agente. Ele define o contexto, exige o uso do Context7 (e manda **parar** se o MCP não estiver disponível), lista os requisitos técnicos e o formato de saída.
- `nextjs-better-auth-demo/` — o projeto **gerado** pelo agente: Next.js (App Router) + Better Auth + GitHub OAuth + SQLite + Tailwind.

## Como rodar a demo gerada

O passo a passo completo está em [`nextjs-better-auth-demo/README.md`](./nextjs-better-auth-demo/README.md). Em resumo:

```bash
cd nextjs-better-auth-demo
npm install
# configure GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET em .env.local
npx @better-auth/cli migrate   # cria o banco SQLite
npm run dev
```

Acesse <http://localhost:3000> e faça login com o GitHub.

## Configurando o Context7 MCP

Para reproduzir a geração, configure o Context7 no seu editor/cliente MCP. Exemplo de setup:

```bash
npx ctx7 setup
```

> Com o MCP ativo, basta fornecer o `prompt.md` ao agente para que ele consulte a doc atual e gere o projeto.
