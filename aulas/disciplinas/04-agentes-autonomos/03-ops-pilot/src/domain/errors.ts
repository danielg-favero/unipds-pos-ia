/** Falha previsível do domínio. A borda traduz em observação, status ou exit code. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Configuração de ambiente ausente ou inválida. Nunca carrega o valor do segredo. */
export class ConfigError extends DomainError {}

/** Entrada externa reprovada na validação de fronteira. */
export class ValidationError extends DomainError {}

export class ServiceNotFoundError extends DomainError {
  constructor(readonly serviceId: string) {
    super(`Serviço não cadastrado: ${serviceId}`);
  }
}

export class IncidentNotFoundError extends DomainError {
  constructor(readonly incidentId: string) {
    super(`Incidente não encontrado: ${incidentId}`);
  }
}

export class IncidentAlreadyResolvedError extends DomainError {
  constructor(readonly incidentId: string) {
    super(`Incidente já resolvido: ${incidentId}`);
  }
}

/** Uso interno das estratégias: vira resposta parcial, nunca chega ao chamador. */
export class IterationLimitError extends DomainError {
  constructor(readonly limit: number) {
    super(`Limite de ${limit} iterações atingido antes de concluir`);
  }
}

export class UnknownStrategyError extends DomainError {
  constructor(
    readonly requested: string,
    readonly available: readonly string[],
  ) {
    super(
      `Estratégia desconhecida: ${requested}. Válidas: ${available.join(", ")}`,
    );
  }
}

export const isDomainError = (error: unknown): error is DomainError =>
  error instanceof DomainError;

/** Mensagem segura para trace e CLI: nunca expõe stack. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
