import { useState, type FormEvent } from "react";

export type MessageComposerProps = {
  readonly onSend: (text: string) => void;
  readonly disabled?: boolean;
};

export function MessageComposer({ onSend, disabled = false }: MessageComposerProps) {
  const [text, setText] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === "" || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "var(--space-2)", padding: "var(--space-4)" }}
    >
      <label htmlFor="composer-input" style={{ position: "absolute", left: "-9999px" }}>
        Mensagem para o agente
      </label>
      <input
        id="composer-input"
        type="text"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        placeholder="Descreva o que está acontecendo…"
        style={{
          flex: 1,
          padding: "var(--space-3)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--color-border)",
          background: "var(--color-surface-raised)",
          color: "var(--color-text)",
        }}
      />
      <button
        type="submit"
        disabled={disabled || text.trim() === ""}
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--color-primary)",
          color: "var(--color-primary-text)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        Enviar
      </button>
    </form>
  );
}
