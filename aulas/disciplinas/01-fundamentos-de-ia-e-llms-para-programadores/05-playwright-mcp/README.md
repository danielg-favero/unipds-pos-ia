# 05 - Playwright MCP

Demonstração de como usar o **Playwright MCP** para **gerar testes E2E automaticamente** a partir de prompts em linguagem natural, em vez de escrever cada teste à mão.

## Contexto

A ideia é conectar um agente de IA (no VS Code/Claude) ao [Playwright MCP](https://github.com/microsoft/playwright-mcp). O agente abre o navegador de verdade, executa os passos descritos no prompt e só então emite um teste Playwright em TypeScript que reflete o que aconteceu.

App alvo dos testes: <https://erickwendel.github.io/vanilla-js-web-app-example/>

Estrutura:

- `example.mcp.json` — exemplo de configuração do servidor MCP do Playwright
- `prompts/` — prompts usados para guiar o agente:
  - `project-scaffolding.md` — instruções para montar o setup do Playwright (com CI)
  - `generate-tests.md` — pedido em linguagem natural dos cenários a testar
  - `generate_test.prompt.md` — regras de como o agente deve gerar os testes
- `tests/` — testes gerados (`app.spec.ts`, `form-submit.spec.ts`, `form-validation.spec.ts`)
- `playwright.config.ts` — `baseURL` e timeout configurados
- `.github/` — workflow do GitHub Actions rodando apenas o Chromium

## Pré-requisitos

- Node.js 22
- Para gerar novos testes via MCP: um cliente com suporte a MCP (VS Code, Claude, etc.)

### Configurando o MCP (opcional, só para gerar testes)

Copie `example.mcp.json` para a configuração de MCP do seu editor e preencha o token:

```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--extension"],
      "env": { "PLAYWRIGHT_MCP_EXTENSION_TOKEN": "SEU_TOKEN_AQUI" }
    }
  }
}
```

## Como rodar os testes

```bash
npm install
npx playwright install --with-deps chromium
npm test
```
