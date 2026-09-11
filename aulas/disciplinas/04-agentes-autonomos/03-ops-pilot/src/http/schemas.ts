import { z } from "zod";

/** Corpo de `POST /chat`. Sem coerção: `reflect` só aceita booleano literal. */
export const chatRequestSchema = z
  .object({
    message: z.string().min(1),
    strategy: z.string().min(1).optional(),
    reflect: z.boolean().optional().default(false),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
