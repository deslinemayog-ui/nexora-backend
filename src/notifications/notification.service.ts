import { Notification, NotificationStatus } from '../database/types';
import { WhatsAppService } from '../channels/whatsapp/whatsapp.service';
import { NexoraRepository } from '../database/repository';
import { logger } from '../utils/logger';

/**
 * Customer Progress Notification Service.
 * Ensures meaningful progress updates are delivered over WhatsApp while preventing
 * notification fatigue via per-customer cooldown throttling.
 */
export class NotificationService {
  private readonly lastNotificationByCustomer = new Map<string, number>();
  private readonly minCooldownMs: number;

  constructor(
    private readonly repository: NexoraRepository,
    private readonly whatsappService: WhatsAppService,
    minCooldownMs = 1500,
  ) {
    this.minCooldownMs = minCooldownMs;
  }

  public async notifyCustomerProgress(params: {
    customerId: string;
    recipientJid: string;
    projectId?: string;
    title: string;
    message: string;
    bypassThrottle?: boolean;
  }): Promise<Notification> {
    const now = Date.now();
    const lastSent = this.lastNotificationByCustomer.get(params.customerId) ?? 0;

    if (!params.bypassThrottle && now - lastSent < this.minCooldownMs) {
      return this.repository.createNotification({
        customerId: params.customerId,
        projectId: params.projectId,
        title: params.title,
        message: params.message,
        status: NotificationStatus.SUPPRESSED,
      });
    }

    try {
      await this.whatsappService.sendText(params.recipientJid, params.message);
      this.lastNotificationByCustomer.set(params.customerId, now);

      return this.repository.createNotification({
        customerId: params.customerId,
        projectId: params.projectId,
        title: params.title,
        message: params.message,
        status: NotificationStatus.SENT,
      });
    } catch (err) {
      logger.warn(
        { err, customerId: params.customerId },
        'Failed to deliver WhatsApp progress notification; stored as PENDING',
      );
      return this.repository.createNotification({
        customerId: params.customerId,
        projectId: params.projectId,
        title: params.title,
        message: params.message,
        status: NotificationStatus.PENDING,
      });
    }
  }
}
