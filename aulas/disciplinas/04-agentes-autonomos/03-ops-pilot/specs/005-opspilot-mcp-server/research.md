# Research: Servidor MCP do OpsPilot

## 1. SDK e API de servidor a usar

**Decision**: Usar `McpServer` de `@modelcontextprotocol/sdk/server/mcp.js` com `registerTool(name, { title, description, inputSchema }, handler)`, e `StdioServerTransport` de `@modelcontextprotocol/sdk/server/stdio.js` para o processo real. `inputSchema` recebe o `.shape` de cada `z.object` já exportado por `src/agents/tools.ts` (o SDK converte o shape Zod em JSON Schema internamente via `zod-to-json-schema`).

**Rationale**: É a API pública estável do SDK (`^1.30.0`) para servidores com tools; `registerTool` aceita diretamente shapes Zod, o que permite reaproveitar `listAlertsSchema.shape`, `openIncidentSchema.shape` e `resolveIncidentSchema.shape` sem reescrever validação. `StdioServerTransport` é o transporte padrão para processos locais invocados por um cliente MCP (regra do pedido: stdio).

**Alternatives considered**:
- API de baixo nível `Server` + `setRequestHandler(ListToolsRequestSchema, ...)`: mais verbosa, exige serializar manualmente o JSON Schema de cada tool; rejeitada por duplicar trabalho que `McpServer.registerTool` já faz.
- HTTP/SSE transport: fora de escopo — o pedido é explicitamente stdio.

## 2. Como reaproveitar a lógica das tools existentes sem duplicar

**Decision**: O handler de cada tool MCP chama diretamente a mesma função que hoje roda dentro do `tool()` do LangChain em `src/agents/tools.ts` (reaproveitando `asToolResult`, e a leitura/escrita via `store: OpsStore`). Não se reexporta os objetos `tool()` do LangChain (eles têm uma interface de invocação própria do LangChain, não a interface de handler do MCP) — em vez disso, o servidor MCP importa os mesmos `*Schema` e escreve um handler fino que chama `store.listAlerts`, `store.openIncident`, `store.resolveIncident` e formata a resposta no formato de conteúdo esperado pelo MCP (`{ content: [{ type: "text", text: JSON.stringify(...) }] }`).

**Rationale**: Preserva a regra "uma única fonte de verdade" no nível que importa — schema Zod e regra de negócio (via `store`/`asToolResult`) — sem forçar uma dependência estrutural entre o adaptador LangChain e o adaptador MCP, que têm contratos de invocação incompatíveis entre si.

**Alternatives considered**:
- Fazer o handler MCP chamar `tool.invoke(input)` sobre os objetos retornados por `makeTools(store)`: funciona, mas acopla o servidor MCP à API do LangChain só para invocar; rejeitado por ser uma dependência desnecessária e por já existir a função pura `asToolResult` que os dois adaptadores podem chamar igualmente. **Decisão final**: reaproveitar `asToolResult` (exportar de `tools.ts` se não pública) e os schemas Zod — não os objetos `tool()`.

## 3. Regra "nada no stdout" — como impor e verificar

**Decision**: (a) Convenção de código: nenhum `console.log`/`console.info`/`console.warn`/`console.error` sem redirecionamento — usar `console.error` (que escreve em stderr) exclusivamente para diagnóstico, ou nada. (b) Verificação automatizada: o teste do servidor usa o `InMemoryTransport` do próprio SDK (par cliente/servidor em memória, sem processo real), então não testa literalmente o stream `stdout` do processo — para isso, um teste complementar via `child_process.spawn("tsx", ["src/mcp/server.ts"])` captura `child.stdout` e `child.stderr` brutos e verifica que tudo que sai em `stdout` é JSON-RPC válido (linha a linha), nunca texto de log solto.

**Rationale**: Testar via `InMemoryTransport` é rápido e cobre a superfície funcional (listagem e chamadas de tool); o teste de processo real é o único jeito de verificar de fato o canal `stdout` do SO, que é a garantia central pedida (FR-011/SC-004).

**Alternatives considered**: Só usar `InMemoryTransport` — rejeitado porque não exercita o stream real de stdout do processo, que é exatamente a regra crítica do pedido.

## 4. Store usado pelo servidor MCP

**Decision**: `MemoryOpsStore` por padrão (mesmo padrão usado por `arena.ts`/`bench.ts` quando nenhuma opção é passada), com possibilidade de trocar para `SqliteOpsStore` lendo `process.env.OPSPILOT_DB` (mesma variável já usada por `SqliteOpsStore`) se um seletor de store for necessário no futuro. Para este recurso, mantém-se simples: instancia `new MemoryOpsStore()` seedado com os mesmos dados de demonstração (`SEED_SERVICES`/dados de `seed-data.ts`) usados pelo resto do projeto, para que `list_alerts`/`open_incident`/`resolve_incident` tenham dados reais para exercitar em teste manual.

**Rationale**: Consistente com FR-008 (mesmo armazenamento usado pelo restante do sistema) sem introduzir escolha de configuração fora do pedido original do usuário. Se o usuário quiser persistência real via SQLite, troca-se a linha de instanciação do store — não há acoplamento a `MemoryOpsStore` no protocolo em si.

**Alternatives considered**: Store vazio sem seed — rejeitado para o quickstart, pois dificulta validar manualmente `list_alerts`/`resolve_incident` fim a fim.

## 5. Script npm e variáveis de ambiente

**Decision**: `"mcp": "tsx --env-file-if-exists=.env src/mcp/server.ts"`, no mesmo padrão já usado por `dev`, `arena`, `seed` e `bench` (todos carregam `.env` se existir, sem falhar se não existir).

**Rationale**: Consistência com os scripts existentes do projeto; atende ao pedido do usuário ("se precisar de env, alterar o script e carregar ela antes").

**Alternatives considered**: Script sem `--env-file-if-exists` — rejeitado por quebrar consistência com os demais scripts caso `OPSPILOT_DB` (ou outra env futura) seja necessária.
