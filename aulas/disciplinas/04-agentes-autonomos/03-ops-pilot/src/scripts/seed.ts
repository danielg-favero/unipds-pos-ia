import { errorMessage } from "../domain/errors.js";
import {
  DEFAULT_DB_PATH,
  readDatabase,
  seedDatabase,
  writeDatabase,
  type Database,
} from "../store/json.js";
import { SEED_ALERTS, SEED_SERVICES } from "../store/seed-data.js";

const summary = (db: Database): string => {
  const firing = db.alerts.filter((alert) => alert.status === "firing").length;
  const resolved = db.alerts.filter((alert) => alert.status === "resolved").length;
  return `${db.services.length} serviços, ${db.alerts.length} alertas (${firing} firing, ${resolved} resolved), ${db.incidents.length} incidentes`;
};

/**
 * Carga inicial do arquivo JSON. Idempotente: serviços e alertas são
 * reescritos a partir da fonte canônica, e os incidentes já existentes são
 * preservados — o seed repõe a base, não apaga o trabalho do plantão.
 */
async function seedJson(path: string): Promise<void> {
  const fresh = seedDatabase();

  let incidents = fresh.incidents;
  try {
    incidents = (await readDatabase(path)).incidents;
  } catch {
    // Primeira execução ou arquivo inválido: começa do zero.
  }

  const db: Database = { ...fresh, incidents };
  await writeDatabase(path, db);
  console.log(`seed ok (${path}): ${summary(db)}`);
}

/** Caminho MySQL, opt-in por `--mysql`. */
async function seedMysql(): Promise<void> {
  const { createSequelize } = await import("../store/sequelize/connection.js");
  const { initModels } = await import("../store/sequelize/models.js");

  const sequelize = createSequelize();
  const models = initModels(sequelize);
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    for (const service of SEED_SERVICES) {
      await models.Service.upsert({ id: service.id, name: service.name });
    }
    for (const alert of SEED_ALERTS) {
      await models.Alert.upsert({ ...alert });
    }

    const services = await models.Service.count();
    const firing = await models.Alert.count({ where: { status: "firing" } });
    const resolved = await models.Alert.count({ where: { status: "resolved" } });
    console.log(
      `seed ok (mysql): ${services} serviços, ${firing + resolved} alertas (${firing} firing, ${resolved} resolved)`,
    );
  } finally {
    await sequelize.close();
  }
}

const argv = process.argv.slice(2);
const pathFlag = argv.indexOf("--path");
const path = pathFlag === -1 ? DEFAULT_DB_PATH : (argv[pathFlag + 1] ?? DEFAULT_DB_PATH);

try {
  await (argv.includes("--mysql") ? seedMysql() : seedJson(path));
} catch (error) {
  console.error(`seed falhou: ${errorMessage(error)}`);
  process.exitCode = 1;
}
