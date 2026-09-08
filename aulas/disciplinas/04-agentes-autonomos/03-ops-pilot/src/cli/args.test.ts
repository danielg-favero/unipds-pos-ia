import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ValidationError } from "../domain/errors.js";
import { parseArgs } from "./args.js";

const AVAILABLE = ["plan-and-execute", "react"] as const;
const parse = (argv: readonly string[]) => parseArgs(argv, AVAILABLE);

describe("parseArgs — padrões", () => {
  it("aplica os padrões quando só há o pedido", () => {
    assert.deepEqual(parse(["liste os alertas"]), {
      strategies: [],
      maxIterations: 8,
      store: "json",
      request: "liste os alertas",
    });
  });

  it("junta o pedido dividido em vários argumentos posicionais", () => {
    assert.equal(parse(["liste", "os", "alertas"]).request, "liste os alertas");
  });
});

describe("parseArgs — flags", () => {
  it("lê --strategies como lista separada por vírgula, ignorando espaços", () => {
    assert.deepEqual(parse(["--strategies", "react, plan-and-execute", "x"]).strategies, [
      "react",
      "plan-and-execute",
    ]);
  });

  it("lê --max-iterations e --store", () => {
    const args = parse(["--max-iterations", "6", "--store", "mysql", "x"]);
    assert.equal(args.maxIterations, 6);
    assert.equal(args.store, "mysql");
  });

  it("aceita flags em qualquer posição relativa ao pedido", () => {
    const args = parse(["liste", "--max-iterations", "3", "os alertas"]);
    assert.equal(args.maxIterations, 3);
    assert.equal(args.request, "liste os alertas");
  });
});

describe("parseArgs — recusas", () => {
  it("recusa pedido vazio", () => {
    assert.throws(() => parse(["--strategies", "react"]), ValidationError);
  });

  it("recusa --max-iterations não numérico", () => {
    assert.throws(() => parse(["--max-iterations", "muitas", "x"]), ValidationError);
  });

  it("recusa --max-iterations fora do intervalo 1–20", () => {
    assert.throws(() => parse(["--max-iterations", "0", "x"]), ValidationError);
    assert.throws(() => parse(["--max-iterations", "21", "x"]), ValidationError);
  });

  it("recusa --max-iterations fracionário", () => {
    assert.throws(() => parse(["--max-iterations", "2.5", "x"]), ValidationError);
  });

  it("recusa --store fora de json|memory|mysql", () => {
    assert.throws(() => parse(["--store", "postgres", "x"]), ValidationError);
  });

  it("aceita os três stores válidos", () => {
    for (const store of ["json", "memory", "mysql"] as const) {
      assert.equal(parse(["--store", store, "x"]).store, store);
    }
  });

  it("recusa flag desconhecida listando o uso", () => {
    assert.throws(() => parse(["--turbo", "x"]), (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.match(error.message, /--turbo/);
      assert.match(error.message, /react/);
      return true;
    });
  });
});
