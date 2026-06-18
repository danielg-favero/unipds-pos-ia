# 04 - Web AI (Prompt API do navegador)

Demonstração da **Prompt API** nativa do navegador, que roda uma LLM **localmente, no próprio dispositivo** (modelo Gemini Nano embutido no Chrome), sem chamar nenhuma API externa.

## Contexto

O `index.html` faz o seguinte:

1. Lê os parâmetros padrão do modelo (`LanguageModel.params()`)
2. Cria uma sessão com um prompt de sistema ("Você é um assistente de IA que responde de forma clara e objetiva")
3. Envia uma pergunta (`"Quem inventou o javascript?"`) usando `promptStreaming`
4. Renderiza a resposta em tempo real (streaming), convertendo o Markdown recebido em HTML

A ideia é mostrar que dá para usar IA generativa diretamente no front-end, sem servidor e sem custo de tokens.

## Pré-requisitos

- **Google Chrome** (canal estável recente, Dev ou Canary) com a Prompt API / IA embutida habilitada.
- As flags experimentais costumam ser necessárias:
  - `chrome://flags/#prompt-api-for-gemini-nano` → **Enabled**
  - `chrome://flags/#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
- Após habilitar, reinicie o Chrome e aguarde o download do modelo on-device.

> A API exige um contexto seguro (`https://` ou `localhost`). Por isso, prefira servir o arquivo em vez de abri-lo via `file://`.

## Como rodar

Sirva a pasta com qualquer servidor estático e abra no Chrome:

```bash
npx serve .
# ou
python3 -m http.server 8000
```

Acesse o endereço informado (ex.: `http://localhost:3000`) e a resposta gerada pela LLM local aparecerá na tela.
