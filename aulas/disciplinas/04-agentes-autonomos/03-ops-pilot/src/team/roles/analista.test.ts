import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { makeTools } from "../../agents/tools.js";
import { MemoryOpsStore } from "../../store/memory.js";
import { ANALISTA_TOOL_NAMES } from "./analista.js";

describe("analista — escopo de ferramentas (US2, FR-005)", () => {
  it("nunca inclui ferramentas de escrita/execução", () => {
    assert.ok(!ANALISTA_TOOL_NAMES.includes("open_incident" as never));
    assert.ok(!ANALISTA_TOOL_NAMES.includes("resolve_incident" as never));
  });

  it("o filtro de makeTools() por ANALISTA_TOOL_NAMES devolve só ferramentas de leitura", () => {
    const tools = makeTools(new MemoryOpsStore()).filter((tool) =>
      (ANALISTA_TOOL_NAMES as readonly string[]).includes(tool.name),
    );
    const names = tools.map((tool) => tool.name).toSorted();
    assert.deepEqual(names, [...ANALISTA_TOOL_NAMES].toSorted());
  });
});
