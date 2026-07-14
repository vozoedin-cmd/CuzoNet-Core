import { InvalidPlanDataError } from '../errors/invalid-plan-data.error.js';

export interface BandwidthProfilePrimitives {
  burstDownloadKbps?: number | undefined;
  burstUploadKbps?: number | undefined;
  downloadKbps: number;
  priority?: number | undefined;
  uploadKbps: number;
}

export class BandwidthProfile {
  private constructor(private readonly props: BandwidthProfilePrimitives) {}

  public static create(props: BandwidthProfilePrimitives): BandwidthProfile {
    BandwidthProfile.assertPositiveInteger(props.uploadKbps, 'uploadKbps');
    BandwidthProfile.assertPositiveInteger(props.downloadKbps, 'downloadKbps');
    if (props.burstUploadKbps !== undefined) {
      BandwidthProfile.assertPositiveInteger(props.burstUploadKbps, 'burstUploadKbps');
    }
    if (props.burstDownloadKbps !== undefined) {
      BandwidthProfile.assertPositiveInteger(props.burstDownloadKbps, 'burstDownloadKbps');
    }
    if (props.priority !== undefined) {
      BandwidthProfile.assertPositiveInteger(props.priority, 'priority');
    }
    return new BandwidthProfile({ ...props });
  }

  private static assertPositiveInteger(value: number, path: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new InvalidPlanDataError(path, 'Debe ser un entero positivo.');
    }
  }

  public toPrimitives(): BandwidthProfilePrimitives {
    return { ...this.props };
  }

  public get uploadKbps(): number {
    return this.props.uploadKbps;
  }

  public get downloadKbps(): number {
    return this.props.downloadKbps;
  }

  public get burstUploadKbps(): number | undefined {
    return this.props.burstUploadKbps;
  }

  public get burstDownloadKbps(): number | undefined {
    return this.props.burstDownloadKbps;
  }

  public get priority(): number | undefined {
    return this.props.priority;
  }
}
