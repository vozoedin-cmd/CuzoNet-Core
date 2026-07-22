import type { ZodType } from 'zod';
import type {
  ProvisioningActionAdapter,
  ProvisioningActionInput,
  ProvisioningActionResult,
} from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type {
  RouterConnectionProfile,
  RouterConnectionResolverPort,
} from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsPasswordSecretNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-password-secret-not-found.error.js';
import { environment } from '../../config/environment.js';
import { logger } from '../../logging/logger.js';

export interface RouterOsCommand {
  readonly actionType: string;
  readonly routerId: string;
}

/** TEMPORAL: extrae error.code (p. ej. ECONNREFUSED) de errores de Node sin recurrir a `any`. */
function extractErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Template base for RouterOS provisioning adapters (simple-queue, PPPoE, etc.).
 * Owns payload validation, connection/secret resolution, client lifecycle and
 * generic error mapping so concrete adapters only implement the RouterOS
 * operation itself via `executeOperation`.
 */
export abstract class RouterOsProvisioningAdapterBase<TCommand extends RouterOsCommand>
  implements ProvisioningActionAdapter
{
  public constructor(
    public readonly type: string,
    private readonly schema: ZodType<TCommand>,
    private readonly connectionResolver: RouterConnectionResolverPort,
    private readonly secretProvider: SecretProviderPort,
    private readonly clientFactory: RouterOsClientFactoryPort,
  ) {}

  public async execute(input: ProvisioningActionInput): Promise<ProvisioningActionResult> {
    if (input.actionType !== this.type) {
      return {
        errorCode: 'ROUTEROS_ACTION_UNKNOWN',
        errorMessage: `Accion no soportada por este adaptador: ${input.actionType}`,
        outcome: 'permanentFailure',
      };
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(input.inputSnapshotJson);
    } catch {
      return {
        errorCode: 'ROUTEROS_INVALID_PAYLOAD',
        errorMessage: 'Payload no es JSON valido.',
        outcome: 'permanentFailure',
      };
    }

    const validation = this.schema.safeParse(parsedPayload);
    if (!validation.success) {
      return {
        errorCode: 'ROUTEROS_VALIDATION_ERROR',
        errorMessage: 'Payload JSON no cumple el esquema requerido.',
        outcome: 'permanentFailure',
      };
    }

    const command = validation.data;
    const logContext = {
      action: 'provisioning.routeros.execute',
      actionType: input.actionType,
      attemptNumber: input.attemptNumber,
      module: 'provisioning',
      provisioningId: input.requestId,
      routerId: command.routerId,
      ...this.additionalLogFields(command),
    };

    const profile = await this.resolveConnection(input.companyId, command.routerId);
    if (!profile) {
      return {
        errorCode: 'ROUTEROS_ROUTER_NOT_FOUND',
        errorMessage: 'Router no encontrado o perfil incompleto.',
        outcome: 'permanentFailure',
      };
    }

    const secret = await this.resolveSecret(profile.secretReference);
    if (!secret) {
      return {
        errorCode: 'ROUTEROS_SECRET_NOT_FOUND',
        errorMessage: 'Secreto no encontrado.',
        outcome: 'permanentFailure',
      };
    }

    let client: RouterOsClientPort;
    try {
      client = await this.createClient(profile, secret);
    } catch (e: unknown) {
      const failure = this.mapClientCreationError(e);
      const normalizedError =
        e instanceof Error
          ? {
              cause: e.cause,
              code: extractErrorCode(e),
              message: e.message,
              name: e.name,
              stack: e.stack,
            }
          : {
              type: typeof e,
              value: String(e),
            };
      // TEMPORAL: diagnóstico de ROUTEROS_CLIENT_CREATION_FAILED — remover una vez identificada la causa. No registra la contraseña.
      logger.error({
        ...logContext,
        ...this.resultLogFields(failure),
        action: 'routeros.client.creation.failed',
        commandTimeout: environment.ROUTEROS_COMMAND_TIMEOUT_MS,
        connectTimeout: profile.timeoutMs,
        error: normalizedError,
        host: profile.host,
        passwordPresent: Boolean(secret),
        port: profile.port,
        tls: profile.tls,
        tlsVerify: environment.ROUTEROS_TLS_VERIFY,
        usernamePresent: Boolean(profile.username),
      });
      return failure;
    }

    const startTime = Date.now();
    try {
      const reference = await this.executeOperation(client, command);
      const durationMs = Date.now() - startTime;
      logger.info({ ...logContext, durationMs, result: 'success' }, 'routeros_provisioning_succeeded');
      return {
        metadata: {
          actionType: input.actionType,
          durationMs,
          [this.referenceMetadataKey]: reference,
          routerId: command.routerId,
        },
        outcome: 'success',
      };
    } catch (e: unknown) {
      const failure = this.mapExecutionError(e);
      logger.warn(
        { ...logContext, durationMs: Date.now() - startTime, ...this.resultLogFields(failure) },
        'routeros_provisioning_execution_failed',
      );
      return failure;
    } finally {
      await this.closeClient(client);
    }
  }

  /** Extracts {result, errorCode} for structured logging without ever logging secrets/payloads. */
  private resultLogFields(result: ProvisioningActionResult): { errorCode?: string; result: string } {
    return result.outcome === 'success'
      ? { result: result.outcome }
      : { errorCode: result.errorCode, result: result.outcome };
  }

  protected resolveConnection(companyId: string, routerId: string): Promise<RouterConnectionProfile | null> {
    return this.connectionResolver.resolve(companyId, routerId);
  }

  protected resolveSecret(secretReference: string): Promise<string | null> {
    return this.secretProvider.getSecret(secretReference);
  }

  /**
   * Resolves a client credential reference (e.g. a PPPoE/Hotspot password)
   * to its real secret value via SecretProviderPort. The raw secret never
   * comes from the request payload, so it is never persisted in
   * ProvisioningRequest.inputSnapshotJson, logged, or emitted as an event.
   */
  protected async resolveCredential(credentialReference: string): Promise<string> {
    const credential = await this.resolveSecret(credentialReference);
    if (credential === null) {
      throw new RouterOsPasswordSecretNotFoundError(
        `Credencial no encontrada para la referencia: ${credentialReference}`,
      );
    }
    return credential;
  }

  protected createClient(profile: RouterConnectionProfile, secret: string): Promise<RouterOsClientPort> {
    return this.clientFactory.create(profile, secret);
  }

  protected async closeClient(client: RouterOsClientPort): Promise<void> {
    await client.close().catch(() => {
      // Ignore close errors
    });
  }

  protected mapClientCreationError(error: unknown): ProvisioningActionResult {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('routeros_provisioning_disabled')) {
      return {
        errorCode: 'ROUTEROS_PROVISIONING_DISABLED',
        errorMessage: 'La integracion RouterOS esta deshabilitada.',
        outcome: 'permanentFailure',
      };
    }
    if (
      message.includes('auth') ||
      message.includes('login') ||
      message.includes('permission') ||
      message.includes('invalid user')
    ) {
      return {
        errorCode: 'ROUTEROS_AUTHENTICATION_ERROR',
        errorMessage: 'Error de autenticacion en el router.',
        outcome: 'permanentFailure',
      };
    }
    if (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('ehostunreach') ||
      message.includes('connection refused')
    ) {
      return {
        errorCode: 'ROUTEROS_CONNECTION_FAILED',
        errorMessage: 'Error temporal de conexion.',
        outcome: 'temporaryFailure',
      };
    }
    return {
      errorCode: 'ROUTEROS_CLIENT_CREATION_FAILED',
      errorMessage: 'Error desconocido al crear la conexion.',
      outcome: 'temporaryFailure',
    };
  }

  /**
   * Maps execution-time errors. Concrete adapters override this to translate
   * their own conflict-error type first, then fall back to
   * `mapGenericExecutionError` for the shared timeout/disconnect handling.
   */
  protected mapExecutionError(error: unknown): ProvisioningActionResult {
    return this.mapGenericExecutionError(error);
  }

  protected mapGenericExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsPasswordSecretNotFoundError) {
      return {
        errorCode: 'ROUTEROS_PASSWORD_SECRET_NOT_FOUND',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('timeout') || message.includes('disconnected') || message.includes('interrupted')) {
      return {
        errorCode: 'ROUTEROS_EXECUTION_TIMEOUT',
        errorMessage: 'Tiempo de espera agotado al ejecutar comando.',
        outcome: 'temporaryFailure',
      };
    }
    return {
      errorCode: 'ROUTEROS_EXECUTION_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Error desconocido de ejecucion',
      outcome: 'permanentFailure',
    };
  }

  /**
   * Executes the RouterOS-specific operation (including its own
   * idempotency/conflict check against the existing remote resource) and
   * returns the resource reference to report in the success metadata.
   */
  protected abstract executeOperation(client: RouterOsClientPort, command: TCommand): Promise<string | undefined>;

  /** Key used to report the resource reference in the success metadata (e.g. 'queueReference', 'secretReference'). */
  protected abstract readonly referenceMetadataKey: string;

  /** Optional adapter-specific fields to enrich structured logs (e.g. addressList/address for Firewall). Never secrets. */
  protected additionalLogFields(_command: TCommand): Record<string, unknown> {
    return {};
  }
}
