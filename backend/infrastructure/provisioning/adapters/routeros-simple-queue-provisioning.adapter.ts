import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  RouterOsSimpleQueueCreateData,
  RouterOsSimpleQueueUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsSimpleQueueConflictError } from '../../../domain/provisioning/routeros/errors/routeros-simple-queue-conflict.error.js';
import { logger } from '../../logging/logger.js';
import {
  routerOsSimpleQueueInputSchema,
  type RouterOsSimpleQueueCreateInput,
  type RouterOsSimpleQueueDisableInput,
  type RouterOsSimpleQueueEnableInput,
  type RouterOsSimpleQueueInput,
  type RouterOsSimpleQueueRemoveInput,
  type RouterOsSimpleQueueUpdateInput,
} from '../routeros/routeros-simple-queue.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';

interface SimpleQueueComparisonFields {
  readonly comment: string;
  readonly disabled: boolean;
  readonly maxLimit: string;
  readonly name: string;
  readonly target: string;
}

/**
 * RouterOS siempre devuelve el target de una Simple Queue con mascara CIDR explicita
 * (un target sin mascara al crear se normaliza a /32 en el router). Sin este paso, comparar
 * "192.168.10.250/32" (lo que devuelve RouterOS) contra "192.168.10.250" (lo que pudo haber
 * llegado en la request sin mascara) produce un ROUTEROS_SIMPLE_QUEUE_CONFLICT falso.
 */
function normalizeSimpleQueueTarget(target: string): string {
  const trimmed = target.trim();
  return trimmed.includes('/') ? trimmed : `${trimmed}/32`;
}

/**
 * RouterOS acepta tasas abreviadas al escribir ("1M") pero /queue/simple/print las
 * devuelve como bytes/segundo numericos ("1000000"). Sin convertir ambos lados a la
 * misma unidad, "1000000" y "1M" se comparan como strings distintos y producen un
 * ROUTEROS_SIMPLE_QUEUE_CONFLICT falso aunque representen la misma tasa.
 */
function normalizeRouterOsRate(rate: string): number {
  const value = rate.trim().toUpperCase();
  const match = /^(\d+(?:\.\d+)?)([KMG]?)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid RouterOS rate: ${rate}`);
  }
  const amount = Number(match[1] ?? '');
  const unit = match[2] ?? '';
  const multiplier = unit === 'K' ? 1_000 : unit === 'M' ? 1_000_000 : unit === 'G' ? 1_000_000_000 : 1;
  return amount * multiplier;
}

function normalizeSimpleQueueMaxLimit(maxLimit: string): [number, number] {
  const [upload, download] = maxLimit.split('/');
  if (!upload || !download) {
    throw new Error(`Invalid RouterOS max-limit: ${maxLimit}`);
  }
  return [normalizeRouterOsRate(upload), normalizeRouterOsRate(download)];
}

function simpleQueueMaxLimitsEqual(actual: string, desiredUpload: string, desiredDownload: string): boolean {
  const [actualUpload, actualDownload] = normalizeSimpleQueueMaxLimit(actual);
  return actualUpload === normalizeRouterOsRate(desiredUpload) && actualDownload === normalizeRouterOsRate(desiredDownload);
}

/**
 * TEMPORAL: diagnóstico de ROUTEROS_SIMPLE_QUEUE_CONFLICT — remover una vez identificado
 * si el conflicto es real o un falso positivo por diferencias de representación
 * (espacios, "yes"/"no" vs boolean, formato de target, etc). Simple Queue no maneja
 * credenciales, así que es seguro registrar los valores completos (no solo las claves).
 */
function logSimpleQueueConflict(desired: SimpleQueueComparisonFields, actual: SimpleQueueComparisonFields): void {
  const differences = (Object.keys(desired) as Array<keyof SimpleQueueComparisonFields>).filter(
    (field) => String(desired[field]) !== String(actual[field]),
  );
  logger.warn(
    { actual, desired, differences },
    'routeros_simple_queue_conflict_diagnostics',
  );
}

export class RouterOsSimpleQueueProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsSimpleQueueInput> {
  protected readonly referenceMetadataKey = 'queueReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsSimpleQueueInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueInput,
  ): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.simple_queue.create':
        return this.handleCreate(client, command);
      case 'routeros.simple_queue.update':
        return this.handleUpdate(client, command);
      case 'routeros.simple_queue.enable':
        return this.handleEnable(client, command);
      case 'routeros.simple_queue.disable':
        return this.handleDisable(client, command);
      case 'routeros.simple_queue.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleCreate(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueCreateInput,
  ): Promise<string> {
    const existing = await client.findSimpleQueue({ name: command.queueName });
    // TEMPORAL: diagnóstico incondicional de la comparación de idempotencia — remover una vez identificada la causa del conflicto.
    logger.warn(
      {
        command,
        computed: {
          expectedMaxLimit: `${command.maxLimitUpload}/${command.maxLimitDownload}`,
          expectedTarget: command.target,
          maxLimitEqual: existing?.maxLimit === `${command.maxLimitUpload}/${command.maxLimitDownload}`,
          targetEqual: existing?.target === command.target,
        },
        existing,
      },
      'routeros_simple_queue_idempotency_check',
    );
    if (existing) {
      if (
        simpleQueueMaxLimitsEqual(existing.maxLimit, command.maxLimitUpload, command.maxLimitDownload) &&
        normalizeSimpleQueueTarget(existing.target) === normalizeSimpleQueueTarget(command.target)
      ) {
        return command.queueName; // Idempotent success
      }
      logSimpleQueueConflict(
        {
          comment: command.comment ?? '',
          disabled: command.disabled ?? false,
          maxLimit: `${command.maxLimitUpload}/${command.maxLimitDownload}`,
          name: command.queueName,
          target: command.target,
        },
        {
          comment: existing.comment ?? '',
          disabled: existing.disabled,
          maxLimit: existing.maxLimit,
          name: existing.name,
          target: existing.target,
        },
      );
      throw new RouterOsSimpleQueueConflictError(
        'Conflicto: ya existe una cola con diferente configuracion.',
      );
    }
    const createData: RouterOsSimpleQueueCreateData = {
      ...(command.comment !== undefined ? { comment: command.comment } : {}),
      ...(command.disabled !== undefined ? { disabled: command.disabled } : {}),
      maxLimit: `${command.maxLimitUpload}/${command.maxLimitDownload}`,
      name: command.queueName,
      target: command.target,
    };
    await client.createSimpleQueue(createData);
    return command.queueName;
  }

  private async handleUpdate(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueUpdateInput,
  ): Promise<string> {
    let maxLimit: string | undefined;
    if (command.maxLimitUpload !== undefined && command.maxLimitDownload !== undefined) {
      maxLimit = `${command.maxLimitUpload}/${command.maxLimitDownload}`;
    }

    const updateData: RouterOsSimpleQueueUpdateData = {
      ...(command.comment !== undefined ? { comment: command.comment } : {}),
      ...(maxLimit !== undefined ? { maxLimit } : {}),
      ...(command.queueName !== undefined ? { name: command.queueName } : {}),
      ...(command.target !== undefined ? { target: command.target } : {}),
    };

    await client.updateSimpleQueue(
      { id: command.queueReference, name: command.queueReference },
      updateData,
    );
    return command.queueReference;
  }

  private async handleEnable(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueEnableInput,
  ): Promise<string> {
    await client.enableSimpleQueue({ id: command.queueReference, name: command.queueReference });
    return command.queueReference;
  }

  private async handleDisable(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueDisableInput,
  ): Promise<string> {
    await client.disableSimpleQueue({ id: command.queueReference, name: command.queueReference });
    return command.queueReference;
  }

  private async handleRemove(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueRemoveInput,
  ): Promise<string> {
    await client.removeSimpleQueue({ id: command.queueReference, name: command.queueReference });
    return command.queueReference;
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsSimpleQueueConflictError) {
      return {
        errorCode: 'ROUTEROS_SIMPLE_QUEUE_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
