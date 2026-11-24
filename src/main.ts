import { ApprovalService } from './approvals/approval.service';
import { buildApiServer } from './api/server';
import { WhatsAppService } from './channels/whatsapp/whatsapp.service';
import { IWhatsAppProvider } from './channels/whatsapp/whatsapp.types';
import { env } from './config/env';
import { ConversationService } from './core/conversation/conversation.service';
import { CustomerService } from './core/customer/customer.service';
import { OrchestratorService } from './core/orchestrator/orchestrator.service';
import { NexoraRepository } from './database/repository';
import { DocumentService } from './documents/document.service';
import { MemoryService } from './memory/memory.service';
import { NotificationService } from './notifications/notification.service';
import { OpenClawService, CustomTurnExecutor } from './openclaw/openclaw.service';
import { ProjectService } from './projects/project.service';
import { QueueService } from './queues/queue.service';
import { redisManager } from './queues/redis.connection';
import { TaskService } from './tasks/task.service';
import { logger } from './utils/logger';

export interface CreateNexoraApplicationOptions {
  useInMemoryStores?: boolean;
  whatsappProvider?: IWhatsAppProvider;
  openclawExecutor?: CustomTurnExecutor;
  storageDir?: string;
}

export async function createNexoraApplication(options: CreateNexoraApplicationOptions = {}) {
  const useInMemory = options.useInMemoryStores ?? env.NODE_ENV === 'test';

  const repository = new NexoraRepository({
    useInMemory: true,
  });

  const whatsappService = new WhatsAppService(options.whatsappProvider);
  const openclawService = new OpenClawService(undefined, options.openclawExecutor);
  const queueService = new QueueService({ useInMemoryDriver: useInMemory });

  const customerService = new CustomerService(repository);
  const conversationService = new ConversationService(repository, openclawService);
  const memoryService = new MemoryService(repository);
  const projectService = new ProjectService(repository);
  const taskService = new TaskService(repository, queueService);
  const documentService = new DocumentService(repository, {
    storageDir: options.storageDir,
    useInMemoryBlobs: useInMemory,
  });
  const approvalService = new ApprovalService(repository);
  const notificationService = new NotificationService(repository, whatsappService);

  const orchestratorService = new OrchestratorService(
    repository,
    whatsappService,
    openclawService,
    customerService,
    conversationService,
    memoryService,
    projectService,
    taskService,
    documentService,
    approvalService,
    notificationService,
    queueService,
  );

  orchestratorService.bindToWhatsAppGateway();

  const apiServer = await buildApiServer({
    repository,
    whatsappService,
    openclawService,
    customerService,
    conversationService,
    projectService,
    taskService,
    approvalService,
    documentService,
    queueService,
    orchestratorService,
  });

  return {
    apiServer,
    repository,
    whatsappService,
    openclawService,
    customerService,
    conversationService,
    memoryService,
    projectService,
    taskService,
    documentService,
    approvalService,
    notificationService,
    queueService,
    orchestratorService,
    async start() {
      if (!useInMemory) {
        const redisAvailable = await redisManager.healthCheck();
        if (redisAvailable) {
          queueService.startBullWorkers();
          logger.info('Connected to Redis and started BullMQ background workers');
        } else {
          if (env.NODE_ENV === 'production') {
            throw new Error('Redis connection required in production mode');
          }
          logger.warn(
            'Redis is not running locally on port 6379; falling back to in-process resilient queue worker for local development.',
          );
          queueService.setInMemoryMode(true);
          await redisManager.close();
        }
      }
      await whatsappService.start();
      await apiServer.listen({ host: env.HOST, port: env.PORT });
      logger.info(
        {
          host: env.HOST,
          port: env.PORT,
          openclawGateway: env.OPENCLAW_GATEWAY_WS_URL,
          whatsappProvider: whatsappService.getProviderName(),
        },
        'Nexora AI Multi-Tenant WhatsApp Workforce Platform started successfully',
      );
    },
    async stop() {
      logger.info('Initiating graceful shutdown of Nexora AI...');
      await whatsappService.stop();
      await openclawService.getClient().disconnect();
      await queueService.close();
      await redisManager.close();
      await apiServer.close();
      logger.info('Nexora AI shutdown complete.');
    },
  };
}

if (require.main === module) {
  createNexoraApplication()
    .then(async (app) => {
      const handleSignal = async (signal: string) => {
        logger.info({ signal }, 'Received OS termination signal');
        await app.stop();
        process.exit(0);
      };

      process.on('SIGINT', () => void handleSignal('SIGINT'));
      process.on('SIGTERM', () => void handleSignal('SIGTERM'));

      await app.start();
    })
    .catch((err) => {
      logger.fatal({ err }, 'Fatal error during Nexora AI startup');
      process.exit(1);
    });
}
