import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../../src/settings/settings-panel";
import { getApiUrl } from "../../src/config/api-settings";

describe("SettingsPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("rejeita URL inválida com erro inline e não persiste", async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const input = screen.getByLabelText("URL da API");
    await userEvent.clear(input);
    await userEvent.type(input, "não-é-url");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/url absoluta válida/i);
    expect(getApiUrl()).not.toBe("não-é-url");
  });

  it("salva URL válida e persiste entre sessões", async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const input = screen.getByLabelText("URL da API");
    await userEvent.clear(input);
    await userEvent.type(input, "http://localhost:4000");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByRole("status")).toHaveTextContent("URL salva.");
    expect(getApiUrl()).toBe("http://localhost:4000");
  });
});
