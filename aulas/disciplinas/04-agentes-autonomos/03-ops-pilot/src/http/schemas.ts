import { z } from "zod";

/**
 * Corpo de `POST /chat`. Sem coerção: `reflect` só aceita booleano literal.
 * `strategy`, quando informado, é um override manual do roteamento automático
 * do grafo unificado (013) — contorna a decisão automática de estratégia.
 */
export const chatRequestSchema = z
  .object({
    message: z.string().min(1),
    userId: z.string().min(1),
    strategy: z.string().min(1).optional(),
    reflect: z.boolean().optional().default(false),
    conversation: z.string().min(1).optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Corpo de `POST /memories`. */
export const rememberRequestSchema = z
  .object({
    userId: z.string().min(1),
    fact: z.string().min(1),
  })
  .strict();

export type RememberRequest = z.infer<typeof rememberRequestSchema>;

/** Query string de `GET /memories`. `express` entrega query params como string. */
export const recallQuerySchema = z
  .object({
    userId: z.string().min(1),
    query: z.string().min(1),
    limit: z.coerce.number().int().positive().optional(),
  })
  .strict();

export type RecallQuery = z.infer<typeof recallQuerySchema>;

/** Query string de `DELETE /memories/:id`. */
export const forgetQuerySchema = z
  .object({
    userId: z.string().min(1),
  })
  .strict();

export type ForgetQuery = z.infer<typeof forgetQuerySchema>;
