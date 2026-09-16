# Quickstart: War Room Console

Guia para validar a feature de ponta a ponta depois de implementada. Não é um passo a passo de
implementação — ver `tasks.md` (gerado por `/speckit-tasks`) para isso.

## Pré-requisitos

- Node 24 LTS instalado.
- Dependências do backend instaladas na raiz do repo (`npm install`).
- Dependências do frontend instaladas em `web/` (`npm install` dentro de `web/`).
- `.env` do backend configurado (ver `.env.example`), incluindo `OPSPILOT_WEB_ORIGIN` apontando para a
  origem do Vite dev server (ex. `http://localhost:5173`).

## Subir o backend

```bash
npm run http
```

Confirma que o servidor está no ar e montado sob `/opspilot`:

```bash
curl -s http://localhost:3000/opspilot/chat -X POST \
  -H "content-type: application/json" \
  -d '{"message":"liste os alertas ativos","userId":"operador-1"}'
```

Esperado: `200` com `answer`, `trace`, `metrics`, `conversation`, `requestId` no corpo.

## Subir o frontend

```bash
cd web
npm run dev
```

Abrir a URL impressa pelo Vite (ex. `http://localhost:5173`).

## Cenário 1 — Chat básico (User Story 1)

1. Na engrenagem, definir a URL da API como `http://localhost:3000`.
2. Enviar a mensagem "liste os alertas ativos".
3. **Esperado**: a mensagem do operador aparece imediatamente; um indicador de "processando" é exibido;
   a resposta do agente substitui o indicador quando chega.

## Cenário 2 — Ver raciocínio (User Story 2)

1. Em uma resposta do agente já recebida, clicar em "ver raciocínio".
2. **Esperado**: painel estruturado lista os passos (`thought`, `plan`, `action`, `observation`, etc.),
   cada um com layout distinto por tipo. Fechar o painel retorna à conversa sem perda de estado.

## Cenário 3 — Aprovar/negar ação pendente (User Story 3)

1. Enviar uma mensagem que leve o agente a propor `resolve_incident` (ex. "resolva o incidente INC-1").
2. **Esperado**: a resposta chega como cartão "Aprovar/Negar" (202), não como texto solto — ver
   `contracts/http-api.md`.
3. Clicar em "Aprovar".
4. **Esperado**: o cartão passa a refletir "aprovado" e mostra o resultado da execução; a chamada real
   correspondente é `POST /chat/:requestId/decision` com `{"decision":"approve"}`.
5. Repetir o cenário e clicar em "Negar" numa nova aprovação pendente.
6. **Esperado**: cartão reflete "negado"; nenhuma chamada ao `resolve_incident` real ocorre (validável
   conferindo que o incidente continua sem alteração de status via `GET`/tool de listagem).
7. Tentar decidir o mesmo cartão de novo (ex. recarregar a página e clicar de novo).
8. **Esperado**: nenhuma segunda execução ocorre; a UI mostra a decisão já tomada (409 tratado
   silenciosamente como "sincroniza estado", não como erro visível ao operador).

## Cenário 4 — Configurar URL da API (User Story 4)

1. Abrir a engrenagem, digitar uma URL inválida (ex. `não-é-url`) e tentar salvar.
2. **Esperado**: erro de validação inline, nada é persistido.
3. Digitar uma URL válida e salvar.
4. **Esperado**: próxima mensagem de chat é enviada para a nova URL (conferir na aba de rede do
   navegador). Recarregar a página e reabrir a engrenagem confirma que o valor persistiu.

## Verificação técnica

```bash
# backend
npm run typecheck && npm test

# frontend
cd web && npm run typecheck && npm test
```

Ambos devem terminar sem falhas antes de considerar a feature pronta para revisão.
