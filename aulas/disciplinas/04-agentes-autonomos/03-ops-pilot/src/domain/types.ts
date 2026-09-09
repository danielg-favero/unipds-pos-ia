export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ALERT_STATUSES = ["firing", "resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const INCIDENT_STATUSES = ["open", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export type Service = {
  readonly id: string;
  readonly name: string;
};

export type Alert = {
  readonly id: string;
  readonly serviceId: string;
  readonly severity: Severity;
  readonly status: AlertStatus;
  readonly summary: string;
};

export type Incident = {
  readonly id: string;
  readonly title: string;
  readonly serviceId: string;
  readonly severity: Severity;
  readonly status: IncidentStatus;
  readonly resolvedAt: string | null;
  readonly summary: string | null;
};

export type Runbook = {
  readonly serviceId: string;
  readonly content: string;
};

/** Ordem de gravidade, da mais grave para a menos grave. */
export const severityRank = (severity: Severity): number =>
  SEVERITIES.indexOf(severity);
