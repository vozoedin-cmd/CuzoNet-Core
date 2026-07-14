
import type { NotificationChannel } from './types.js';

export interface NotificationTemplateVersionProps {
  id: string;
  version: number;
  bodyTemplate: string;
  subjectTemplate?: string | undefined;
  isPublished: boolean;
  publishedAt?: Date | undefined;
  createdAt: Date;
}

export interface NotificationTemplateProps {
  id: string;
  companyId: string;
  code: string;
  name: string;
  defaultChannel: NotificationChannel;
  versions: NotificationTemplateVersionProps[];
}

export class NotificationTemplate {
  private constructor(public readonly props: NotificationTemplateProps) {}

  public static create(props: Omit<NotificationTemplateProps, 'versions'> & { id: string }): NotificationTemplate {
    if (!props.code || props.code.trim() === '') throw new Error('Template code is required');
    return new NotificationTemplate({ ...props, versions: [] });
  }

  public static reconstitute(props: NotificationTemplateProps): NotificationTemplate {
    return new NotificationTemplate(props);
  }

  public addDraftVersion(id: string, body: string, subject?: string): void {
    const nextVersion = this.props.versions.length > 0 
      ? Math.max(...this.props.versions.map(v => v.version)) + 1 
      : 1;

    this.props.versions.push({
      id,
      version: nextVersion,
      bodyTemplate: body,
      subjectTemplate: subject,
      isPublished: false,
      createdAt: new Date()
    });
  }

  public publishVersion(versionId: string): void {
    const v = this.props.versions.find(v => v.id === versionId);
    if (!v) throw new Error('Version not found');
    if (v.isPublished) throw new Error('Version already published');
    
    v.isPublished = true;
    v.publishedAt = new Date();
  }

  public getPublishedVersion(): NotificationTemplateVersionProps | undefined {
    // Return the one with highest version that is published
    const published = this.props.versions.filter(v => v.isPublished);
    if (published.length === 0) return undefined;
    return published.reduce((prev, current) => (prev.version > current.version) ? prev : current);
  }
}
