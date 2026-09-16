import { useState } from "react";
import { getApiUrl, isValidApiUrl, setApiUrl } from "../config/api-settings";

export type SettingsPanelProps = {
  readonly onClose: () => void;
};

/** Painel da engrenagem (016, US4): configura a URL da API, validando antes de persistir. */
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [value, setValue] = useState(getApiUrl());
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!isValidApiUrl(value)) {
      setError("Informe uma URL absoluta válida (ex.: http://localhost:3000).");
      setSaved(false);
      return;
    }
    setApiUrl(value);
    setError(undefined);
    setSaved(true);
  };

  return (
    <aside
      role="dialog"
      aria-label="Configurações"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        background: "var(--color-surface)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        maxWidth: "420px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Configurações</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar configurações"
          style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.1em" }}
        >
          ×
        </button>
      </div>

      <label htmlFor="api-url-input">URL da API</label>
      <input
        id="api-url-input"
        type="text"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setSaved(false);
        }}
        style={{
          padding: "var(--space-2)",
          borderRadius: "var(--radius)",
          border: `1px solid ${error !== undefined ? "var(--color-danger)" : "var(--color-border)"}`,
          background: "var(--color-surface-raised)",
          color: "var(--color-text)",
        }}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? "api-url-error" : undefined}
      />
      {error !== undefined && (
        <span id="api-url-error" role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </span>
      )}
      {saved && (
        <span role="status" style={{ color: "var(--color-success)" }}>
          URL salva.
        </span>
      )}

      <button
        type="button"
        onClick={handleSave}
        style={{
          alignSelf: "flex-start",
          padding: "var(--space-2) var(--space-4)",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--color-primary)",
          color: "var(--color-primary-text)",
          cursor: "pointer",
        }}
      >
        Salvar
      </button>
    </aside>
  );
}
