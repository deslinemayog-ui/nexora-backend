import { CustomerMemory } from '../database/types';
import { NexoraRepository } from '../database/repository';
import { scrubSensitiveText } from '../utils/logger';

/**
 * Tenant-isolated Customer Memory Service.
 * Extracts and stores durable facts, goals, and preferences per customer
 * while scrubbing sensitive identity numbers before storage.
 */
export class MemoryService {
  constructor(private readonly repository: NexoraRepository) {}

  public async rememberFact(params: {
    customerId: string;
    category: 'GOAL' | 'QUALIFICATION' | 'PREFERENCE' | 'LOCATION' | 'BUSINESS';
    key: string;
    value: string;
    confidence?: number;
    sourceMessageId?: string;
  }): Promise<CustomerMemory> {
    return this.repository.upsertMemory({
      customerId: params.customerId,
      category: params.category,
      key: params.key,
      value: scrubSensitiveText(params.value),
      confidence: params.confidence ?? 1.0,
      sourceMessageId: params.sourceMessageId,
    });
  }

  public async getCustomerMemories(
    requestingCustomerId: string,
    targetCustomerId: string = requestingCustomerId,
    category?: string,
  ): Promise<CustomerMemory[]> {
    return this.repository.listMemoriesForTenant(
      requestingCustomerId,
      targetCustomerId,
      category,
    );
  }

  public async extractAndStoreImplicitFacts(
    customerId: string,
    messageText: string,
    sourceMessageId?: string,
  ): Promise<void> {
    const text = messageText.trim();

    const countryMatch = text.match(
      /\b(?:in|to|into)\s+(the\s+UK|United\s+Kingdom|Canada|Germany|America|USA|United\s+States|South\s+Africa|Australia|Ireland|Netherlands|UAE|Dubai)\b/i,
    );
    if (countryMatch?.[1]) {
      await this.rememberFact({
        customerId,
        category: 'LOCATION',
        key: 'target_country',
        value: countryMatch[1].replace(/^the\s+/i, '').trim(),
        sourceMessageId,
      });
    }

    const expMatch = text.match(/\b(\d{1,2})\+?\s*years?\s+(?:of\s+)?experience\b/i);
    if (expMatch?.[1]) {
      await this.rememberFact({
        customerId,
        category: 'QUALIFICATION',
        key: 'years_of_experience',
        value: expMatch[1],
        sourceMessageId,
      });
    }

    const roleMatch = text.match(
      /\bI\s+am\s+a(?:n)?\s+([a-zA-Z\s]{3,35}?)(?:\.|,|with|looking|seeking|$)/i,
    );
    if (roleMatch?.[1]) {
      await this.rememberFact({
        customerId,
        category: 'QUALIFICATION',
        key: 'profession',
        value: roleMatch[1].trim(),
        sourceMessageId,
      });
    }
  }

  public async buildMemoryContextPrompt(customerId: string): Promise<string> {
    const memories = await this.getCustomerMemories(customerId, customerId);
    if (memories.length === 0) {
      return 'No prior stored customer memories.';
    }
    return memories
      .map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
      .join('\n');
  }
}
