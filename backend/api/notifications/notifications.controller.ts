
import type { CreateNotificationUseCase } from '../../application/use-cases/notifications/create-notification.usecase.js';
import type { CreateNotificationRequest } from '../../application/dto/notifications/notification.dto.js';

export interface HttpRequest {
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface HttpResponse {
  status: (code: number) => this;
  json: (data: unknown) => void;
}

export class NotificationsController {
  constructor(
    private readonly createNotificationUseCase: CreateNotificationUseCase
  ) {}

  public async createNotification(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const payload = req.body as unknown as CreateNotificationRequest;
      const result = await this.createNotificationUseCase.execute(payload);
      res.status(202).json(result);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }
}
