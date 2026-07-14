import { createHash } from 'node:crypto';

export interface SimpleQueueAssemblyInput {
  downloadKbps: number;
  resourceId: string;
  serviceId: string;
  target: string;
  uploadKbps: number;
}

export interface SimpleQueueAssembly {
  comment: string;
  desiredHash: string;
  maxLimit: string;
  name: string;
  target: string;
}

export class SimpleQueueAssembler {
  public assemble(input: SimpleQueueAssemblyInput): SimpleQueueAssembly {
    this.assertBandwidth(input.uploadKbps, 'uploadKbps');
    this.assertBandwidth(input.downloadKbps, 'downloadKbps');
    if (input.target.trim() === '') throw new Error('El target de Simple Queue es requerido.');

    const assembly = {
      comment: `cuzonet:resource:${input.resourceId}`,
      maxLimit: `${input.uploadKbps}k/${input.downloadKbps}k`,
      name: `cuzonet-${input.serviceId.slice(0, 8)}-${input.resourceId.slice(0, 8)}`,
      target: input.target.trim(),
    };
    return {
      ...assembly,
      desiredHash: createHash('sha256').update(JSON.stringify(assembly)).digest('hex'),
    };
  }

  private assertBandwidth(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${field} debe ser un entero mayor que cero.`);
    }
  }
}
