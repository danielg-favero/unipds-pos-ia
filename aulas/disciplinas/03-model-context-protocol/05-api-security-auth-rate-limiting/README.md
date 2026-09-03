# 05 - API Security, Auth & Rate Limiting

O [04-api-as-mcp](../04-api-as-mcp/) com a camada que faltava: a API embrulhada agora **exige autenticação**, distingue papéis e impõe rate limiting — e o servidor MCP passa a se comportar como um cliente autenticado de verdade.

## Contexto

No [04](../04-api-as-mcp/) a API era aberta: qualquer requisição passava. É didático, mas nenhum sistema real fica assim — e a diferença fica mais delicada quando o cliente é um agente, porque do outro lado há um modelo que decide sozinho quantas vezes chamar cada coisa e o que fazer quando uma chamada falha.

Este projeto responde três perguntas:

1. **Como o MCP se autentica** numa API que exige credencial, sem que a credencial passe pelo modelo?
2. **O que acontece com o agente** quando ele tenta uma ação que o papel dele não permite?
3. **Como conter um agente em loop** antes que ele derrube a API?

| Pasta                                                            | O que é                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`nodejs-fastify-mongodb-crud/`](./nodejs-fastify-mongodb-crud/) | A API de clientes, agora com JWT, service tokens, RBAC e rate limiting       |
| [`customers-mcp/`](./customers-mcp/)                             | O servidor MCP, agora enviando `Authorization: Bearer <service token>`       |

> A regra que organiza tudo: **o modelo nunca escolhe a credencial**. O token entra no servidor MCP por variável de ambiente (`SERVICE_TOKEN`), nunca como argumento de tool — caso contrário bastaria pedir "use o token de admin" no chat para escalar privilégio.

## O que mudou na API

### Duas formas de autenticação

| Rota                            | Devolve                        | Para quem                                  |
| ------------------------------- | ------------------------------ | ------------------------------------------ |
| `POST /v1/auth/login`           | `{ token }` — JWT assinado     | **Usuário** logando numa interface         |
| `POST /v1/auth/service-token`   | `{ serviceToken, role }` — UUID opaco | **Máquina** — outro serviço, um MCP, um job |

O hook `onRequest` aceita as duas: procura o token no mapa de service tokens emitidos e, se não achar, cai no `request.jwtVerify()`. Rotas públicas (`/v1/health`, `/v1/auth/login`, `/v1/auth/service-token`) ficam de fora.

O MCP usa o **service token** porque é um processo de longa duração, sem sessão de usuário e sem ninguém para digitar senha: ele sobe com o token no ambiente e o usa até morrer. A emissão exige um `adminSuperSecret` além de usuário e senha — só quem opera a infra emite credencial de serviço.

> Um token opaco tem uma vantagem prática sobre o JWT aqui: como o servidor guarda a lista dos emitidos (`issuedServiceTokens`), dá para **revogar** um token vazado na hora. Um JWT válido só morre quando expira.
>
> ⚠️ Neste projeto os tokens vivem num `Map` em memória — reiniciar a API invalida todos. Em produção isso vai para o banco ou um Redis. O `JWT_SECRET` e o `ADMIN_SUPER_SECRET` também estão hardcoded em `src/auth.js`, o que é aceitável em aula e inaceitável fora dela.

### Papéis e RBAC

Há dois usuários fixos em `src/auth.js`:

| Usuário          | Senha    | Papel    |
| ---------------- | -------- | -------- |
| `danielg-favero` | `123123` | `admin`  |
| `amanda`         | `1234`   | `member` |

O `preHandler` `requireRole('admin')` protege as **mutações** (`POST`, `PUT`, `DELETE` de clientes); leitura fica liberada para qualquer autenticado.

| Rota                        | Autenticação | Papel exigido |
| --------------------------- | ------------ | ------------- |
| `GET /v1/health`            | — (pública)  | —             |
| `GET /v1/customers`         | ✅            | qualquer      |
| `GET /v1/customers/:id`     | ✅            | qualquer      |
| `POST /v1/customers`        | ✅            | `admin`       |
| `PUT /v1/customers/:id`     | ✅            | `admin`       |
| `DELETE /v1/customers/:id`  | ✅            | `admin`       |

### Rate limiting por token

O `@fastify/rate-limit` limita **por credencial**, não por IP:

```js
export const rateLimitingOptions = {
  max: REQUESTS_PER_MINUTE,              // 90, em src/config.js
  timeWindow: "1 minute",
  keyGenerator: (request) =>
    request.headers.authorization?.replace(/bearer /i, "") ?? request.ip,
};
```

Limitar por IP não serviria: várias instâncias de agente podem sair do mesmo IP, e o que se quer conter é o consumo de uma credencial específica. Um agente em loop — repetindo `list_customers` porque não gostou da resposta — é justamente o cenário que isso previne, e ele é bem mais provável com uma LLM no comando do que com uma UI.

## O que mudou no MCP

As cinco tools, o resource e o prompt continuam idênticos ao [04](../04-api-as-mcp/). Três diferenças:

**1. O token entra pelo ambiente e o servidor falha cedo sem ele** (`src/index.ts`):

```ts
const SERVICE_TOKEN = process.env.SERVICE_TOKEN ?? "";
if (!SERVICE_TOKEN) {
  console.error("[error]: SERVICE_TOKEN env var is required");
  process.exit(1);
}
```

Sem isso o problema só apareceria como um `401` no meio de uma conversa com o agente.

**2. O `CustomerHttpClient` carrega o header em toda chamada** — o único lugar do projeto que sabe da existência do token:

```ts
this.authHeaders = { Authorization: `Bearer ${serviceToken}` };
```

**3. Status de segurança viram erros de domínio** (`src/domain/errors.ts`), traduzidos para texto que o modelo entende:

| Status | Erro                 | Mensagem que chega ao modelo                              |
| ------ | -------------------- | --------------------------------------------------------- |
| `401`  | `UnauthorizedError`  | _Unauthorized: service token is missing or invalid_        |
| `403`  | `ForbiddenError`     | _Forbidden: token does not have sufficient permissions_    |
| `429`  | `RateLimitError`     | _Rate limit exceeded. Please try again later._             |

E as tools devolvem isso como conteúdo (`isError: true`), não como exceção. A diferença prática: com `HTTP 403` cru o modelo tende a repetir a chamada; com _"token does not have sufficient permissions"_ ele avisa o usuário e para. **Mensagem de erro é contexto** — é por ela que o servidor ensina o modelo a se comportar.

> O que **não** mudou: o MCP continua expondo as cinco tools independentemente do papel do token. Um `member` vê `create_customer` na lista e descobre o limite ao tentar usar. Filtrar tools por papel na montagem do servidor é possível, mas o protocolo não faz isso sozinho.

## Pré-requisitos

- **Node.js 24+** — roda TypeScript nativamente, sem build step
- **Docker + Docker Compose** — para o MongoDB da API
- **`jq`** — usado pelo `getServiceToken.sh`

## Como rodar

### 1. A API

```bash
cd nodejs-fastify-mongodb-crud
npm ci

npm run infra:up:db      # Sobe só o MongoDB
node config/seed.js      # Opcional: popula alguns clientes
npm start                # API em http://localhost:9999
```

Confira com `curl http://localhost:9999/v1/health` — deve responder `{"app":"customers","version":"v1.0.1"}` **sem** token, já que é rota pública.

### 2. Emitir um service token

```bash
curl -X POST http://localhost:9999/v1/auth/service-token \
  -H "Content-Type: application/json" \
  -d '{"username":"danielg-favero","password":"123123","adminSuperSecret":"admin_supersecret"}'
```

Resposta: `{"serviceToken":"<uuid>","role":"admin"}`. Troque para `amanda`/`1234` para obter um token `member` e ver os `403`.

> ⚠️ O script `customers-mcp/getServiceToken.sh` e o `customers-mcp/tests/helpers.ts` ainda usam `"AM I THE BOSS?"` como `adminSuperSecret`, mas o valor em `nodejs-fastify-mongodb-crud/src/auth.js` é `"admin_supersecret"` — com o valor antigo a emissão devolve **401**. Alinhe os três antes de rodar o script ou os testes do MCP.

### 3. O servidor MCP

```bash
cd customers-mcp
npm install
SERVICE_TOKEN=<uuid> npm start   # Normalmente é o cliente MCP que roda isso, não você
```

Não existe passo de build em nenhum dos dois.

## Testando os cenários de segurança

Com a API no ar, dá para ver os três comportamentos direto no `curl` — sem gastar chamada de LLM:

```bash
# Sem token → 401
curl -i http://localhost:9999/v1/customers

# Token member lendo → 200
curl -i http://localhost:9999/v1/customers -H "Authorization: Bearer $MEMBER_TOKEN"

# Token member escrevendo → 403
curl -i -X POST http://localhost:9999/v1/customers \
  -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Teste","phone":"11999999999"}'

# 91 requisições no mesmo minuto com o mesmo token → 429
for i in $(seq 1 91); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9999/v1/customers \
    -H "Authorization: Bearer $ADMIN_TOKEN"
done | tail -3
```

## Usando no VS Code

O `customers-mcp/.vscode/mcp.json` registra o servidor com o token no ambiente:

```json
{
  "servers": {
    "customers-mcp": {
      "command": "node",
      "args": ["--experimental-strip-types", "./src/index.ts"],
      "env": { "SERVICE_TOKEN": "<seu service token>" }
    }
  }
}
```

O token no arquivo é o que expira/reinicia junto com a API — regenerar significa editar o `mcp.json` e recarregar a janela (`Cmd+Shift+P` → **Developer: Reload Window**).

Com um token `admin`, no Copilot Chat em modo agente:

```
Liste todos os clientes cadastrados
```

```
Cadastre o cliente Maria Silva com o telefone (11) 98888-7777
```

Troque para um token `member` e repita o segundo pedido: o agente recebe o `403` traduzido e responde que não tem permissão, em vez de insistir na chamada.

## Testes

**API** (sobe o Fastify em memória com `inject`; precisa do MongoDB):

```bash
cd nodejs-fastify-mongodb-crud
npm run infra:up:db
npm test
```

Cobre a emissão de service token (admin e member, credenciais e `adminSuperSecret` inválidos), o login JWT, o RBAC (member lê mas não escreve), o rate limiting após `REQUESTS_PER_MINUTE` chamadas e o CRUD completo.

**Servidor MCP** (precisa da **API rodando** em `localhost:9999`):

```bash
cd customers-mcp
npm test
npm run test:dev     # Watch mode + inspector do Node
```

Os testes sobem o servidor como processo filho via `StdioClientTransport` — mesmo caminho que um agente faria — e o `tests/helpers.ts` emite o service token antes de conectar, injetando-o no `env` do processo. É a única diferença em relação aos testes do [04](../04-api-as-mcp/).

> ⚠️ Os testes gravam no **mesmo banco** que a API usa (`DB_NAME=customers`) e não limpam o que criam. Rode `node config/seed.js` para zerar a coleção quando incomodar.

## Publicando no NPM

O `customers-mcp` está preparado para ser distribuído como pacote — é o que o [06](../06-mcp-with-langchain/) consome. Veja a seção [Publicando MCPs no NPM](../README.md#publicando-mcps-no-npm) para o passo a passo; os scripts já estão no `package.json`:

| Script                           | Descrição                                          |
| -------------------------------- | -------------------------------------------------- |
| `npm run registry:start`         | Sobe o Verdaccio em `http://localhost:4873`        |
| `npm run registry:stop`          | Derruba o Verdaccio                                |
| `npm run registry:login:private` | Login no registry local                            |
| `npm run release:private`        | `npm version patch` + publish no registry local    |
| `npm run registry:login:public`  | Login no registry público do NPM                   |
| `npm run release:public`         | `npm version patch` + publish público (com escopo) |
