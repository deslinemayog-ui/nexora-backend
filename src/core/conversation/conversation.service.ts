import {
  AgentType,
  Conversation,
  DeliveryStatus,
  Message,
  MessageDirection,
  MessageType,
} from '../../database/types';
import { NexoraRepository } from '../../database/repository';
import { OpenClawService } from '../../openclaw/openclaw.service';

export class ConversationService {
  constructor(
    private readonly repository: NexoraRepository,
    private readonly openclawService: OpenClawService,
  ) {}

  public async getOrCreateActiveConversation(customerId: string): Promise<Conversation> {
    return this.repository.findOrCreateActiveConversation(customerId, (convId) =>
      this.openclawService.createConversationSessionKey(customerId, convId),
    );
  }

  public async isDuplicateMessage(externalMessageId: string): Promise<boolean> {
    return this.repository.hasProcessedExternalMessage(externalMessageId);
  }

  public async recordInboundMessage(params: {
    customerId: string;
    conversationId: string;
    externalMessageId: string;
    messageType: MessageType;
    content: string;
    mediaDocumentId?: string;
    detectedIntent?: string;
    routedAgentType?: AgentType;
    projectId?: string;
  }): Promise<Message> {
    return this.repository.createMessage({
      customerId: params.customerId,
      conversationId: params.conversationId,
      externalMessageId: params.externalMessageId,
      direction: MessageDirection.INBOUND,
      messageType: params.messageType,
      content: params.content,
      mediaDocumentId: params.mediaDocumentId,
      deliveryStatus: DeliveryStatus.RECEIVED,
      detectedIntent: params.detectedIntent,
      routedAgentType: params.routedAgentType,
      projectId: params.projectId,
    });
  }

  public async recordOutboundMessage(params: {
    customerId: string;
    conversationId: string;
    externalMessageId?: string;
    messageType?: MessageType;
    content: string;
    routedAgentType?: AgentType;
    projectId?: string;
  }): Promise<Message> {
    return this.repository.createMessage({
      customerId: params.customerId,
      conversationId: params.conversationId,
      externalMessageId: params.externalMessageId,
      direction: MessageDirection.OUTBOUND,
      messageType: params.messageType ?? MessageType.TEXT,
      content: params.content,
      deliveryStatus: DeliveryStatus.SENT,
      routedAgentType: params.routedAgentType,
      projectId: params.projectId,
    });
  }

  public async getRecentContext(
    customerId: string,
    conversationId: string,
    maxTurns = 12,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const messages = await this.repository.listConversationMessages(
      customerId,
      conversationId,
      maxTurns,
    );
    return messages.map((m) => ({
      role: m.direction === MessageDirection.INBOUND ? 'user' : 'assistant',
      content: m.content,
    }));
  }

  public async bindActiveProject(
    customerId: string,
    conversationId: string,
    projectId: string | null,
  ): Promise<Conversation> {
    return this.repository.setConversationActiveProject(customerId, conversationId, projectId);
  }
}
