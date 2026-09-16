import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** `base: "/opspilot/"` (016, research.md §4) — servido atrás do mesmo caminho de base da API quando publicado junto. */
export default defineConfig({
  base: "/opspilot/",
  plugins: [react()],
});
