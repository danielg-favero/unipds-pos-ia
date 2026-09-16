import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles/tokens.css";

const container = document.getElementById("root");
if (container === null) throw new Error("elemento #root não encontrado");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
