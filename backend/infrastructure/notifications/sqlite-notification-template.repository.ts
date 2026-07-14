
import type { Database } from 'better-sqlite3';
import type { NotificationTemplateRepository } from '../../application/ports/notifications/repositories.js';
import { NotificationTemplate, type NotificationTemplateVersionProps } from '../../domain/notifications/notification-template.js';
import type { NotificationChannel } from '../../domain/notifications/types.js';

export class SqliteNotificationTemplateRepository implements NotificationTemplateRepository {
  constructor(private readonly db: Database) {}

  public async findByCode(companyId: string, code: string): Promise<NotificationTemplate | null> {
    const row = this.db.prepare('SELECT * FROM notification_templates WHERE company_id = ? AND code = ?').get(companyId, code) as Record<string, unknown>;
    if (!row) return null;

    const vRows = this.db.prepare('SELECT * FROM notification_template_versions WHERE template_id = ?').all(row.id as string) as Record<string, unknown>[];
    const versions: NotificationTemplateVersionProps[] = vRows.map(v => ({
      id: v.id as string,
      version: v.version as number,
      bodyTemplate: v.body_template as string,
      ...(v.subject_template ? { subjectTemplate: v.subject_template as string } : {}),
      isPublished: v.is_published === 1,
      ...(v.published_at ? { publishedAt: new Date(v.published_at as string) } : {}),
      createdAt: new Date(v.created_at as string)
    }));

    return NotificationTemplate.reconstitute({
      id: row.id as string,
      companyId: row.company_id as string,
      code: row.code as string,
      name: row.name as string,
      defaultChannel: row.default_channel as NotificationChannel,
      versions
    });
  }

  public async save(template: NotificationTemplate): Promise<void> {
    const t = template.props;
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO notification_templates (id, company_id, code, name, default_channel)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          default_channel = excluded.default_channel
      `).run(t.id, t.companyId, t.code, t.name, t.defaultChannel);

      const stmt = this.db.prepare(`
        INSERT INTO notification_template_versions (id, template_id, version, body_template, subject_template, is_published, published_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          is_published = excluded.is_published,
          published_at = excluded.published_at
      `);

      for (const v of t.versions) {
        stmt.run(
          v.id, t.id, v.version, v.bodyTemplate, v.subjectTemplate || null,
          v.isPublished ? 1 : 0,
          v.publishedAt ? v.publishedAt.toISOString() : null,
          v.createdAt.toISOString()
        );
      }
    })();
  }
}
