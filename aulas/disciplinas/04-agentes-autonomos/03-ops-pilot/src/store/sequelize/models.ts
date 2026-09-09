import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

import {
  ALERT_STATUSES,
  INCIDENT_STATUSES,
  SEVERITIES,
  type AlertStatus,
  type IncidentStatus,
  type Severity,
} from "../../domain/types.js";

export class ServiceModel extends Model<
  InferAttributes<ServiceModel>,
  InferCreationAttributes<ServiceModel>
> {
  declare id: string;
  declare name: string;
}

export class AlertModel extends Model<
  InferAttributes<AlertModel>,
  InferCreationAttributes<AlertModel>
> {
  declare id: string;
  declare serviceId: string;
  declare severity: Severity;
  declare status: AlertStatus;
  declare summary: string;
}

export class IncidentModel extends Model<
  InferAttributes<IncidentModel>,
  InferCreationAttributes<IncidentModel>
> {
  declare id: string;
  declare title: string;
  declare serviceId: string;
  declare severity: Severity;
  declare status: IncidentStatus;
  declare resolvedAt: string | null;
  declare summary: string | null;
}

export type OpsModels = {
  readonly Service: typeof ServiceModel;
  readonly Alert: typeof AlertModel;
  readonly Incident: typeof IncidentModel;
};

export function initModels(sequelize: Sequelize): OpsModels {
  ServiceModel.init(
    {
      id: { type: DataTypes.STRING(64), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
    },
    { sequelize, tableName: "services", underscored: true },
  );

  AlertModel.init(
    {
      id: { type: DataTypes.STRING(64), primaryKey: true },
      serviceId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        references: { model: "services", key: "id" },
      },
      severity: { type: DataTypes.ENUM(...SEVERITIES), allowNull: false },
      status: { type: DataTypes.ENUM(...ALERT_STATUSES), allowNull: false },
      summary: { type: DataTypes.STRING(240), allowNull: false },
    },
    {
      sequelize,
      tableName: "alerts",
      underscored: true,
      indexes: [{ fields: ["status"] }],
    },
  );

  IncidentModel.init(
    {
      id: { type: DataTypes.STRING(64), primaryKey: true },
      title: { type: DataTypes.STRING(160), allowNull: false },
      serviceId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        references: { model: "services", key: "id" },
      },
      severity: { type: DataTypes.ENUM(...SEVERITIES), allowNull: false },
      status: { type: DataTypes.ENUM(...INCIDENT_STATUSES), allowNull: false },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      summary: { type: DataTypes.STRING(500), allowNull: true },
    },
    {
      sequelize,
      tableName: "incidents",
      underscored: true,
      indexes: [{ fields: ["status"] }],
    },
  );

  return { Service: ServiceModel, Alert: AlertModel, Incident: IncidentModel };
}
