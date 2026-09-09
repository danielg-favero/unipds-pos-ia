# Quickstart: Servidor MCP do OpsPilot

## Pré-requisitos

- Dependências instaladas (`npm install`), incluindo `@modelcontextprotocol/sdk` (adicionada por este recurso).
- Node 24 LTS.

## Rodar o servidor

```bash
npm run mcp
```

O processo fica aguardando um cliente MCP conectar via stdio (não imprime nada em stdout fora do protocolo — ver [contracts/mcp-tools.md](./contracts/mcp-tools.md)).

## Validar a listagem de tools (automatizado)

```bash
npm test -- --test-name-pattern "opspilot"
```

Cobre (ver [data-model.md](./data-model.md) e [contracts/mcp-tools.md](./contracts/mcp-tools.md)):
- `tools/list` retorna exatamente `list_alerts`, `open_incident`, `resolve_incident`.
- Fluxo feliz de `open_incident` → `resolve_incident` sobre o mesmo `OpsStore`.
- `open_incident` com serviço inexistente devolve erro de domínio (`ok: false`), não exceção.
- Nada é escrito em `stdout` do processo além de frames JSON-RPC do protocolo.

## Validar manualmente com um cliente MCP genérico

1. Configure o cliente MCP (ex.: um assistente com suporte a MCP) para iniciar o comando `npm run mcp` dentro do diretório do projeto, transporte stdio.
2. Peça ao cliente para listar as ferramentas do servidor `opspilot` — devem aparecer `list_alerts`, `open_incident`, `resolve_incident`.
3. Invoque `list_alerts` sem argumentos — deve retornar os alertas em disparo do cenário seed do projeto.
4. Invoque `open_incident` com um serviço existente (ex.: `checkout-api`), um título e uma severidade válida — deve retornar um `id` de incidente.
5. Invoque `resolve_incident` com o `id` retornado — deve retornar `status: "resolved"`.

## Expected outcome

Todos os passos acima completam sem que o processo do servidor encerre inesperadamente, e o comportamento observado é idêntico ao das mesmas operações feitas hoje pelo agente interno do OpsPilot sobre o mesmo `OpsStore` (SC-002).
