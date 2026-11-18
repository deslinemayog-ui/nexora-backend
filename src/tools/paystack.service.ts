import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface CreditPackage {
  id: string;
  name: string;
  creditCents: number;
  creditDollars: string;
  submissionsEstimate: string;
  popular?: boolean;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'pack_5',
    name: 'Starter Top-Up',
    creditCents: 500,
    creditDollars: '5.00',
    submissionsEstimate: 'Up to 5 submissions',
  },
  {
    id: 'pack_10',
    name: 'Growth Top-Up',
    creditCents: 1000,
    creditDollars: '10.00',
    submissionsEstimate: 'Up to 10 submissions',
    popular: true,
  },
  {
    id: 'pack_25',
    name: 'Pro Campaign',
    creditCents: 2500,
    creditDollars: '25.00',
    submissionsEstimate: 'Up to 25 submissions',
  },
  {
    id: 'pack_50',
    name: 'Scale Pack',
    creditCents: 5000,
    creditDollars: '50.00',
    submissionsEstimate: 'Up to 50 submissions',
  },
];

export class PaystackService {
  private get secretKey(): string {
    return (process.env.PAYSTACK_SECRET_KEY || '').trim();
  }

  public isConfigured(): boolean {
    return this.secretKey.length > 0;
  }

  public getPackages(): CreditPackage[] {
    return CREDIT_PACKAGES;
  }

  /**
   * Computes the Paystack smallest-unit amount (kobo/cents) in PAYSTACK_CURRENCY (default ZAR).
   */
  public computePaystackChargeAmount(creditCents: number): {
    currency: string;
    amountSubunits: number;
  } {
    const currency = (process.env.PAYSTACK_CURRENCY || 'ZAR').toUpperCase();
    if (currency === 'USD') {
      return { currency: 'USD', amountSubunits: creditCents };
    }
    const rate = Number(process.env.PAYSTACK_USD_TO_ZAR_RATE || 18);
    return {
      currency,
      amountSubunits: Math.round(creditCents * rate),
    };
  }

  /**
   * Initializes a real Paystack checkout transaction.
   */
  public async initializeTransaction(params: {
    customerId: string;
    email: string;
    packageId: string;
    callbackUrl?: string;
  }): Promise<{
    authorizationUrl: string;
    accessCode: string;
    reference: string;
    currency: string;
    amountSubunits: number;
    creditCents: number;
  }> {
    if (!this.secretKey) {
      throw new Error(
        'PAYSTACK_SECRET_KEY is not configured in .env. Add your Paystack secret key (sk_test_... or sk_live_...) to enable checkout.',
      );
    }

    const pkg = CREDIT_PACKAGES.find((p) => p.id === params.packageId);
    if (!pkg) {
      throw new Error(`Invalid credit package: ${params.packageId}`);
    }

    const { currency, amountSubunits } = this.computePaystackChargeAmount(pkg.creditCents);
    const reference = `NEXORA-${params.customerId.slice(0, 8).toUpperCase()}-${Date.now()}`;

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        amount: amountSubunits,
        currency,
        reference,
        callback_url: params.callbackUrl,
        metadata: {
          customerId: params.customerId,
          packageId: pkg.id,
          creditCents: pkg.creditCents,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });

    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!res.ok || !json.status || !json.data?.authorization_url) {
      logger.warn({ status: res.status, message: json.message }, 'Paystack initialize failed');
      throw new Error(json.message || `Paystack initialization failed (HTTP ${res.status})`);
    }

    return {
      authorizationUrl: json.data.authorization_url,
      accessCode: json.data.access_code,
      reference: json.data.reference,
      currency,
      amountSubunits,
      creditCents: pkg.creditCents,
    };
  }

  /**
   * Verifies a Paystack transaction reference directly with Paystack API.
   */
  public async verifyTransaction(reference: string): Promise<{
    paid: boolean;
    status: string;
    reference: string;
    customerId?: string;
    creditCents: number;
  }> {
    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is not configured in .env.');
    }

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
        signal: AbortSignal.timeout(8000),
      },
    );

    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        status: string;
        reference: string;
        metadata?: { customerId?: string; creditCents?: number; packageId?: string };
      };
    };

    if (!res.ok || !json.status || !json.data) {
      throw new Error(json.message || `Paystack verification failed (HTTP ${res.status})`);
    }

    const paid = json.data.status === 'success';
    const meta = json.data.metadata;
    const pkg = meta?.packageId ? CREDIT_PACKAGES.find((p) => p.id === meta.packageId) : undefined;
    const creditCents = Number(meta?.creditCents ?? pkg?.creditCents ?? 0);

    return {
      paid,
      status: json.data.status,
      reference: json.data.reference,
      customerId: meta?.customerId,
      creditCents,
    };
  }

  /**
   * Validates Paystack webhook x-paystack-signature using HMAC-SHA512.
   */
  public verifyWebhookSignature(rawBody: string, signatureHeader?: string): boolean {
    if (!this.secretKey || !signatureHeader) return false;
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    return hash === signatureHeader;
  }
}

export const paystackService = new PaystackService();
