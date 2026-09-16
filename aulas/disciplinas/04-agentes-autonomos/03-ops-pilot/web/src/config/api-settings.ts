const STORAGE_KEY = "opspilot:apiUrl";

/** URL absoluta http(s) válida — FR-013. */
export function isValidApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const defaultApiUrl = (): string => {
  try {
    return window.location.origin;
  } catch {
    return "http://localhost:3000";
  }
};

/** Lê a URL persistida (FR-014); cai no default quando ausente/corrompida. */
export function getApiUrl(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null && isValidApiUrl(stored)) return stored;
  } catch {
    // localStorage indisponível (ex.: navegação privada) — usa o default.
  }
  return defaultApiUrl();
}

/** Persiste a URL da API; lança se inválida (validar com `isValidApiUrl` antes na UI). */
export function setApiUrl(value: string): void {
  if (!isValidApiUrl(value)) {
    throw new Error(`URL inválida: ${value}`);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Falha silenciosa de persistência (ex.: quota) não deve travar a UI.
  }
}
