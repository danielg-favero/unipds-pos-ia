import { beforeEach, describe, expect, it } from "vitest";
import { getApiUrl, isValidApiUrl, setApiUrl } from "../../src/config/api-settings";

describe("isValidApiUrl", () => {
  it("aceita URLs http/https absolutas", () => {
    expect(isValidApiUrl("http://localhost:3000")).toBe(true);
    expect(isValidApiUrl("https://ops.example.com")).toBe(true);
  });

  it("rejeita valores inválidos ou não http(s)", () => {
    expect(isValidApiUrl("não-é-url")).toBe(false);
    expect(isValidApiUrl("")).toBe(false);
    expect(isValidApiUrl("ftp://example.com")).toBe(false);
  });
});

describe("getApiUrl / setApiUrl", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("sem valor persistido, cai no default (origin)", () => {
    expect(getApiUrl()).toBe(window.location.origin);
  });

  it("persiste uma URL válida e a recupera depois", () => {
    setApiUrl("http://localhost:4000");
    expect(getApiUrl()).toBe("http://localhost:4000");
  });

  it("lança ao tentar persistir uma URL inválida", () => {
    expect(() => setApiUrl("não-é-url")).toThrow();
  });
});
