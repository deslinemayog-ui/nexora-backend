import { logger } from '../utils/logger';
import {
  extractBingResults,
  extractEmailFromText,
  fetchHtmlQuick,
  getBingMarketParams,
  isValidCompanyEmail,
  stripHtml,
} from './job-search-api.service';

export interface InvestorTarget {
  name: string;
  category: string;
  portalUrl: string;
  applicationUrl: string;
  contactEmail: string;
  focusSummary: string;
  checkSizeOrBenefit: string;
  liveReachable: boolean;
}

const CURATED_INVESTORS: Array<{
  name: string;
  stages: string[];
  sectors: string[];
  regions: string[];
  portalUrl: string;
  applicationUrl: string;
  contactEmail: string;
  focusSummary: string;
  checkSize: string;
}> = [
  {
    name: 'Y Combinator',
    stages: ['pre-seed', 'seed', 'idea', 'mvp'],
    sectors: ['ai', 'saas', 'fintech', 'software', 'b2b', 'global'],
    regions: ['usa', 'global', 'africa', 'europe', 'canada'],
    portalUrl: 'https://www.ycombinator.com',
    applicationUrl: 'https://www.ycombinator.com/apply',
    contactEmail: 'apply@ycombinator.com',
    focusSummary: 'Standard $500k deal for early-stage software, AI, and global startups',
    checkSize: '$500,000 Standard Deal',
  },
  {
    name: 'Techstars',
    stages: ['pre-seed', 'seed', 'mvp'],
    sectors: ['ai', 'fintech', 'saas', 'climate', 'health', 'global'],
    regions: ['usa', 'uk', 'europe', 'canada', 'global'],
    portalUrl: 'https://www.techstars.com',
    applicationUrl: 'https://www.techstars.com/accelerators',
    contactEmail: 'applications@techstars.com',
    focusSummary: 'Worldwide 3-month mentorship-driven accelerator investing $120k+ plus cloud credits',
    checkSize: '$120,000+ Accelerator Investment',
  },
  {
    name: 'Antler Global',
    stages: ['pre-seed', 'idea', 'mvp', 'seed'],
    sectors: ['ai', 'saas', 'fintech', 'marketplace', 'global'],
    regions: ['uk', 'europe', 'usa', 'canada', 'africa', 'global'],
    portalUrl: 'https://www.antler.co',
    applicationUrl: 'https://www.antler.co/apply',
    contactEmail: 'pitch@antler.co',
    focusSummary: 'Day-zero global VC backing pre-seed founders across 25+ cities worldwide',
    checkSize: '$100k–$250k Pre-Seed',
  },
  {
    name: '500 Global',
    stages: ['pre-seed', 'seed', 'series a'],
    sectors: ['fintech', 'saas', 'ai', 'commerce', 'global'],
    regions: ['usa', 'africa', 'middle east', 'europe', 'global'],
    portalUrl: 'https://500.co',
    applicationUrl: 'https://500.co/accelerators',
    contactEmail: 'seed@500.co',
    focusSummary: 'Global venture capital firm with $150k accelerator checks and Seed follow-on',
    checkSize: '$150,000 Seed Check',
  },
  {
    name: 'Founders Factory Africa',
    stages: ['pre-seed', 'seed'],
    sectors: ['fintech', 'healthtech', 'agritech', 'ai', 'logistics', 'saas'],
    regions: ['south africa', 'africa', 'kenya', 'nigeria', 'global'],
    portalUrl: 'https://www.foundersfactory.africa',
    applicationUrl: 'https://www.foundersfactory.africa/apply',
    contactEmail: 'ventures@foundersfactory.africa',
    focusSummary: 'Non-dilutive & equity venture studio investing across South Africa and the African continent',
    checkSize: '$100k–$250k + Venture Support',
  },
  {
    name: 'Norrsken Foundation / Norrsken22',
    stages: ['seed', 'series a'],
    sectors: ['fintech', 'ai', 'climate', 'impact', 'saas'],
    regions: ['africa', 'south africa', 'europe', 'uk', 'global'],
    portalUrl: 'https://www.norrsken.org',
    applicationUrl: 'https://www.norrsken.org/accelerator',
    contactEmail: 'accelerator@norrsken.org',
    focusSummary: 'Tech-for-good accelerator & growth fund backing scalable African and European startups',
    checkSize: '$125k–$1M+',
  },
  {
    name: 'Seedcamp',
    stages: ['pre-seed', 'seed'],
    sectors: ['ai', 'saas', 'fintech', 'devtools', 'enterprise'],
    regions: ['uk', 'europe', 'global'],
    portalUrl: 'https://seedcamp.com',
    applicationUrl: 'https://seedcamp.com/apply/',
    contactEmail: 'pitch@seedcamp.com',
    focusSummary: 'Europe’s seed fund investing first checks into ambitious global software startups',
    checkSize: '€250k–€500k Pre-Seed / Seed',
  },
  {
    name: 'Plug and Play Tech Center',
    stages: ['seed', 'series a', 'growth'],
    sectors: ['fintech', 'insurtech', 'ai', 'supply chain', 'enterprise'],
    regions: ['usa', 'europe', 'south africa', 'global'],
    portalUrl: 'https://www.plugandplaytechcenter.com',
    applicationUrl: 'https://www.plugandplaytechcenter.com/startups/',
    contactEmail: 'startups@pnptc.com',
    focusSummary: 'Silicon Valley innovation platform & VC connecting startups with Fortune 500 pilots and capital',
    checkSize: '$50k–$500k + Corporate Pilots',
  },
];

export class InvestorDiscoveryService {
  /**
   * Matches and ranks active VCs, angel syndicates, and accelerators by stage, sector, and region.
   */
  public async discoverInvestors(params: {
    industry?: string;
    fundingStage?: string;
    targetCountry?: string;
    limit?: number;
  }): Promise<InvestorTarget[]> {
    const sectorLower = (params.industry || 'software ai').toLowerCase();
    const stageLower = (params.fundingStage || 'seed').toLowerCase();
    const countryLower = (params.targetCountry || '').toLowerCase();
    const limit = params.limit ?? 8;

    const scored = CURATED_INVESTORS.map((inv) => {
      let score = 10;
      if (inv.stages.some((st) => stageLower.includes(st))) score += 15;
      if (inv.sectors.some((sec) => sectorLower.includes(sec))) score += 15;
      if (countryLower && inv.regions.some((r) => countryLower.includes(r) || r.includes(countryLower))) {
        score += 12;
      }
      return { item: inv, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const liveTargets = await this.discoverLiveInvestors(
      params.industry || 'Software & AI',
      params.fundingStage || 'Seed',
      params.targetCountry,
    );

    const curatedTargets: InvestorTarget[] = scored.map(({ item }) => ({
      name: item.name,
      category: `VC / Accelerator (${params.fundingStage || 'Seed'})`,
      portalUrl: item.portalUrl,
      applicationUrl: item.applicationUrl,
      contactEmail: item.contactEmail,
      focusSummary: item.focusSummary,
      checkSizeOrBenefit: item.checkSize,
      liveReachable: true,
    }));

    const combined = [...liveTargets, ...curatedTargets].slice(0, limit);

    logger.info(
      {
        industry: params.industry,
        fundingStage: params.fundingStage,
        liveScraped: liveTargets.length,
        count: combined.length,
      },
      'Matched & scraped VC/investor targets for INVESTOR_AGENT',
    );

    return combined;
  }

  private async discoverLiveInvestors(
    industry: string,
    fundingStage: string,
    targetCountry?: string,
  ): Promise<InvestorTarget[]> {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return [];
    try {
      const mkt = getBingMarketParams(targetCountry);
      const q = `"${industry}" "${fundingStage}" venture capital OR angel investor ${targetCountry || ''} pitch OR contact email`;
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}${mkt}`;
      const searchPage = await fetchHtmlQuick(bingUrl, 4500);
      if (!searchPage) return [];

      const candidates = extractBingResults(searchPage.html).slice(0, 5);
      const settled = await Promise.allSettled(
        candidates.map(async (c): Promise<InvestorTarget | null> => {
          const page = await fetchHtmlQuick(c.url, 4000);
          if (!page) return null;
          const clean = stripHtml(page.html);
          let email = extractEmailFromText(page.html) || extractEmailFromText(clean);
          if (!email) {
            try {
              const origin = new URL(page.finalUrl).origin;
              const contactPage = await fetchHtmlQuick(`${origin}/contact`, 3000);
              if (contactPage) {
                email =
                  extractEmailFromText(contactPage.html) ||
                  extractEmailFromText(stripHtml(contactPage.html));
              }
            } catch {
              // ignore
            }
          }
          if (!isValidCompanyEmail(email)) return null;
          return {
            name: c.title.split(/[|\-–—]/)[0]?.trim().slice(0, 80) || 'Venture Investor',
            category: `Live VC / Investor (${fundingStage})`,
            portalUrl: page.finalUrl,
            applicationUrl: page.finalUrl,
            contactEmail: email,
            focusSummary: clean.slice(0, 220),
            checkSizeOrBenefit: 'Active Venture / Angel Investor',
            liveReachable: true,
          } satisfies InvestorTarget;
        }),
      );

      return settled
        .filter((r): r is PromiseFulfilledResult<InvestorTarget | null> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((v): v is InvestorTarget => Boolean(v));
    } catch {
      return [];
    }
  }
}

export const investorDiscoveryService = new InvestorDiscoveryService();
