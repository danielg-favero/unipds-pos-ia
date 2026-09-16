import { useState } from "react";
import { ChatView } from "./chat/chat-view";
import { SettingsPanel } from "./settings/settings-panel";

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.1rem" }}>War Room Console</h1>
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Abrir configurações"
          aria-expanded={settingsOpen}
          style={{
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            width: "36px",
            height: "36px",
            cursor: "pointer",
            fontSize: "1.1em",
          }}
        >
          ⚙︎
        </button>
      </header>

      {settingsOpen && (
        <div style={{ padding: "var(--space-4)" }}>
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        </div>
      )}

      <main style={{ flex: 1, overflow: "hidden" }}>
        <ChatView />
      </main>
    </div>
  );
}
