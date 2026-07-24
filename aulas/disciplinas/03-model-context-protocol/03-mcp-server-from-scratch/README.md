# 03 - MCP Server from Scratch

Um **servidor MCP próprio** (`@danielg.favero/ciphersuite-mcp`) escrito do zero com o [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk), que expõe criptografia AES-256-CBC como **tools**, **resource** e **prompt** — consumível por qualquer cliente MCP (VS Code Copilot, Claude Code, Inspector) e testado com o SDK de cliente.

## Contexto

Nos projetos anteriores o agente **consumia** servidores MCP prontos ([01-multiple-mcp-tools](../01-multiple-mcp-tools/)) ou ganhava capacidade via arquivos de instrução ([02-skills](../02-skills/)). Aqui o exercício é o inverso: **implementar o servidor**, que roda como processo separado e conversa com o cliente por `stdio` (JSON-RPC sobre stdin/stdout).

O servidor demonstra as três primitivas que um servidor MCP pode expor:

| Primitiva     | O que é                                                            | Quem decide usar                                        |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| **Tool**      | Função executável, com schema de entrada e saída                   | O **modelo**, quando julga necessário para a tarefa      |
| **Resource**  | Documento/contexto que o servidor disponibiliza para leitura       | A **aplicação cliente** (ou o modelo, quando permitido)  |
| **Prompt**    | Template de mensagem parametrizado, pronto para uso                | O **usuário** (ex.: slash command na UI do cliente)      |

## O que este servidor expõe

| Tipo          | Nome                     | Descrição                                                                    |
| ------------- | ------------------------ | ---------------------------------------------------------------------------- |
| 🔧 Tool       | `encrypt_message`        | Criptografa um texto a partir de uma passphrase qualquer                     |
| 🔧 Tool       | `decrypt_message`        | Descriptografa uma mensagem gerada pela tool acima, com a mesma passphrase   |
| 📄 Resource   | `encryption://info`      | Explica o algoritmo, a derivação de chave e o formato de saída               |
| 💬 Prompt     | `encrypt_message_prompt` | Template que pede ao agente para criptografar uma mensagem                   |

### Como a criptografia funciona

- **Algoritmo**: AES-256-CBC (`node:crypto`, sem dependências externas)
- **Derivação de chave**: `scryptSync(passphrase, SALT, 32)` — o usuário passa qualquer string e o servidor deriva uma chave forte de 32 bytes
- **Formato de saída**: `<IV em hex>:<ciphertext em hex>` — a string inteira precisa ser guardada para descriptografar depois
- **IV**: um IV aleatório de 16 bytes é gerado a cada chamada, então a mesma mensagem criptografada duas vezes gera saídas diferentes

> ⚠️ É um exemplo didático: o salt é fixo e está no código (`src/service.ts`), e CBC não autentica o ciphertext (sem MAC). Para uso real, salt aleatório por mensagem e um modo autenticado (AES-GCM).

## Estrutura

```
src/
  index.ts     # Entrypoint — cria o StdioServerTransport e conecta o servidor
  mcp.ts       # Registro das tools, do resource e do prompt (camada MCP)
  service.ts   # Regra de negócio pura (encrypt/decrypt) — não conhece MCP
tests/
  helpers.ts   # Sobe o servidor como processo filho e devolve um Client conectado
  mcp.test.ts  # Testes de integração via protocolo MCP
.vscode/
  mcp.json     # Configuração do servidor para o VS Code
```

A separação entre `service.ts` e `mcp.ts` é intencional: a lógica de criptografia é testável isoladamente e o MCP é só a "casca" que a publica para o modelo.

### Detalhes de implementação

- **`registerTool`** recebe `inputSchema` **e** `outputSchema` (Zod). Com `outputSchema` definido, a resposta precisa devolver `structuredContent` além do `content` textual — é o que permite ao cliente consumir a saída tipada em vez de fazer parse de texto.
- **Erros de tool não são exceções**: em vez de lançar, as tools retornam `{ isError: true, content: [...] }`. Assim o modelo recebe a mensagem de erro como contexto e pode se corrigir (ex.: pedir a passphrase certa), em vez de derrubar a chamada.
- **`registerResource`** recebe nome de exibição e URI (`encryption://info`) — o esquema da URI é livre e serve para o cliente identificar o recurso.
- **Import `zod/v3`**: o SDK ainda espera schemas Zod v3; o pacote `zod@3.25+` expõe esse subpath explicitamente.

> ⚠️ No transporte `stdio`, o **stdout é o canal do protocolo**. Qualquer `console.log` do servidor entra no meio do JSON-RPC e pode quebrar o cliente — logs devem ir para `console.error` (stderr). O `src/index.ts` ainda usa `console.log` na mensagem de boot.

## Pré-requisitos

- **Node.js 24+** (veja `engines` no `package.json`) — roda TypeScript nativamente, sem build step

## Como rodar

```bash
npm install

# Sobe o servidor (normalmente quem faz isso é o cliente MCP, não você)
npm start

# Modo dev (watch + inspector do Node)
npm run dev
```

Não existe passo de build: o Node executa os `.ts` direto. (Em Node < 22.18 é preciso a flag `--experimental-strip-types`, usada em `tests/helpers.ts` e no `.vscode/mcp.json` por compatibilidade.)

## MCP Inspector

O [Inspector](https://modelcontextprotocol.io/docs/tools/inspector) é a forma mais rápida de validar o servidor: ele sobe o processo, faz o handshake e permite listar/chamar tools, resources e prompts numa UI de browser — sem precisar de LLM nenhuma.

```bash
npm run mcp:inspect
```

![MCP Inspector](../assets/mcp_inspect.png)

## Usando no VS Code

O `.vscode/mcp.json` deste projeto já registra o servidor:

```json
{
  "servers": {
    "ciphersuite-mcp": {
      "command": "node",
      "args": ["--experimental-strip-types", "src/index.ts"]
    }
  }
}
```

O caminho é **relativo à raiz do workspace** — funciona ao abrir esta pasta diretamente no VS Code. Se o workspace for a raiz do monorepo, troque por um caminho absoluto até `src/index.ts`.

Depois, recarregue a janela (`Cmd+Shift+P` → **Developer: Reload Window**) e peça no Copilot Chat em modo agente:

```
Encrypt the message "Hello, World!" using the passphrase "my-secret-key"
```

```
Decrypt this message: a3f1...:<ciphertext> using the passphrase "my-secret-key"
```

```
Show me the encryption://info resource
```

> Para deixar o servidor disponível em todos os workspaces, registre-o no MCP config de usuário em vez do `.vscode/mcp.json` do projeto.

## Testes

```bash
# Roda todos os testes
npm test

# Watch mode + inspector do Node
npm run test:dev
```

Os testes são de **integração pelo protocolo**, não unitários: `tests/helpers.ts` sobe o servidor como processo filho via `StdioClientTransport` e devolve um `Client` do próprio SDK — ou seja, simulam exatamente o que um agente faria.

Cobertura atual:

- Criptografar uma mensagem (valida o formato `iv:ciphertext`)
- Round-trip: criptografar e descriptografar de volta com a mesma passphrase
- Listar os resources e encontrar `encryption://info`
- Buscar `encrypt_message_prompt` e conferir o texto renderizado

## Scripts

| Script                | Descrição                                        |
| --------------------- | ------------------------------------------------ |
| `npm start`           | Sobe o servidor (é o comando usado pelos clientes MCP) |
| `npm run dev`         | Sobe com `--watch` e inspector do Node           |
| `npm test`            | Roda todos os testes                             |
| `npm run test:dev`    | Testes em watch mode com inspector               |
| `npm run mcp:inspect` | Abre a UI do MCP Inspector                       |
