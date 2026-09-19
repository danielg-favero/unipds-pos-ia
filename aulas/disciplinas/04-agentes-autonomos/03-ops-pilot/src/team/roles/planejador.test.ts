import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("planejador — sem ferramentas (US2, FR-006)", () => {
  it("o módulo nunca importa makeTools/createReactAgent — a ausência de ferramentas é estrutural, não apenas de prompt", async () => {
    const path = fileURLToPath(new URL("./planejador.ts", import.meta.url));
    const source = await readFile(path, "utf8");

    assert.ok(!source.includes('from "../../agents/tools.js"'));
    assert.ok(!source.includes('from "@langchain/langgraph/prebuilt"'));
  });
});
