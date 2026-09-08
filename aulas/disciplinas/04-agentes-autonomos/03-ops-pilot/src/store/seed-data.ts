import type { Alert, Service } from "../domain/types.js";

/** Fonte única de verdade do estado inicial: usada pelo store em memória e pelo seed do MySQL. */

export const SEED_SERVICES: readonly Service[] = [
  { id: "checkout-api", name: "Checkout API" },
  { id: "payments-worker", name: "Payments Worker" },
  { id: "auth-service", name: "Auth Service" },
  { id: "search-indexer", name: "Search Indexer" },
  { id: "notification-gateway", name: "Notification Gateway" },
  { id: "catalog-service", name: "Catalog Service" },
];

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
