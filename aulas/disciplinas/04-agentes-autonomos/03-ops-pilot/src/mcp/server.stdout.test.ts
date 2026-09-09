import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SERVER_PATH = fileURLToPath(new URL("./server.ts", import.meta.url));

/**
 * Regra crítica: stdout do processo pertence só ao framing JSON-RPC do MCP.
 * Este teste sobe o processo real (não InMemoryTransport) e inspeciona o
 * stream de stdout bruto, pois só isso exercita a garantia no nível do SO.
 */
describe("opspilot MCP server: pureza do stdout", () => {
  it("toda linha de stdout é um frame JSON-RPC válido", async () => {
    const child = spawn("npx", ["tsx", SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutLines: string[] = [];
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      stdoutLines.push(...lines.filter((line) => line.length > 0));
    });

    const initializeRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "stdout-purity-test", version: "1.0.0" },
      },
    };
    const initializedNotification = { jsonrpc: "2.0", method: "notifications/initialized" };
    const listToolsRequest = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

    child.stdin.write(`${JSON.stringify(initializeRequest)}\n`);
    child.stdin.write(`${JSON.stringify(initializedNotification)}\n`);
    child.stdin.write(`${JSON.stringify(listToolsRequest)}\n`);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    child.kill();

    assert.ok(stdoutLines.length > 0, "esperava ao menos uma linha em stdout");
    for (const line of stdoutLines) {
      assert.doesNotThrow(
        () => JSON.parse(line),
        `linha de stdout não é JSON-RPC válido: ${line}`,
      );
    }
  });
});
