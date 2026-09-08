import { Sequelize } from "sequelize";
import { z } from "zod";

import { ConfigError } from "../../domain/errors.js";

const UrlSchema = z.object({ DATABASE_URL: z.string().min(1) });

const PartsSchema = z.object({
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().default(""),
  MYSQL_DATABASE: z.string().min(1),
});

/**
 * Constrói a conexão a partir de `DATABASE_URL` ou das variáveis `MYSQL_*`.
 * Nenhuma mensagem de erro carrega a senha — apenas o nome da variável faltante.
 */
export function createSequelize(): Sequelize {
  const url = UrlSchema.safeParse(process.env);
  if (url.success) {
    return new Sequelize(url.data.DATABASE_URL, { dialect: "mysql", logging: false });
  }

  const parts = PartsSchema.safeParse(process.env);
  if (!parts.success) {
    // Reporta o NOME da variável, nunca o valor (a senha passa por aqui).
    const missing = [
      ...new Set(parts.error.issues.map((issue) => String(issue.path[0]))),
    ].join(", ");
    throw new ConfigError(
      `Configuração do MySQL inválida: defina ${missing} no ambiente, ou use DATABASE_URL.`,
    );
  }

  return new Sequelize(
    parts.data.MYSQL_DATABASE,
    parts.data.MYSQL_USER,
    parts.data.MYSQL_PASSWORD,
    {
      host: parts.data.MYSQL_HOST,
      port: parts.data.MYSQL_PORT,
      dialect: "mysql",
      logging: false,
    },
  );
}
