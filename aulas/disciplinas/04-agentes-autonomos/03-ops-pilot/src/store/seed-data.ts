import type { Alert, Runbook, Service } from "../domain/types.js";

/**
 * Fonte única de verdade do cenário "Mercadinho": usada pelo store em memória, pelo bench, pelo
 * seed do SQLite (`src/store/sqlite/seed.ts`) e pelo seed do MySQL (legado).
 */

export const SEED_SERVICES: readonly Service[] = [
  { id: "checkout-api", name: "Checkout API" },
  { id: "payments-worker", name: "Payments Worker" },
  { id: "auth-service", name: "Auth Service" },
  { id: "search-indexer", name: "Search Indexer" },
  { id: "notification-gateway", name: "Notification Gateway" },
  { id: "catalog-service", name: "Catalog Service" },
];

/** Os serviços do cenário "Mercadinho" semeados no SQLite — hoje, todos os `SEED_SERVICES`
 * (inclui `catalog-service`, também referenciado pelo bench, cenário c2). */
export const MERCADINHO_SERVICES: readonly Service[] = SEED_SERVICES;

export const SEED_ALERTS: readonly Alert[] = [
  {
    id: "alert-01",
    serviceId: "checkout-api",
    severity: "critical",
    status: "firing",
    summary: "Taxa de erro 5xx acima de 10%",
  },
  {
    id: "alert-02",
    serviceId: "payments-worker",
    severity: "high",
    status: "firing",
    summary: "Fila de pagamentos com atraso crescente",
  },
  {
    id: "alert-03",
    serviceId: "auth-service",
    severity: "medium",
    status: "firing",
    summary: "Latência p95 de login acima do limite",
  },
  {
    id: "alert-04",
    serviceId: "search-indexer",
    severity: "low",
    status: "resolved",
    summary: "Reindexação atrasada",
  },
  {
    id: "alert-05",
    serviceId: "notification-gateway",
    severity: "high",
    status: "resolved",
    summary: "Falha de entrega de push",
  },
  {
    id: "alert-06",
    serviceId: "checkout-api",
    severity: "medium",
    status: "resolved",
    summary: "Pico de timeouts no gateway de cartão",
  },
];

export const SEED_RUNBOOKS: readonly Runbook[] = [
  {
    serviceId: "checkout-api",
    content:
      "1. Verifique a taxa de erro 5xx no dashboard do checkout.\n" +
      "2. Confirme se o gateway de pagamento está respondendo.\n" +
      "3. Se a taxa de erro persistir acima de 10% por 5min, abra incidente sev1 e acione o time de checkout.",
  },
  {
    serviceId: "payments-worker",
    content:
      "1. Verifique o tamanho da fila de pagamentos.\n" +
      "2. Confirme se os workers estão saudáveis (health check).\n" +
      "3. Se a fila crescer continuamente por mais de 10min, escale os workers e abra incidente.",
  },
  {
    serviceId: "auth-service",
    content:
      "1. Verifique a latência p95 de login no dashboard de auth.\n" +
      "2. Confirme se o serviço de sessão/token está saudável.\n" +
      "3. Se a latência ultrapassar o limite por 5min, abra incidente e acione o time de auth.",
  },
];
