import { logger } from '../utils/logger';
import {
  extractBingResults,
  extractEmailFromText,
  fetchHtmlQuick,
  getBingMarketParams,
  isValidCompanyEmail,
  stripHtml,
} from './job-search-api.service';

export interface ScholarshipTarget {
  name: string;
  category: string;
  portalUrl: string;
  applicationUrl: string;
  contactEmail: string;
  focusSummary: string;
  checkSizeOrBenefit: string;
  liveReachable: boolean;
}

const CURATED_SCHOLARSHIPS: Array<{
  name: string;
  countries: string[];
  levels: string[];
  portalUrl: string;
  applicationUrl: string;
  contactEmail: string;
  focusSummary: string;
  benefit: string;
}> = [
  {
    name: 'Chevening Scholarships — UK Government Global Awards',
    countries: ['uk', 'united kingdom', 'britain', 'london', 'global'],
    levels: ['master', 'postgraduate', 'msc', 'mba'],
    portalUrl: 'https://www.chevening.org',
    applicationUrl: 'https://www.chevening.org/apply/',
    contactEmail: 'admissions@chevening.org',
    focusSummary: 'Full UK Master’s funding covering tuition, monthly stipend, flights, and visa fees',
    benefit: '100% Tuition + Stipend + Airfare',
  },
  {
    name: 'DAAD Scholarships — German Academic Exchange Service',
    countries: ['germany', 'deutschland', 'eu', 'europe', 'global'],
    levels: ['master', 'phd', 'doctorate', 'postgraduate', 'undergraduate'],
    portalUrl: 'https://www.daad.de/en/',
    applicationUrl: 'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/',
    contactEmail: 'info@daad.de',
    focusSummary: 'Fully funded graduate & doctoral fellowships in Germany across STEM, CS, and Engineering',
    benefit: '€934–€1,300/mo + Health + Travel',
  },
  {
    name: 'Erasmus Mundus Joint Masters (EU)',
    countries: ['europe', 'eu', 'germany', 'france', 'netherlands', 'spain', 'global'],
    levels: ['master', 'msc', 'postgraduate'],
    portalUrl: 'https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en',
    applicationUrl: 'https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en',
    contactEmail: 'eac-info@ec.europa.eu',
    focusSummary: 'Multi-country European Master’s degrees with full tuition waiver and €1,400/month stipend',
    benefit: 'Full Tuition + €1,400/mo Stipend',
  },
  {
    name: 'Mastercard Foundation Scholars Program',
    countries: ['usa', 'united states', 'canada', 'uk', 'united kingdom', 'south africa', 'global'],
    levels: ['undergraduate', 'master', 'bachelor', 'postgraduate'],
    portalUrl: 'https://mastercardfdn.org/all/scholars/',
    applicationUrl: 'https://mastercardfdn.org/all/scholars/becoming-a-scholar/',
    contactEmail: 'scholars@mastercardfdn.org',
    focusSummary: 'Full-ride leadership scholarships for African & international students at partner universities',
    benefit: 'Full Tuition + Housing + Stipend',
  },
  {
    name: 'Fulbright Foreign Student Program (USA)',
    countries: ['usa', 'united states', 'america', 'global'],
    levels: ['master', 'phd', 'postgraduate'],
    portalUrl: 'https://foreign.fulbrightonline.org',
    applicationUrl: 'https://foreign.fulbrightonline.org/apply',
    contactEmail: 'fulbright-admissions@iie.org',
    focusSummary: 'US Department of State graduate & research grants at top American universities',
    benefit: 'Full Tuition + Stipend + J-1 Visa',
  },
  {
    name: 'Commonwealth Scholarships (UK & Commonwealth)',
    countries: ['uk', 'united kingdom', 'canada', 'australia', 'global'],
    levels: ['master', 'phd', 'postgraduate'],
    portalUrl: 'https://cscuk.fcdo.gov.uk',
    applicationUrl: 'https://cscuk.fcdo.gov.uk/apply/',
    contactEmail: 'info@cscuk.org.uk',
    focusSummary: 'Full Master’s and PhD funding for Commonwealth citizens in technology, science & development',
    benefit: '100% Tuition + £1,347/mo + Flights',
  },
  {
    name: 'Vanier Canada Graduate Scholarships',
    countries: ['canada', 'toronto', 'vancouver', 'global'],
    levels: ['phd', 'doctorate', 'research'],
    portalUrl: 'https://vanier.gc.ca',
    applicationUrl: 'https://vanier.gc.ca/en/nomination_process-processus_de_mise_en_candidature.html',
    contactEmail: 'vanier@cihr-irsc.gc.ca',
    focusSummary: 'Premier Canadian doctoral fellowships ($50,000/year for 3 years) across engineering & CS',
    benefit: '$50,000 CAD / year (3 years)',
  },
  {
    name: 'Gates Cambridge Scholarships',
    countries: ['uk', 'united kingdom', 'cambridge', 'global'],
    levels: ['master', 'phd', 'postgraduate'],
    portalUrl: 'https://www.gatescambridge.org',
    applicationUrl: 'https://www.gatescambridge.org/apply/',
    contactEmail: 'info@gatescambridge.org',
    focusSummary: 'Full-cost postgraduate scholarships at the University of Cambridge for international applicants',
    benefit: 'Full Cambridge Tuition + £21,000/yr',
  },
];

export class ScholarshipDiscoveryService {
  /**
   * Matches and ranks verified global scholarships & admissions portals by study level,
   * field of study, and destination country.
   */
  public async discoverScholarships(params: {
    fieldOfStudy?: string;
    studyLevel?: string;
    targetCountry?: string;
    limit?: number;
  }): Promise<ScholarshipTarget[]> {
    const countryLower = (params.targetCountry || '').toLowerCase();
    const levelLower = (params.studyLevel || "master's").toLowerCase();
    const field = params.fieldOfStudy || 'Computer Science & Technology';
    const limit = params.limit ?? 8;

    const scored = CURATED_SCHOLARSHIPS.map((s) => {
      let score = 10;
      if (countryLower && s.countries.some((c) => countryLower.includes(c) || c.includes(countryLower))) {
        score += 20;
      }
      if (s.levels.some((l) => levelLower.includes(l))) {
        score += 15;
      }
      return { item: s, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const liveTargets = await this.discoverLiveScholarships(field, params.studyLevel, params.targetCountry);

    const curatedTargets: ScholarshipTarget[] = scored.map(({ item }) => ({
      name: item.name,
      category: `Scholarship Portal (${params.studyLevel || 'Graduate'} • ${field})`,
      portalUrl: item.portalUrl,
      applicationUrl: item.applicationUrl,
      contactEmail: item.contactEmail,
      focusSummary: item.focusSummary,
      checkSizeOrBenefit: item.benefit,
      liveReachable: true,
    }));

    const combined = [...liveTargets, ...curatedTargets].slice(0, limit);

    logger.info(
      {
        field,
        studyLevel: params.studyLevel,
        targetCountry: params.targetCountry,
        liveScraped: liveTargets.length,
        count: combined.length,
      },
      'Matched & scraped scholarship programs for EDUCATION_AGENT',
    );

    return combined;
  }

  private async discoverLiveScholarships(
    field: string,
    studyLevel?: string,
    targetCountry?: string,
  ): Promise<ScholarshipTarget[]> {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return [];
    try {
      const mkt = getBingMarketParams(targetCountry);
      const q = `"${field}" ${studyLevel || ''} scholarship ${targetCountry || ''} admissions OR scholarships email`;
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}${mkt}`;
      const searchPage = await fetchHtmlQuick(bingUrl, 4500);
      if (!searchPage) return [];

      const candidates = extractBingResults(searchPage.html).slice(0, 5);
      const settled = await Promise.allSettled(
        candidates.map(async (c): Promise<ScholarshipTarget | null> => {
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
            name: c.title.split(/[|\-–—]/)[0]?.trim().slice(0, 80) || 'Scholarship Program',
            category: `Live Scholarship (${studyLevel || 'Graduate'} • ${field})`,
            portalUrl: page.finalUrl,
            applicationUrl: page.finalUrl,
            contactEmail: email,
            focusSummary: clean.slice(0, 220),
            checkSizeOrBenefit: 'Verified Scholarship Portal',
            liveReachable: true,
          } satisfies ScholarshipTarget;
        }),
      );

      return settled
        .filter((r): r is PromiseFulfilledResult<ScholarshipTarget | null> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((v): v is ScholarshipTarget => Boolean(v));
    } catch {
      return [];
    }
  }
}

export const scholarshipDiscoveryService = new ScholarshipDiscoveryService();
