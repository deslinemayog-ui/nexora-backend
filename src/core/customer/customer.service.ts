import { AccountStatus, Customer, CustomerProfile } from '@prisma/client';
import { normalizeWhatsAppNumber, toWhatsAppJid } from '../../channels/whatsapp/whatsapp.events';
import { NexoraRepository } from '../../database/repository';
import { ForbiddenError } from '../../utils/errors';

export class CustomerService {
  constructor(private readonly repository: NexoraRepository) {}

  /**
   * Resolves or creates a tenant customer record from an incoming WhatsApp number/JID.
   * Enforces account status checks (e.g., blocks suspended accounts).
   */
  public async resolveCustomerFromWhatsApp(params: {
    senderNumberOrJid: string;
    displayName?: string;
  }): Promise<{ customer: Customer; profile: CustomerProfile; isNew: boolean }> {
    const whatsappNumber = normalizeWhatsAppNumber(params.senderNumberOrJid);
    const whatsappJid = toWhatsAppJid(params.senderNumberOrJid);

    const resolved = await this.repository.findOrCreateCustomerByWhatsApp({
      whatsappNumber,
      whatsappJid,
      displayName: params.displayName,
    });

    if (
      resolved.customer.accountStatus === AccountStatus.SUSPENDED ||
      resolved.customer.accountStatus === AccountStatus.DEACTIVATED
    ) {
      throw new ForbiddenError(
        `Customer account (${resolved.customer.id}) is currently ${resolved.customer.accountStatus}`,
      );
    }

    return resolved;
  }

  public async getCustomer(customerId: string): Promise<Customer> {
    return this.repository.getCustomerById(customerId);
  }

  public async listCustomers(): Promise<Customer[]> {
    return this.repository.listCustomers();
  }

  public async getProfileForTenant(
    requestingCustomerId: string,
    targetCustomerId: string = requestingCustomerId,
  ): Promise<CustomerProfile> {
    return this.repository.getCustomerProfile(requestingCustomerId, targetCustomerId);
  }

  public async updateProfileFromExtractedData(
    customerId: string,
    extracted: {
      fullName?: string;
      email?: string;
      countryOfResidence?: string;
      nationality?: string;
      targetCountries?: string[];
      currentOccupation?: string;
      yearsOfExperience?: number;
      skills?: string[];
      educationSummary?: Record<string, unknown>;
      workExperience?: Record<string, unknown>;
    },
  ): Promise<CustomerProfile> {
    const existing = await this.repository.getCustomerProfile(customerId, customerId);
    const mergedSkills = Array.from(
      new Set([...(existing.skills ?? []), ...(extracted.skills ?? [])]),
    );
    const mergedTargetCountries = Array.from(
      new Set([...(existing.targetCountries ?? []), ...(extracted.targetCountries ?? [])]),
    );

    return this.repository.updateCustomerProfile(customerId, {
      ...(extracted.fullName ? { fullName: extracted.fullName } : {}),
      ...(extracted.email ? { email: extracted.email } : {}),
      ...(extracted.countryOfResidence
        ? { countryOfResidence: extracted.countryOfResidence }
        : {}),
      ...(extracted.nationality ? { nationality: extracted.nationality } : {}),
      ...(mergedTargetCountries.length > 0 ? { targetCountries: mergedTargetCountries } : {}),
      ...(extracted.currentOccupation
        ? { currentOccupation: extracted.currentOccupation }
        : {}),
      ...(extracted.yearsOfExperience !== undefined
        ? { yearsOfExperience: extracted.yearsOfExperience }
        : {}),
      ...(mergedSkills.length > 0 ? { skills: mergedSkills } : {}),
      ...(extracted.educationSummary
        ? { educationSummary: extracted.educationSummary as never }
        : {}),
      ...(extracted.workExperience
        ? { workExperience: extracted.workExperience as never }
        : {}),
    });
  }
}
