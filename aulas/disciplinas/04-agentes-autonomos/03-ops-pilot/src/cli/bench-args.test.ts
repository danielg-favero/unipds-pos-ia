import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ValidationError } from "../domain/errors.js";
import { parseBenchArgs } from "./bench-args.js";

describe("parseBenchArgs — padrões", () => {
  it("roda os 3 cenários e usa o replanejador por padrão", () => {
    assert.deepEqual(parseBenchArgs([]), { scenarios: ["c1", "c2", "c3"], noReplanner: false });
  });

  it("--scenario sem valor cai no padrão de todos os cenários", () => {
    assert.deepEqual(parseBenchArgs(["--scenario"]), {
      scenarios: ["c1", "c2", "c3"],
      noReplanner: false,
    });
  });
});

describe("parseBenchArgs — --scenario", () => {
  it("aceita um único cenário", () => {
    assert.deepEqual(parseBenchArgs(["--scenario", "c2"]).scenarios, ["c2"]);
  });

  it("aceita lista separada por vírgula, ignorando espaços", () => {
    assert.deepEqual(parseBenchArgs(["--scenario", "c1, c3"]).scenarios, ["c1", "c3"]);
  });

  it("recusa cenário desconhecido", () => {
    assert.throws(() => parseBenchArgs(["--scenario", "c9"]), ValidationError);
  });

  it("recusa cenário desconhecido mesmo misturado com válidos", () => {
    assert.throws(() => parseBenchArgs(["--scenario", "c1,c9"]), ValidationError);
  });
});

describe("parseBenchArgs — --no-replanner", () => {
  it("liga a flag sem exigir valor", () => {
    assert.equal(parseBenchArgs(["--no-replanner"]).noReplanner, true);
  });

  it("combina com --scenario em qualquer ordem", () => {
    assert.deepEqual(parseBenchArgs(["--no-replanner", "--scenario", "c1"]), {
      scenarios: ["c1"],
      noReplanner: true,
    });
    assert.deepEqual(parseBenchArgs(["--scenario", "c1", "--no-replanner"]), {
      scenarios: ["c1"],
      noReplanner: true,
    });
  });
});

describe("parseBenchArgs — recusas", () => {
  it("recusa flag desconhecida listando o uso", () => {
    assert.throws(() => parseBenchArgs(["--turbo"]), (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.match(error.message, /--turbo/);
      assert.match(error.message, /c1/);
      return true;
    });
  });
});
