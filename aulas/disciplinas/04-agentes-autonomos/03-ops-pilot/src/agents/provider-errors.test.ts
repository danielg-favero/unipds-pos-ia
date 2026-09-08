import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeProviderError } from "./provider-errors.js";

describe("describeProviderError", () => {
  it("reconhece o 429 pelo status", () => {
    assert.match(
      describeProviderError(Object.assign(new Error("boom"), { status: 429 })),
      /limite de uso/,
    );
  });

  it("reconhece o 429 pela mensagem de cota do OpenRouter", () => {
    assert.match(
      describeProviderError(new Error("429 Rate limit exceeded: free-models-per-day")),
      /limite de uso/,
    );
  });

  it("reconhece credencial recusada", () => {
    for (const status of [401, 403]) {
      assert.match(
        describeProviderError(Object.assign(new Error("nope"), { status })),
        /OPENROUTER_API_KEY/,
      );
    }
  });

  it("traduz o TypeError do SDK ao parsear resposta de erro sem choices", () => {
    assert.match(
      describeProviderError(new Error("Cannot read properties of undefined (reading 'map')")),
      /resposta vazia ou de erro/,
    );
  });

  it("traduz a falha de parse de saída estruturada vazia", () => {
    assert.match(
      describeProviderError(new Error('Failed to parse. Text: "". Error: SyntaxError')),
      /resposta vazia ou de erro/,
    );
  });

  it("repassa erros que não são do provedor sem alterar", () => {
    assert.equal(describeProviderError(new Error("Serviço não cadastrado: x")), "Serviço não cadastrado: x");
  });

  it("lida com valores lançados que não são Error", () => {
    assert.equal(describeProviderError("falha crua"), "falha crua");
    assert.equal(describeProviderError(null), "null");
  });

  it("nunca inclui o valor da credencial na tradução", () => {
    const described = describeProviderError(
      Object.assign(new Error("bad key sk-or-v1-segredo"), { status: 401 }),
    );
    assert.ok(!described.includes("sk-or-v1-segredo"));
  });
});
