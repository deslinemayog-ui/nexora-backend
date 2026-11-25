import { logger } from '../utils/logger';
import { discoverAdditionalEmployersWithAI, filterJobsByCvFitWithAI } from './cv-ai-matcher.service';

export interface JobApiListing {
  id: string;
  source:
  | 'indeed_jsearch'
  | 'indeed_publisher'
  | 'adzuna'
  | 'remotive'
  | 'arbeitnow'
  | 'jobicy'
  | 'themuse'
  | 'greenhouse'
  | 'lever'
  | 'himalayas'
  | 'jooble'
  | 'reed'
  | 'africa_rss'
  | 'remoteok'
  | 'weworkremotely'
  | 'company_direct';
  title: string;
  company: string;
  location: string;
  url: string;
  applyUrl: string;
  salary?: string;
  description: string;
  contactEmail?: string;
  tags: string[];
  matchScore: number;
}

export interface JobSearchQuery {
  role: string;
  searchTitles?: string[];
  skills?: string[];
  candidateYearsExperience?: number;
  cvText?: string;
  isTechRole?: boolean;
  recommendedEmployers?: Array<{ name: string; websiteUrl: string }>;
  targetCountry?: string;
  limit?: number;
  page?: number;
  requireVerifiedEmail?: boolean;
  onProgress?: (phase: string) => void;
}

export function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const AGGREGATOR_AND_NOISE_DOMAINS = [
  'adzuna.',
  'remotive.com',
  'arbeitnow.com',
  'jobicy.com',
  'themuse.com',
  'indeed.com',
  'linkedin.com',
  'glassdoor.',
  'ziprecruiter.',
  'monster.',
  'careerjet.',
  'pnet.co.za',
  'careers24.com',
  'gumtree.',
  'bizcommunity.',
  'recruit.net',
  'jooble.',
  'talent.com',
  'neuvoo.',
  'simplyhired.',
  'sentry.io',
  'wixpress.com',
  'example.com',
  'schema.org',
  'w3.org',
  'googleapis.com',
  'cloudflare.com',
  'duckduckgo.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'youtube.com',
  'tiktok.com',
];

function isAggregatorOrNoiseHost(hostOrEmail: string): boolean {
  const lower = hostOrEmail.toLowerCase();
  return AGGREGATOR_AND_NOISE_DOMAINS.some((d) => lower.includes(d));
}

const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  'domain.com',
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'email.com',
  'company.com',
  'yourdomain.com',
  'yourcompany.com',
  'placeholder.com',
  'adzuna.co.uk',
  'adzuna.com',
  'sentry.io',
  'wixpress.com',
]);

const PLACEHOLDER_EMAIL_LOCAL_PATTERN =
  /^(your\.?email|your-?name|firstname\.lastname|name|user|test|sample|placeholder|portal-intake|example|someone|email)$/i;

const NON_HIRING_EMAIL_LOCAL_PATTERN =
  /^(?:noreply|no-reply|donotreply|mailer-daemon|postmaster|support|privacy|legal|dmca|reportfraud|fraud|abuse|security|phishing|whistleblow\w*|ethics|compliance|ombud\w*|complaints?|customercare|customer\.?care|customerservice|customer\.?service|clientcare|client\.?service|helpdesk|claims?|insureinfo|billing|accounts?|payments?|orders?|returns?|refunds?|reservations?|bookings?|press|media|pr|newsroom|communications?|comms|investor\.?relations?|ir|shareholders?|informationofficer|popia|gdpr|dpo|webmaster|hostmaster|ccc|care|feedback|unsubscribe|newsletter|marketing|alerts?|notifications?|mp-dev|contactus|sales|shop|store)$/i;

const NON_HIRING_SUBSTRING_PATTERN =
  /(?:reportfraud|customercare|customer\.?service|insureinfo|investor\.?relations|informationofficer|whistleblow|no[-_.]?reply|do[-_.]?not[-_.]?reply|renaultcare)/i;

export function isValidCompanyEmail(email?: string): email is string {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(clean)) return false;
  const [localPart = '', domain = ''] = clean.split('@');
  if (PLACEHOLDER_EMAIL_LOCAL_PATTERN.test(localPart)) return false;
  if (NON_HIRING_EMAIL_LOCAL_PATTERN.test(localPart)) return false;
  if (NON_HIRING_SUBSTRING_PATTERN.test(localPart)) return false;
  if (PLACEHOLDER_EMAIL_DOMAINS.has(domain)) return false;
  if (isAggregatorOrNoiseHost(domain)) return false;
  return true;
}

export function getBingMarketParams(targetCountry?: string): string {
  const c = (targetCountry || '').toLowerCase();
  if (c.includes('south africa')) return '&mkt=en-ZA&cc=za';
  if (c.includes('uk') || c.includes('united kingdom')) return '&mkt=en-GB&cc=gb';
  if (c.includes('canada')) return '&mkt=en-CA&cc=ca';
  if (c.includes('germany')) return '&mkt=de-DE&cc=de';
  if (c.includes('usa') || c.includes('united states')) return '&mkt=en-US&cc=us';
  return '';
}

function domainMatchesCompany(hostOrEmail: string, companyName: string): boolean {
  const cleanHost = hostOrEmail.toLowerCase().replace(/^.*@/, '').replace(/^www\./, '');
  const stopWords = new Set(['ltd', 'pty', 'inc', 'llc', 'group', 'company', 'services', 'solutions', 'southern', 'africa', 'south', 'global', 'consulting', 'consultants', 'limited']);
  const tokens = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t));
  if (tokens.length === 0) return true;
  return tokens.some((t) => cleanHost.includes(t));
}

export function extractEmailFromText(text: string): string | undefined {
  // Strip <script> and <style> blocks first so JS library author emails (e.g. f@faisalman.com in ua-parser-js) are never extracted!
  const sanitized = String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const mailtoMatches = [...sanitized.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)]
    .map((m) => m[1])
    .filter(isValidCompanyEmail);
  const textMatches = (sanitized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
    .filter(isValidCompanyEmail);

  const candidates = Array.from(new Set([...mailtoMatches, ...textMatches]));
  if (candidates.length === 0) return undefined;

  // Strongly prefer dedicated hiring/careers/HR/recruitment/talent addresses first
  const hiringPreferred = candidates.find((e) =>
    /^(careers|jobs|hr|humanresources|recruitment|recruit|talent|hiring|apply|people|cv|cvs|vacancies|opportunities|staffing)@/i.test(e),
  );
  if (hiringPreferred) return hiringPreferred;

  // Next prefer named personal recruiter emails (e.g. alexandra@..., richard@...) over generic info@
  const generalPreferred = candidates.find((e) =>
    /^(info|contact|hello|enquiries|admin|office|reception)@/i.test(e),
  );
  const namedRecruiter = candidates.find(
    (e) => !/^(info|contact|hello|enquiries|admin|office|reception)@/i.test(e),
  );
  return namedRecruiter || generalPreferred || candidates[0];
}

function unwrapDuckDuckGoUrl(rawHref: string): string {
  try {
    if (rawHref.includes('uddg=')) {
      const u = new URL(rawHref.startsWith('http') ? rawHref : `https://duckduckgo.com${rawHref}`);
      const target = u.searchParams.get('uddg');
      if (target && target.startsWith('http')) return target;
    }
  } catch {
    // ignore
  }
  return rawHref;
}

function decodeSearchResultUrl(rawHref: string): string {
  try {
    const cleanHref = String(rawHref || '').replace(/&amp;/g, '&').trim();
    if (cleanHref.includes('uddg=')) {
      const u = new URL(cleanHref.startsWith('http') ? cleanHref : `https://duckduckgo.com${cleanHref}`);
      const target = u.searchParams.get('uddg');
      if (target && target.startsWith('http')) return target;
    }
    if (cleanHref.includes('bing.com/ck/a')) {
      const u = new URL(cleanHref);
      const encoded = u.searchParams.get('u');
      if (encoded && encoded.startsWith('a1')) {
        const b64 = encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        if (decoded.startsWith('http')) return decoded;
      }
    }
    return cleanHref;
  } catch {
    // ignore
  }
  return rawHref;
}

export function extractBingResults(html: string): Array<{ url: string; title: string }> {
  const results: Array<{ url: string; title: string }> = [];
  const seen = new Set<string>();
  const matches = [...html.matchAll(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const m of matches) {
    const url = decodeSearchResultUrl(m[1].replace(/&amp;/g, '&'));
    if (!url.startsWith('http') || isAggregatorOrNoiseHost(url)) continue;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (seen.has(host)) continue;
      seen.add(host);
      results.push({ url, title: stripHtml(m[2]) });
    } catch {
      // ignore
    }
  }
  return results;
}

export async function fetchHtmlQuick(url: string, timeoutMs = 4500): Promise<{ finalUrl: string; html: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return { finalUrl: res.url || url, html };
  } catch {
    return null;
  }
}

const SPECIALTY_STACK_PATTERNS: Array<{ id: string; titleRegex: RegExp; candidateRegex: RegExp }> = [
  { id: 'rails', titleRegex: /\b(ruby\s+on\s+rails|rails|ruby)\b/i, candidateRegex: /\b(ruby|rails)\b/i },
  { id: 'php', titleRegex: /\b(php|laravel|symfony|wordpress|drupal|magento)\b/i, candidateRegex: /\b(php|laravel|symfony|wordpress|drupal|magento)\b/i },
  { id: 'dotnet', titleRegex: /\b(\.net|asp\.net|c#|csharp|blazor|xamarin)\b/i, candidateRegex: /\b(\.net|asp\.net|c#|csharp|blazor|xamarin)\b/i },
  { id: 'java', titleRegex: /\b(java(?!script)|spring\s*boot|j2ee|hibernate)\b/i, candidateRegex: /\b(java(?!script)|spring|j2ee|kotlin)\b/i },
  { id: 'python', titleRegex: /\b(python|django|flask|fastapi)\b/i, candidateRegex: /\b(python|django|flask|fastapi)\b/i },
  { id: 'golang', titleRegex: /\b(golang|\bgo\s+(?:developer|engineer|backend))\b/i, candidateRegex: /\b(golang|\bgo\b)\b/i },
  { id: 'rust', titleRegex: /\b(rust\s+(?:developer|engineer|systems))\b/i, candidateRegex: /\b(rust)\b/i },
  { id: 'scala', titleRegex: /\b(scala|elixir|erlang|clojure|haskell)\b/i, candidateRegex: /\b(scala|elixir|erlang|clojure|haskell)\b/i },
  { id: 'cpp', titleRegex: /\b(c\+\+|embedded\s+c|firmware)\b/i, candidateRegex: /\b(c\+\+|embedded|firmware)\b/i },
  { id: 'salesforce', titleRegex: /\b(salesforce|apex|sap\s+abap|sap\s+hana|servicenow|workday|dynamics\s*365)\b/i, candidateRegex: /\b(salesforce|apex|sap|servicenow|workday|dynamics)\b/i },
  { id: 'angular', titleRegex: /\b(angular)\b/i, candidateRegex: /\b(angular)\b/i },
  { id: 'vue', titleRegex: /\b(vue\.?js|nuxt)\b/i, candidateRegex: /\b(vue|nuxt)\b/i },
  { id: 'flutter', titleRegex: /\b(flutter|dart)\b/i, candidateRegex: /\b(flutter|dart)\b/i },
  { id: 'ios_native', titleRegex: /\b(swift|swiftui|uikit|objective-c|ios\s+(?:developer|engineer)|mobile\s+(?:developer|engineer)\s*[-–(]\s*ios)\b/i, candidateRegex: /\b(swift|swiftui|uikit|objective-c)\b/i },
  { id: 'android_native', titleRegex: /\b(kotlin|jetpack\s+compose|android\s+(?:developer|engineer)|mobile\s+(?:developer|engineer)\s*[-–(]\s*android)\b/i, candidateRegex: /\b(kotlin|jetpack\s+compose)\b/i },
  { id: 'data_ml', titleRegex: /\b(data\s+scientist|machine\s+learning|mlops|deep\s+learning|nlp\s+engineer)\b/i, candidateRegex: /\b(data\s+scien|machine\s+learning|pytorch|tensorflow|mlops)\b/i },
  { id: 'cyber_soc', titleRegex: /\b(soc\b|secops|devsecops|cyber\s*security|security\s+operations|threat\s+detection|siem|penetration\s+test|appsec|infosec)\b/i, candidateRegex: /\b(soc\b|secops|devsecops|cyber\s*security|siem|penetration|appsec|infosec)\b/i },
  { id: 'cobol', titleRegex: /\b(cobol|mainframe|fortran|delphi)\b/i, candidateRegex: /\b(cobol|mainframe|fortran|delphi)\b/i },
];

const DESCRIPTION_SPECIALTY_MISMATCH_PATTERNS: Array<{ id: string; descRegex: RegExp; candidateRegex: RegExp }> = [
  { id: 'mulesoft', descRegex: /\b(mulesoft|anypoint\s+platform|dataweave|ibm\s+iib|dell\s+boomi)\b/i, candidateRegex: /\b(mulesoft|anypoint|dataweave|boomi|ibm\s+iib)\b/i },
  { id: 'azure_integration', descRegex: /\b(azure\s+integration\s+services|azure\s+logic\s+apps|azure\s+service\s+bus|azure\s+api\s+management|bicep\s+or\s+arm)\b/i, candidateRegex: /\b(azure\s+integration|logic\s+apps|service\s+bus|bicep)\b/i },
  { id: 'rails_desc', descRegex: /\b(ruby\s+on\s+rails)\b/i, candidateRegex: /\b(ruby|rails)\b/i },
  { id: 'sap_sf_desc', descRegex: /\b(sap\s+abap|sap\s+hana|salesforce\s+apex|servicenow\s+developer)\b/i, candidateRegex: /\b(sap|salesforce|apex|servicenow)\b/i },
  { id: 'cobol_desc', descRegex: /\b(cobol|mainframe|as\/400|rpgle)\b/i, candidateRegex: /\b(cobol|mainframe|as\/400)\b/i },
  { id: 'java_enterprise', descRegex: /\b(spring\s*boot|maven\s+and\s+jenkins|junit|munit|groovy|hibernate|j2ee)\b/i, candidateRegex: /\b(java(?!script)|spring|maven|junit|groovy|kotlin)\b/i },
  { id: 'ios_swift_desc', descRegex: /\b(swift|swiftui|uikit|objective-c)\b/i, candidateRegex: /\b(swift|swiftui|uikit|objective-c)\b/i },
  { id: 'android_kotlin_desc', descRegex: /\b(kotlin|jetpack\s+compose)\b/i, candidateRegex: /\b(kotlin|jetpack\s+compose)\b/i },
  { id: 'cyber_soc_desc', descRegex: /\b(security\s+operations\s+center|agentic\s+soc|siem|soar|threat\s+hunting|incident\s+response\s+platform)\b/i, candidateRegex: /\b(soc\b|secops|siem|soar|cyber\s*security|threat\s+hunting)\b/i },
];

export function hasDisqualifyingStackMismatch(
  jobTitle: string,
  candidateSkills: string[] | undefined,
  candidateRole: string,
  jobDescription?: string,
  candidateCvText?: string,
): boolean {
  const candidateProfile = `${candidateRole} ${(candidateSkills || []).join(' ')} ${(candidateCvText || '').slice(0, 4000)}`;
  if (!candidateProfile.trim()) return false;
  for (const stack of SPECIALTY_STACK_PATTERNS) {
    if (stack.titleRegex.test(jobTitle) && !stack.candidateRegex.test(candidateProfile)) {
      return true;
    }
  }
  if (jobDescription) {
    for (const stack of DESCRIPTION_SPECIALTY_MISMATCH_PATTERNS) {
      if (stack.descRegex.test(jobDescription) && !stack.candidateRegex.test(candidateProfile)) {
        return true;
      }
    }
  }
  return false;
}

export function exceedsCandidateExperience(
  jobDescription: string,
  candidateYearsExperience?: number,
): boolean {
  if (!candidateYearsExperience || candidateYearsExperience <= 0 || !jobDescription) return false;
  const matches = [...jobDescription.matchAll(/\b(?:over\s+|minimum\s+(?:of\s+)?|at\s+least\s+)?(\d{1,2})\+?\s+years?(?:\s+of)?\s+(?:experience|in\s+)/gi)];
  for (const m of matches) {
    const reqYears = Number(m[1]);
    if (reqYears >= 5 && reqYears <= 25 && reqYears > candidateYearsExperience + 2) {
      return true;
    }
  }
  return false;
}

const GENERIC_ROLE_WORDS = new Set([
  'senior',
  'junior',
  'lead',
  'principal',
  'staff',
  'mid',
  'developer',
  'engineer',
  'specialist',
  'manager',
  'consultant',
  'dev',
  'software',
]);

const NON_ENGINEERING_TITLE_REGEX =
  /\b(content\s+creator|youtube|tiktok|video\s+editor|social\s+media|copywriter|marketing|growth\s+marketer|seo\s+specialist|sales\s+rep|sales\s+manager|account\s+executive|business\s+development|bdr|sdr|recruiter|talent\s+acquisition|hr\s+manager|human\s+resources|customer\s+support|customer\s+success|call\s+center|graphic\s+designer|brand\s+designer|bookkeeper|accountant|payroll|receptionist|executive\s+assistant|virtual\s+assistant|legal\s+counsel|paralegal|nurse|teacher|tutor|writer|editor|journalist|community\s+manager)\b/i;

const NON_ENGINEERING_URL_REGEX =
  /\/(?:marketing|sales|customer-support|customer-service|writing|hr|human-resources|finance-legal|business|all-others)\//i;

const ENGINEERING_TITLE_SIGNAL_REGEX =
  /\b(dev|developer|engineer|engineering|programmer|architect|software|mobile|frontend|front-end|backend|back-end|full[- ]?stack|react|node\.?js|typescript|javascript|ios|android|web|app|tech\s+lead|cto)\b/i;

export function scoreJobListing(
  job: Omit<JobApiListing, 'matchScore'>,
  query: JobSearchQuery,
): number {
  const isCandidateEngineeringRole = ENGINEERING_TITLE_SIGNAL_REGEX.test(query.role);
  if (isCandidateEngineeringRole) {
    if (
      NON_ENGINEERING_TITLE_REGEX.test(job.title) ||
      NON_ENGINEERING_URL_REGEX.test(job.url || '') ||
      NON_ENGINEERING_URL_REGEX.test(job.applyUrl || '')
    ) {
      return -100;
    }
    if (!ENGINEERING_TITLE_SIGNAL_REGEX.test(job.title)) {
      return -100;
    }
  } else {
    // Non-engineering candidate (e.g. Security Guard, Nurse, Driver, Cleaner, Accountant):
    // NEVER give them software/engineering jobs, and require actual role-keyword overlap in title or body!
    const isSoftwareJob =
      /\b(software\s+(?:developer|engineer)|frontend|backend|full[- ]?stack|react|node\.?js|typescript|javascript|devops|kubernetes|programmer|mobile\s+developer)\b/i.test(
        job.title,
      ) || /\/software-dev\//i.test(job.url || '');
    if (isSoftwareJob) {
      return -100;
    }
    const candidateRoleWords = query.role
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !GENERIC_ROLE_WORDS.has(w));
    if (candidateRoleWords.length > 0) {
      const hay = `${job.title} ${job.description} ${job.tags.join(' ')}`.toLowerCase();
      const hasRoleHit = candidateRoleWords.some((w) => hay.includes(w));
      if (!hasRoleHit) {
        return -100;
      }
    }
  }

  if (hasDisqualifyingStackMismatch(job.title, query.skills, query.role, job.description, query.cvText)) {
    return -100;
  }
  if (exceedsCandidateExperience(job.description, query.candidateYearsExperience)) {
    return -100;
  }

  let score = 10;
  const titleLower = job.title.toLowerCase();
  const bodyLower = `${job.title} ${job.description} ${job.tags.join(' ')}`.toLowerCase();
  const locLower = job.location.toLowerCase();

  const roleTokens = query.role
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  let nonGenericRoleMatches = 0;
  for (const token of roleTokens) {
    const isGeneric = GENERIC_ROLE_WORDS.has(token);
    if (titleLower.includes(token)) {
      score += isGeneric ? 4 : 20;
      if (!isGeneric) nonGenericRoleMatches += 1;
    } else if (bodyLower.includes(token)) {
      score += isGeneric ? 2 : 8;
      if (!isGeneric) nonGenericRoleMatches += 1;
    }
  }

  const genericSkills = new Set(['git', 'rest', 'sql', 'ci/cd', 'agile', 'scrum', 'aws']);
  let coreSkillMatches = 0;
  for (const skill of query.skills ?? []) {
    const s = skill.toLowerCase().trim();
    if (s.length < 2) continue;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    if (regex.test(job.title)) {
      score += 20;
      if (!genericSkills.has(s)) coreSkillMatches += 1;
    } else if (regex.test(bodyLower)) {
      score += 9;
      if (!genericSkills.has(s)) coreSkillMatches += 1;
    }
  }

  // If the job has a substantive description (>= 180 chars) and matches ZERO non-generic role tokens
  // AND fewer than 2 core candidate skills, disqualify it so irrelevant enterprise/middleware roles are skipped.
  const hasSpecificRoleTerms = roleTokens.some((t) => !GENERIC_ROLE_WORDS.has(t));
  if (
    job.description.length >= 180 &&
    hasSpecificRoleTerms &&
    nonGenericRoleMatches === 0 &&
    coreSkillMatches < 2
  ) {
    return -100;
  }

  if (query.targetCountry) {
    const countryLower = query.targetCountry.toLowerCase();
    if (locLower.includes(countryLower) || locLower.includes('remote') || locLower.includes('worldwide')) {
      score += 10;
    }
  }

  if (job.source === 'indeed_jsearch' || job.source === 'indeed_publisher' || job.source === 'adzuna') {
    score += 5;
  }

  return score;
}

export class JobSearchApiService {
  /**
   * Queries all configured Job Search APIs (Indeed/JSearch, Adzuna, Remotive, Arbeitnow, Jobicy, The Muse)
   * in parallel, deduplicates, and ranks by candidate role/skills/location fit.
   */
  public async searchJobs(query: JobSearchQuery): Promise<{
    jobs: JobApiListing[];
    sourcesUsed: string[];
  }> {
    const limit = query.limit ?? 10;
    const sourcesUsed: string[] = [];

    const titlesToSearch = Array.from(
      new Set([query.role, ...(query.searchTitles || [])].map((t) => t.trim()).filter(Boolean)),
    ).slice(0, 4);
    const isTechRole =
      typeof query.isTechRole === 'boolean'
        ? query.isTechRole
        : ENGINEERING_TITLE_SIGNAL_REGEX.test(titlesToSearch.join(' '));

    const isGlobalTarget =
      !query.targetCountry ||
      /anywhere|worldwide|global|remote|international/i.test(query.targetCountry);
    const adzunaCountries = isGlobalTarget
      ? ['gb', 'us', 'za', 'ca']
      : [undefined];

    const tasks: Array<Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }>> = [];

    for (const title of titlesToSearch) {
      const subQuery: JobSearchQuery = { ...query, role: title };
      tasks.push(this.fetchDirectIndustryCompanies(subQuery));
      if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
        for (const cc of adzunaCountries) {
          const ccQuery: JobSearchQuery = cc
            ? {
                ...subQuery,
                targetCountry:
                  cc === 'gb'
                    ? 'United Kingdom'
                    : cc === 'us'
                      ? 'United States'
                      : cc === 'za'
                        ? 'South Africa'
                        : 'Canada',
              }
            : subQuery;
          tasks.push(this.fetchAdzuna(ccQuery, process.env.ADZUNA_APP_ID, process.env.ADZUNA_APP_KEY));
        }
      }
      if (process.env.RAPIDAPI_KEY) {
        tasks.push(this.fetchIndeedViaJSearch(subQuery, process.env.RAPIDAPI_KEY));
      }
      if (process.env.INDEED_PUBLISHER_ID) {
        tasks.push(this.fetchIndeedPublisher(subQuery, process.env.INDEED_PUBLISHER_ID));
      }
      if (process.env.JOOBLE_API_KEY) {
        tasks.push(this.fetchJooble(subQuery, process.env.JOOBLE_API_KEY));
      }
      // Reed UK disabled for now
      if (isTechRole) {
        tasks.push(this.fetchRemotive(subQuery));
      }
    }

    tasks.push(this.fetchTheMuse(query), this.fetchAfricaJobFeeds(query));
    if (isTechRole) {
      tasks.push(
        this.fetchArbeitnow(query),
        this.fetchJobicy(query),
        this.fetchHimalayas(query),
        this.fetchRemoteOk(query),
        this.fetchWeWorkRemotely(query),
        this.fetchGreenhouseBoards(query),
        this.fetchLeverBoards(query),
      );
    }

    const settled = await Promise.allSettled(tasks);
    const rawItems: Array<Omit<JobApiListing, 'matchScore'>> = [];

    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value.items.length > 0) {
        sourcesUsed.push(res.value.source);
        rawItems.push(...res.value.items);
      }
    }

    // Deduplicate by normalized company + title
    const seen = new Set<string>();
    const scored: JobApiListing[] = [];

    for (const item of rawItems) {
      const key = `${item.company.toLowerCase().trim()}::${item.title.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const matchScore = scoreJobListing(item, query);
      if (matchScore < 0) continue; // Skip jobs requiring a primary stack not on the candidate's CV
      scored.push({
        ...item,
        matchScore,
      });
    }

    scored.sort((a, b) => b.matchScore - a.matchScore);

    const enrichSingleJob = async (job: JobApiListing): Promise<void> => {
      if (isValidCompanyEmail(job.contactEmail)) {
        job.matchScore += 50;
        return;
      }

      // 1. Scrape the job detail / Adzuna redirect page for real email & fuller description
      if (job.applyUrl && job.applyUrl.startsWith('http')) {
        const detailPage = await fetchHtmlQuick(job.applyUrl, 4500);
        if (detailPage) {
          const pageText = stripHtml(detailPage.html);
          const emailOnPage = extractEmailFromText(detailPage.html) || extractEmailFromText(pageText);
          if (isValidCompanyEmail(emailOnPage)) {
            job.contactEmail = emailOnPage;
          }
          if (pageText.length > job.description.length + 80) {
            job.description = pageText.slice(0, 1500);
          }
          if (detailPage.finalUrl && !isAggregatorOrNoiseHost(detailPage.finalUrl)) {
            job.applyUrl = detailPage.finalUrl;
          }
        }
      }

      // Re-score against the full scraped job description — drop if stack/experience mismatch revealed!
      const rescored = scoreJobListing(job, query);
      if (rescored < 0) {
        job.matchScore = -100;
        job.contactEmail = undefined;
        return;
      }
      job.matchScore = rescored;

      // 2. If still no verified company email, search Bing + DuckDuckGo + company website for real email
      const genericCompany = /^(adzuna employer|hiring company|remote company|tech employer)$/i.test(
        job.company.trim(),
      );
      if (!isValidCompanyEmail(job.contactEmail) && !genericCompany) {
        const found = await this.findRealCompanyEmailViaWeb(job.company, query.targetCountry);
        if (found?.email) {
          job.contactEmail = found.email;
          if (found.websiteUrl && isAggregatorOrNoiseHost(job.url)) {
            job.url = found.websiteUrl;
          }
        }
      }

      if (isValidCompanyEmail(job.contactEmail)) {
        job.matchScore += 50;
      } else {
        job.contactEmail = undefined;
      }
    };

    const dedupeUniqueByCompanyAndEmail = (list: JobApiListing[]): JobApiListing[] => {
      const seenEmails = new Set<string>();
      const seenCompanies = new Set<string>();
      const out: JobApiListing[] = [];
      for (const j of list) {
        const emailKey = (j.contactEmail || '').trim().toLowerCase();
        const companyKey = j.company.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (emailKey && seenEmails.has(emailKey)) continue;
        if (companyKey && companyKey.length >= 3 && seenCompanies.has(companyKey)) continue;
        if (emailKey) seenEmails.add(emailKey);
        if (companyKey && companyKey.length >= 3) seenCompanies.add(companyKey);
        out.push(j);
      }
      return out;
    };

    // Throttled enrichment (4 at a time) so search engines don't rate-limit us,
    // stopping the instant we reach `stopAtVerifiedCount` unique verified-email jobs!
    const enrichDeadlineMs = Date.now() + Math.min(360_000, Math.max(60_000, limit * 5000));
    const enrichThrottledUntilTarget = async (
      pool: JobApiListing[],
      alreadyVerified: JobApiListing[],
      targetCount: number,
      deadlineMs = enrichDeadlineMs,
    ): Promise<void> => {
      const CHUNK_SIZE = 5;
      for (let i = 0; i < pool.length; i += CHUNK_SIZE) {
        if (Date.now() > deadlineMs) break;
        const currentVerified = dedupeUniqueByCompanyAndEmail([
          ...alreadyVerified,
          ...pool.filter((j) => j.matchScore >= 0 && isValidCompanyEmail(j.contactEmail)),
        ]);
        if (currentVerified.length >= targetCount) break;
        const chunk = pool.slice(i, i + CHUNK_SIZE);
        await Promise.allSettled(chunk.map((job) => enrichSingleJob(job)));
      }
    };

    // Step A: Scrape OpenClaw's recommended real employers in parallel (live HTML -> real verified emails!)
    const verifiedEmployerJobs: JobApiListing[] = [];
    const triedEmployerNames = new Set<string>();

    const scrapeEmployerBatch = async (
      employers: Array<{ name: string; websiteUrl: string }>,
      targetNeeded: number,
      roundLabel = 'Round 1',
    ): Promise<void> => {
      const CHUNK = 10;
      for (let i = 0; i < employers.length; i += CHUNK) {
        const verifiedSoFar = dedupeUniqueByCompanyAndEmail(verifiedEmployerJobs).length;
        if (verifiedSoFar >= targetNeeded) break;
        query.onProgress?.(
          `${roundLabel}: Scraping employer websites (${verifiedSoFar} / ${targetNeeded} verified emails found)...`,
        );
        const slice = employers.slice(i, i + CHUNK);
        slice.forEach((e) => triedEmployerNames.add(e.name));
        const resChunk = await Promise.allSettled(
          slice.map(async (emp, idx) => {
            let origin = '';
            try {
              origin = new URL(emp.websiteUrl).origin;
            } catch {
              return null;
            }
            // Fetch /careers, /jobs, /contact, and homepage in parallel — prioritizing dedicated hiring pages first!
            const [careersPage, jobsPage, contactPage, homePage] = await Promise.all([
              fetchHtmlQuick(`${origin}/careers`, 3000),
              fetchHtmlQuick(`${origin}/jobs`, 3000),
              fetchHtmlQuick(`${origin}/contact`, 3000),
              fetchHtmlQuick(emp.websiteUrl, 3500),
            ]);
            const pages = [careersPage, jobsPage, contactPage, homePage].filter((p): p is NonNullable<typeof p> => Boolean(p));
            let email: string | undefined;
            let finalUrl = homePage?.finalUrl || emp.websiteUrl;
            let desc = `${query.role} application to ${emp.name} (${query.targetCountry || 'Direct Employer'}).`;

            for (const p of pages) {
              const clean = stripHtml(p.html);
              if (p === homePage && clean.length > 40) desc = clean.slice(0, 480);
              const foundEmail = extractEmailFromText(p.html) || extractEmailFromText(clean);
              if (isValidCompanyEmail(foundEmail)) {
                email = foundEmail;
                break;
              }
            }
            if (!isValidCompanyEmail(email)) {
              const found = await this.findRealCompanyEmailViaWeb(emp.name, query.targetCountry);
              if (isValidCompanyEmail(found?.email)) {
                email = found.email;
                if (found.websiteUrl) finalUrl = found.websiteUrl;
              }
            }
            if (!isValidCompanyEmail(email)) return null;
            return {
              id: `employer-direct-${triedEmployerNames.size}-${idx}-${Date.now()}`,
              source: 'company_direct' as const,
              title: `${query.role} — Direct Application`,
              company: emp.name,
              location: query.targetCountry || 'Direct Employer',
              url: finalUrl,
              applyUrl: finalUrl,
              description: desc,
              contactEmail: email,
              tags: [query.role],
              matchScore: 92,
            } satisfies JobApiListing;
          }),
        );
        for (const r of resChunk) {
          if (r.status === 'fulfilled' && r.value) {
            verifiedEmployerJobs.push(r.value);
          }
        }
        const updatedVerified = dedupeUniqueByCompanyAndEmail(verifiedEmployerJobs).length;
        query.onProgress?.(
          `${roundLabel}: Found ${updatedVerified} / ${targetNeeded} verified company emails so far...`,
        );
      }
    };

    if (query.recommendedEmployers && query.recommendedEmployers.length > 0) {
      await scrapeEmployerBatch(query.recommendedEmployers, limit);
      if (verifiedEmployerJobs.length > 0) {
        sourcesUsed.push('employer_direct_scrape');
      }
    }

    // Step B: Screen unique job-board candidates with OpenClaw ONCE (never 3x in a loop!), then enrich with fresh deadline
    let approvedPool: JobApiListing[] = dedupeUniqueByCompanyAndEmail(scored);
    if (approvedPool.length > 0 && (query.cvText || (query.skills && query.skills.length > 0))) {
      approvedPool = await filterJobsByCvFitWithAI(
        {
          role: query.role,
          skills: query.skills,
          yearsExperience: query.candidateYearsExperience,
          cvText: query.cvText,
        },
        approvedPool.slice(0, 35),
      );
    }

    // Start enrichment timer AFTER OpenClaw finishes so OpenClaw latency never eats the enrichment budget!
    const freshEnrichDeadlineMs = Date.now() + Math.min(240_000, Math.max(45_000, limit * 4000));
    const targetVerified = query.requireVerifiedEmail ? limit : Math.min(limit, 8);
    await enrichThrottledUntilTarget(approvedPool, verifiedEmployerJobs, targetVerified, freshEnrichDeadlineMs);

    // Combine job-board verified matches FIRST + live-scraped verified direct employers
    approvedPool = dedupeUniqueByCompanyAndEmail([...approvedPool, ...verifiedEmployerJobs]);

    // Step C: If STILL short of `limit` unique verified-email jobs, paginate Adzuna page 2 (without re-calling OpenClaw 3x)
    if (query.requireVerifiedEmail) {
      const getVerifiedSoFar = () =>
        dedupeUniqueByCompanyAndEmail(
          approvedPool.filter((j) => j.matchScore >= 0 && isValidCompanyEmail(j.contactEmail)),
        );

      const maxPages = limit > 30 ? 6 : limit > 10 ? 4 : 2;
      for (let page = 2; page <= maxPages && getVerifiedSoFar().length < limit && Date.now() < freshEnrichDeadlineMs; page++) {
        const pageTasks: Array<Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }>> = [];
        for (const title of titlesToSearch) {
          for (const cc of adzunaCountries) {
            const pagedQuery: JobSearchQuery = {
              ...query,
              role: title,
              page,
              ...(cc
                ? {
                    targetCountry:
                      cc === 'gb'
                        ? 'United Kingdom'
                        : cc === 'us'
                          ? 'United States'
                          : cc === 'za'
                            ? 'South Africa'
                            : 'Canada',
                  }
                : {}),
            };
            if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
              pageTasks.push(this.fetchAdzuna(pagedQuery, process.env.ADZUNA_APP_ID, process.env.ADZUNA_APP_KEY));
            }
            if (process.env.RAPIDAPI_KEY) {
              pageTasks.push(this.fetchIndeedViaJSearch(pagedQuery, process.env.RAPIDAPI_KEY));
            }
          }
        }
        if (pageTasks.length === 0) break;
        const pageSettled = await Promise.allSettled(pageTasks);
        let newCandidates: JobApiListing[] = [];
        for (const res of pageSettled) {
          if (res.status === 'fulfilled') {
            for (const item of res.value.items) {
              const key = `${item.company.toLowerCase().trim()}::${item.title.toLowerCase().trim()}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const matchScore = scoreJobListing(item, query);
              if (matchScore < 0) continue;
              newCandidates.push({ ...item, matchScore });
            }
          }
        }
        newCandidates = dedupeUniqueByCompanyAndEmail(newCandidates);
        if (newCandidates.length === 0) break;

        await enrichThrottledUntilTarget(newCandidates, getVerifiedSoFar(), limit, freshEnrichDeadlineMs);
        approvedPool.push(...newCandidates);
      }

      // Step D: Dynamically request additional batches of unique real employers from OpenClaw
      // until we genuinely reach the user's exact requested count (works for 10, 25, 50, or 100!)
      const maxExtraRounds = Math.min(12, Math.ceil(limit / 8) + 2);
      const stepDDeadlineMs = Date.now() + Math.min(480_000, Math.max(90_000, limit * 10_000));
      for (
        let round = 1;
        round <= maxExtraRounds && getVerifiedSoFar().length < limit && Date.now() < stepDDeadlineMs;
        round++
      ) {
        const currentFound = getVerifiedSoFar().length;
        const remainingNeeded = limit - currentFound;
        query.onProgress?.(
          `Found ${currentFound} / ${limit} verified emails — asking OpenClaw for batch ${round + 1} employers...`,
        );
        const alreadyKnownCompanies = [
          ...Array.from(triedEmployerNames),
          ...approvedPool.map((j) => j.company),
        ];
        const moreEmployers = await discoverAdditionalEmployersWithAI({
          role: query.role,
          matchingTitles: titlesToSearch,
          targetCountry: query.targetCountry,
          excludeCompanies: alreadyKnownCompanies,
          batchSize: Math.min(35, Math.max(20, remainingNeeded * 3)),
        });
        if (moreEmployers.length === 0) break;

        const beforeCount = verifiedEmployerJobs.length;
        await scrapeEmployerBatch(moreEmployers, limit, `Round ${round + 1}`);
        const newlyVerified = verifiedEmployerJobs.slice(beforeCount);
        if (newlyVerified.length > 0) {
          approvedPool = dedupeUniqueByCompanyAndEmail([...approvedPool, ...newlyVerified]);
        }
      }
    }

    const qualified = approvedPool.filter((j) => j.matchScore >= 0);
    qualified.sort((a, b) => b.matchScore - a.matchScore);

    // Prefer unique jobs (by company & email) that actually have a verified real company email!
    const withEmail = dedupeUniqueByCompanyAndEmail(
      qualified.filter((j) => isValidCompanyEmail(j.contactEmail)),
    );
    const finalJobs = query.requireVerifiedEmail
      ? withEmail.slice(0, limit)
      : (withEmail.length >= limit
          ? withEmail
          : [...withEmail, ...dedupeUniqueByCompanyAndEmail(qualified.filter((j) => !isValidCompanyEmail(j.contactEmail)))]
        ).slice(0, limit);

    logger.info(
      {
        totalFound: scored.length,
        withVerifiedEmail: withEmail.length,
        returned: finalJobs.length,
        sourcesUsed,
      },
      'Aggregated & email-enriched live jobs',
    );

    return {
      jobs: finalJobs,
      sourcesUsed,
    };
  }

  private async fetchIndeedViaJSearch(
    query: JobSearchQuery,
    apiKey: string,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const q = `${query.role}${query.targetCountry ? ` in ${query.targetCountry}` : ''}`;
      const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q)}&num_pages=1`;
      const res = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return { source: 'indeed_jsearch', items: [] };
      const json = (await res.json()) as { data?: Array<Record<string, any>> };
      const items = (json.data || []).slice(0, 10).map((j, idx) => {
        const desc = stripHtml(j.job_description || '');
        const applyUrl = j.job_apply_link || j.job_google_link || 'https://www.indeed.com';
        const company = j.employer_name || 'Hiring Company';
        return {
          id: `jsearch-${j.job_id || idx}`,
          source: 'indeed_jsearch' as const,
          title: j.job_title || query.role,
          company,
          location: [j.job_city, j.job_country].filter(Boolean).join(', ') || 'Remote',
          url: applyUrl,
          applyUrl,
          salary: j.job_min_salary && j.job_max_salary ? `${j.job_min_salary}-${j.job_max_salary}` : undefined,
          description: desc.slice(0, 500),
          contactEmail: extractEmailFromText(desc),
          tags: Array.isArray(j.job_required_skills) ? j.job_required_skills : [],
        };
      });
      return { source: 'indeed_jsearch', items };
    } catch {
      return { source: 'indeed_jsearch', items: [] };
    }
  }

  private async fetchIndeedPublisher(
    query: JobSearchQuery,
    publisherId: string,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const countryMap: Record<string, string> = {
        'united states': 'us',
        usa: 'us',
        canada: 'ca',
        uk: 'gb',
        'united kingdom': 'gb',
        'south africa': 'za',
        germany: 'de',
      };
      const co = countryMap[(query.targetCountry || '').toLowerCase()] || 'us';
      const url = `https://api.indeed.com/ads/apisearch?publisher=${encodeURIComponent(publisherId)}&q=${encodeURIComponent(query.role)}&co=${co}&format=json&v=2&limit=10`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return { source: 'indeed_publisher', items: [] };
      const json = (await res.json()) as { results?: Array<Record<string, any>> };
      const items = (json.results || []).map((j, idx) => {
        const company = j.company || 'Indeed Employer';
        const applyUrl = j.url || 'https://www.indeed.com';
        const desc = stripHtml(j.snippet || '');
        return {
          id: `indeed-${j.jobkey || idx}`,
          source: 'indeed_publisher' as const,
          title: j.jobtitle || query.role,
          company,
          location: j.formattedLocation || query.targetCountry || 'Remote',
          url: applyUrl,
          applyUrl,
          description: desc,
          contactEmail: extractEmailFromText(desc),
          tags: [],
        };
      });
      return { source: 'indeed_publisher', items };
    } catch {
      return { source: 'indeed_publisher', items: [] };
    }
  }

  private async fetchAdzuna(
    query: JobSearchQuery,
    appId: string,
    appKey: string,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const countryMap: Record<string, string> = {
        'united states': 'us',
        usa: 'us',
        canada: 'ca',
        uk: 'gb',
        'united kingdom': 'gb',
        'south africa': 'za',
        germany: 'de',
      };
      const cc = countryMap[(query.targetCountry || '').toLowerCase()] || 'gb';
      const pageNum = Math.max(1, query.page ?? 1);
      const url = `https://api.adzuna.com/v1/api/jobs/${cc}/search/${pageNum}?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&what=${encodeURIComponent(query.role)}&results_per_page=15`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return { source: 'adzuna', items: [] };
      const json = (await res.json()) as { results?: Array<Record<string, any>> };
      const items = (json.results || []).map((j, idx) => {
        const company = j.company?.display_name || 'Adzuna Employer';
        const applyUrl = j.redirect_url || 'https://www.adzuna.com';
        const desc = stripHtml(j.description || '');
        return {
          id: `adzuna-${j.id || idx}`,
          source: 'adzuna' as const,
          title: j.title || query.role,
          company,
          location: j.location?.display_name || query.targetCountry || 'International',
          url: applyUrl,
          applyUrl,
          salary: j.salary_min && j.salary_max ? `${j.salary_min}-${j.salary_max}` : undefined,
          description: desc.slice(0, 500),
          contactEmail: extractEmailFromText(desc),
          tags: [],
        };
      });
      return { source: 'adzuna', items };
    } catch {
      return { source: 'adzuna', items: [] };
    }
  }

  private async fetchRemotive(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const searchTerm = (query.skills?.[0] || query.role.split(' ')[0] || 'software').trim();
      const categoryParam = ENGINEERING_TITLE_SIGNAL_REGEX.test(query.role) ? '&category=software-dev' : '';
      const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(searchTerm)}${categoryParam}&limit=12`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return { source: 'remotive', items: [] };
      const json = (await res.json()) as { jobs?: Array<Record<string, any>> };
      const items = (json.jobs || []).slice(0, 10).map((j) => {
        const company = j.company_name || 'Remote Company';
        const applyUrl = j.url || 'https://remotive.com';
        const desc = stripHtml(j.description || '');
        return {
          id: `remotive-${j.id}`,
          source: 'remotive' as const,
          title: j.title || query.role,
          company,
          location: j.candidate_required_location || 'Remote / Worldwide',
          url: applyUrl,
          applyUrl,
          salary: j.salary || undefined,
          description: desc.slice(0, 500),
          contactEmail: extractEmailFromText(desc),
          tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : [],
        };
      });
      return { source: 'remotive', items };
    } catch {
      return { source: 'remotive', items: [] };
    }
  }

  private async fetchArbeitnow(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return { source: 'arbeitnow', items: [] };
      const json = (await res.json()) as { data?: Array<Record<string, any>> };
      const roleTokens = query.role
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !GENERIC_ROLE_WORDS.has(w));
      const filtered = (json.data || [])
        .filter((j) => {
          const t = `${j.title || ''} ${(j.tags || []).join(' ')}`.toLowerCase();
          return roleTokens.length > 0 ? roleTokens.some((tok) => t.includes(tok)) : t.includes(query.role.toLowerCase());
        })
        .slice(0, 10);

      const items = filtered.map((j, idx) => {
        const company = j.company_name || 'Tech Company';
        const applyUrl = j.url || 'https://www.arbeitnow.com';
        const desc = stripHtml(j.description || '');
        return {
          id: `arbeitnow-${j.slug || idx}`,
          source: 'arbeitnow' as const,
          title: j.title || query.role,
          company,
          location: j.location || (j.remote ? 'Remote' : 'Europe / International'),
          url: applyUrl,
          applyUrl,
          description: desc.slice(0, 500),
          contactEmail: extractEmailFromText(desc),
          tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : [],
        };
      });
      return { source: 'arbeitnow', items };
    } catch {
      return { source: 'arbeitnow', items: [] };
    }
  }

  /**
   * Official Greenhouse Public Job Board JSON API (zero API key required).
   * Queries curated active public Greenhouse boards and filters by candidate role & skills.
   */
  private async fetchGreenhouseBoards(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    const boards = [
      { slug: 'monzo', company: 'Monzo' },
      { slug: 'stripe', company: 'Stripe' },
      { slug: 'cloudflare', company: 'Cloudflare' },
      { slug: 'vercel', company: 'Vercel' },
      { slug: 'gitlab', company: 'GitLab' },
      { slug: 'remotecom', company: 'Remote.com' },
      { slug: 'intercom', company: 'Intercom' },
      { slug: 'figma', company: 'Figma' },
    ];
    const tokens = `${query.role} ${(query.skills || []).slice(0, 6).join(' ')}`
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length >= 3 && !GENERIC_ROLE_WORDS.has(t));

    const results = await Promise.allSettled(
      boards.map(async (b) => {
        const res = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`,
          { signal: AbortSignal.timeout(5500) },
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { jobs?: Array<Record<string, any>> };
        return (json.jobs || [])
          .filter((j) => {
            const hay = `${j.title || ''} ${j.location?.name || ''}`.toLowerCase();
            return tokens.length === 0 || tokens.some((tok) => hay.includes(tok));
          })
          .slice(0, 4)
          .map((j) => {
            const desc = stripHtml(j.content || '');
            return {
              id: `greenhouse-${b.slug}-${j.id}`,
              source: 'greenhouse' as const,
              title: String(j.title || query.role),
              company: b.company,
              location: String(j.location?.name || 'Remote / Hybrid'),
              url: String(j.absolute_url || `https://boards.greenhouse.io/${b.slug}`),
              applyUrl: String(j.absolute_url || `https://boards.greenhouse.io/${b.slug}`),
              description: desc.slice(0, 700),
              contactEmail: extractEmailFromText(desc),
              tags: [b.company, 'Greenhouse'],
            };
          });
      }),
    );

    const items = results
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .slice(0, 16);
    return { source: 'greenhouse', items };
  }

  /**
   * Official Lever Public Postings JSON API (zero API key required).
   */
  private async fetchLeverBoards(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    const boards = [
      { slug: 'netflix', company: 'Netflix' },
      { slug: 'spotify', company: 'Spotify' },
      { slug: 'plaid', company: 'Plaid' },
      { slug: 'palantir', company: 'Palantir' },
      { slug: 'wealthsimple', company: 'Wealthsimple' },
      { slug: 'paystack', company: 'Paystack' },
    ];
    const tokens = `${query.role} ${(query.skills || []).slice(0, 6).join(' ')}`
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length >= 3 && !GENERIC_ROLE_WORDS.has(t));

    const results = await Promise.allSettled(
      boards.map(async (b) => {
        const res = await fetch(`https://api.lever.co/v0/postings/${b.slug}?mode=json`, {
          signal: AbortSignal.timeout(5500),
        });
        if (!res.ok) return [];
        const jobs = (await res.json()) as Array<Record<string, any>>;
        if (!Array.isArray(jobs)) return [];
        return jobs
          .filter((j) => {
            const hay = `${j.text || ''} ${j.categories?.team || ''} ${j.categories?.location || ''}`.toLowerCase();
            return tokens.length === 0 || tokens.some((tok) => hay.includes(tok));
          })
          .slice(0, 4)
          .map((j) => {
            const desc = stripHtml(j.descriptionPlain || j.description || '');
            return {
              id: `lever-${b.slug}-${j.id}`,
              source: 'lever' as const,
              title: String(j.text || query.role),
              company: b.company,
              location: String(j.categories?.location || 'Remote / Hybrid'),
              url: String(j.hostedUrl || `https://jobs.lever.co/${b.slug}`),
              applyUrl: String(j.applyUrl || j.hostedUrl || `https://jobs.lever.co/${b.slug}`),
              description: desc.slice(0, 700),
              contactEmail: extractEmailFromText(desc),
              tags: [b.company, 'Lever'],
            };
          });
      }),
    );

    const items = results
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .slice(0, 14);
    return { source: 'lever', items };
  }

  /**
   * Official Himalayas Public Remote Jobs JSON API (zero API key required).
   */
  private async fetchHimalayas(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const res = await fetch('https://himalayas.app/jobs/api?limit=30', {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return { source: 'himalayas', items: [] };
      const json = (await res.json()) as { jobs?: Array<Record<string, any>> };
      const tokens = `${query.role} ${(query.skills || []).slice(0, 6).join(' ')}`
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((t) => t.length >= 3 && !GENERIC_ROLE_WORDS.has(t));

      const items = (json.jobs || [])
        .filter((j) => {
          const hay = `${j.title || ''} ${(j.categories || []).join(' ')} ${j.excerpt || ''}`.toLowerCase();
          return tokens.length === 0 || tokens.some((tok) => hay.includes(tok));
        })
        .slice(0, 12)
        .map((j, idx) => {
          const desc = stripHtml(j.description || j.excerpt || '');
          const applyUrl = String(j.applicationLink || j.guid || 'https://himalayas.app/jobs');
          return {
            id: `himalayas-${j.guid || idx}`,
            source: 'himalayas' as const,
            title: String(j.title || query.role),
            company: String(j.companyName || 'Remote Employer'),
            location: Array.isArray(j.locationRestrictions) && j.locationRestrictions.length > 0
              ? j.locationRestrictions.join(', ')
              : 'Remote / Worldwide',
            url: applyUrl,
            applyUrl,
            salary: j.minSalary && j.maxSalary ? `${j.currency || '$'}${j.minSalary}-${j.maxSalary}` : undefined,
            description: desc.slice(0, 700),
            contactEmail: extractEmailFromText(desc),
            tags: Array.isArray(j.categories) ? j.categories.slice(0, 6) : [],
          };
        });
      return { source: 'himalayas', items };
    } catch {
      return { source: 'himalayas', items: [] };
    }
  }

  /**
   * Official Jooble Jobs REST API (covers 60+ countries including South Africa, UK, US, Canada, Germany).
   * Enabled automatically when JOOBLE_API_KEY is set in .env.
   */
  private async fetchJooble(
    query: JobSearchQuery,
    apiKey: string,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const res = await fetch(`https://jooble.org/api/${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: query.role,
          location:
            query.targetCountry && !/anywhere|worldwide|global|remote/i.test(query.targetCountry)
              ? query.targetCountry
              : '',
          page: String(query.page ?? 1),
        }),
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return { source: 'jooble', items: [] };
      const json = (await res.json()) as { jobs?: Array<Record<string, any>> };
      const items = (json.jobs || []).slice(0, 15).map((j, idx) => {
        const desc = stripHtml(j.snippet || '');
        const applyUrl = String(j.link || 'https://jooble.org');
        return {
          id: `jooble-${j.id || idx}`,
          source: 'jooble' as const,
          title: String(j.title || query.role),
          company: String(j.company || 'Jooble Employer'),
          location: String(j.location || query.targetCountry || 'International'),
          url: applyUrl,
          applyUrl,
          salary: j.salary ? String(j.salary) : undefined,
          description: desc.slice(0, 700),
          contactEmail: extractEmailFromText(desc),
          tags: [String(j.type || 'Full-time')],
        };
      });
      return { source: 'jooble', items };
    } catch {
      return { source: 'jooble', items: [] };
    }
  }

  /**
   * Official Reed.co.uk Jobs API (UK roles across all professions).
   * Enabled automatically when REED_API_KEY is set in .env.
   */
  private async fetchReedUk(
    query: JobSearchQuery,
    apiKey: string,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
      const skip = ((query.page ?? 1) - 1) * 15;
      const url = `https://www.reed.co.uk/api/1.0/search?keywords=${encodeURIComponent(query.role)}&resultsToTake=15&resultsToSkip=${skip}`;
      const res = await fetch(url, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return { source: 'reed', items: [] };
      const json = (await res.json()) as { results?: Array<Record<string, any>> };
      const items = (json.results || []).map((j, idx) => {
        const desc = stripHtml(j.jobDescription || '');
        const applyUrl = String(j.jobUrl || 'https://www.reed.co.uk');
        return {
          id: `reed-${j.jobId || idx}`,
          source: 'reed' as const,
          title: String(j.jobTitle || query.role),
          company: String(j.employerName || 'UK Employer'),
          location: String(j.locationName || 'United Kingdom'),
          url: applyUrl,
          applyUrl,
          salary: j.minimumSalary && j.maximumSalary ? `£${j.minimumSalary}-£${j.maximumSalary}` : undefined,
          description: desc.slice(0, 700),
          contactEmail: extractEmailFromText(desc),
          tags: ['UK', 'Reed'],
        };
      });
      return { source: 'reed', items };
    } catch {
      return { source: 'reed', items: [] };
    }
  }

  private parseRssItems(xml: string): Array<{
    title: string;
    link: string;
    description: string;
    categories: string[];
  }> {
    const unwrapCdata = (s: string) =>
      s
        .replace(/^<!\[CDATA\[/i, '')
        .replace(/\]\]>$/, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&#39;/g, "'")
        .trim();

    const items: Array<{ title: string; link: string; description: string; categories: string[] }> = [];
    const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    for (const block of blocks) {
      const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const contentMatch = block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i);
      const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
      const cats = [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) =>
        stripHtml(unwrapCdata(m[1] || '')),
      );
      const title = stripHtml(unwrapCdata(titleMatch?.[1] || ''));
      const link = unwrapCdata(linkMatch?.[1] || '').trim();
      const rawDesc = unwrapCdata(contentMatch?.[1] || descMatch?.[1] || '');
      if (title && link) {
        items.push({ title, link, description: rawDesc, categories: cats.filter(Boolean) });
      }
    }
    return items;
  }

  /**
   * Free, zero-key regional African job feeds covering South Africa, Zimbabwe, Nigeria,
   * Zambia, Ghana, Uganda, and Kenya (works for ALL professions — trades, tech, healthcare, finance).
   */
  private async fetchAfricaJobFeeds(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    const ALL_AFRICA_FEEDS: Array<{ country: string; matchKey: RegExp; name: string; url: string }> = [
      { country: 'South Africa', matchKey: /south\s*africa|\bza\b|\bsa\b/i, name: 'MyJobMag SA', url: 'https://www.myjobmag.co.za/jobsxml.xml' },
      { country: 'Zimbabwe', matchKey: /zimbabwe|\bzim\b|\bzw\b/i, name: 'VacancyBox Zimbabwe', url: 'https://vacancybox.co.zw/feed/' },
      { country: 'Nigeria', matchKey: /nigeria|\bng\b/i, name: 'MyJobMag Nigeria', url: 'https://www.myjobmag.com/jobsxml.xml' },
      { country: 'Zambia', matchKey: /zambia|\bzm\b/i, name: 'JobWebZambia', url: 'https://jobwebzambia.com/feed/' },
      { country: 'Ghana', matchKey: /ghana|\bgh\b/i, name: 'JobHouse Ghana', url: 'https://jobhouse.com.gh/feed/' },
      { country: 'Uganda', matchKey: /uganda|\bug\b/i, name: 'JobWebUganda', url: 'https://jobwebuganda.com/feed/' },
      { country: 'Kenya', matchKey: /kenya|\bke\b/i, name: 'MyJobMag Kenya', url: 'https://www.myjobmag.co.ke/jobsxml.xml' },
    ];

    const c = (query.targetCountry || '').trim();
    const matchedFeeds =
      !c || /anywhere|worldwide|global|remote|africa/i.test(c)
        ? ALL_AFRICA_FEEDS
        : ALL_AFRICA_FEEDS.filter((f) => f.matchKey.test(c));

    if (matchedFeeds.length === 0) {
      return { source: 'africa_rss', items: [] };
    }

    const searchTokens = `${query.role} ${(query.searchTitles || []).join(' ')} ${(query.skills || []).slice(0, 6).join(' ')}`
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length >= 3 && !GENERIC_ROLE_WORDS.has(t));

    const results = await Promise.allSettled(
      matchedFeeds.map(async (feed) => {
        const res = await fetch(feed.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return [];
        const xml = await res.text();
        const parsed = this.parseRssItems(xml);

        return parsed
          .filter((item) => {
            if (searchTokens.length === 0) return true;
            const hay = `${item.title} ${stripHtml(item.description).slice(0, 500)} ${item.categories.join(' ')}`.toLowerCase();
            return searchTokens.some((tok) => hay.includes(tok));
          })
          .slice(0, 10)
          .map((item, idx) => {
            const cleanDesc = stripHtml(item.description);
            const emailInFeed = extractEmailFromText(item.description) || extractEmailFromText(cleanDesc);
            // Parse "Role at Company" pattern common on MyJobMag / VacancyBox / JobWeb feeds
            const atMatch = item.title.match(/\s+at\s+(.+)$/i);
            const titleClean = atMatch ? item.title.replace(/\s+at\s+.+$/i, '').trim() : item.title;
            const companyClean = atMatch?.[1]?.trim() || feed.name;
            return {
              id: `africa-${feed.country.toLowerCase().replace(/\s+/g, '')}-${idx}-${Date.now()}`,
              source: 'africa_rss' as const,
              title: titleClean,
              company: companyClean.slice(0, 70),
              location: feed.country,
              url: item.link,
              applyUrl: item.link,
              description: cleanDesc.slice(0, 800),
              contactEmail: emailInFeed,
              tags: [feed.country, feed.name, ...item.categories.slice(0, 3)],
            };
          });
      }),
    );

    const items = results
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .slice(0, 30);

    return { source: 'africa_rss', items };
  }

  /**
   * Official RemoteOK Public JSON API (zero API key required, global remote roles open to Africa).
   */
  private async fetchRemoteOk(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const res = await fetch('https://remoteok.com/api', {
        headers: { 'User-Agent': 'NexoraAI/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return { source: 'remoteok', items: [] };
      const rows = (await res.json()) as Array<Record<string, any>>;
      if (!Array.isArray(rows)) return { source: 'remoteok', items: [] };
      const tokens = `${query.role} ${(query.skills || []).slice(0, 6).join(' ')}`
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((t) => t.length >= 3 && !GENERIC_ROLE_WORDS.has(t));

      const items = rows
        .slice(1)
        .filter((j) => {
          if (!j?.position) return false;
          const hay = `${j.position || ''} ${(j.tags || []).join(' ')}`.toLowerCase();
          return tokens.length === 0 || tokens.some((tok) => hay.includes(tok));
        })
        .slice(0, 12)
        .map((j, idx) => {
          const desc = stripHtml(j.description || '');
          const applyUrl = String(j.apply_url || j.url || 'https://remoteok.com');
          return {
            id: `remoteok-${j.id || idx}`,
            source: 'remoteok' as const,
            title: String(j.position || query.role),
            company: String(j.company || 'RemoteOK Employer'),
            location: String(j.location || 'Remote / Worldwide'),
            url: applyUrl,
            applyUrl,
            salary: j.salary_min && j.salary_max ? `$${j.salary_min}-$${j.salary_max}` : undefined,
            description: desc.slice(0, 700),
            contactEmail: extractEmailFromText(desc),
            tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : ['Remote'],
          };
        });
      return { source: 'remoteok', items };
    } catch {
      return { source: 'remoteok', items: [] };
    }
  }

  /**
   * Official WeWorkRemotely Public RSS Feed (zero API key required).
   */
  private async fetchWeWorkRemotely(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const res = await fetch('https://weworkremotely.com/remote-jobs.rss', {
        headers: { 'User-Agent': 'NexoraAI/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return { source: 'weworkremotely', items: [] };
      const xml = await res.text();
      const parsed = this.parseRssItems(xml);
      const tokens = `${query.role} ${(query.skills || []).slice(0, 6).join(' ')}`
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((t) => t.length >= 3 && !GENERIC_ROLE_WORDS.has(t));

      const items = parsed
        .filter((item) => {
          const hay = `${item.title} ${item.categories.join(' ')}`.toLowerCase();
          return tokens.length === 0 || tokens.some((tok) => hay.includes(tok));
        })
        .slice(0, 12)
        .map((item, idx) => {
          const parts = item.title.split(':');
          const company = parts.length > 1 ? parts[0]!.trim() : 'Remote Employer';
          const title = parts.length > 1 ? parts.slice(1).join(':').trim() : item.title;
          const cleanDesc = stripHtml(item.description);
          return {
            id: `wwr-${idx}-${Date.now()}`,
            source: 'weworkremotely' as const,
            title,
            company,
            location: 'Remote / Worldwide',
            url: item.link,
            applyUrl: item.link,
            description: cleanDesc.slice(0, 700),
            contactEmail: extractEmailFromText(item.description) || extractEmailFromText(cleanDesc),
            tags: ['Remote', ...item.categories.slice(0, 4)],
          };
        });
      return { source: 'weworkremotely', items };
    } catch {
      return { source: 'weworkremotely', items: [] };
    }
  }

  private async fetchJobicy(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const tag = (query.skills?.[0] || query.role.split(' ')[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!tag) return { source: 'jobicy', items: [] };
      const url = `https://jobicy.com/api/v2/remote-jobs?count=12&tag=${encodeURIComponent(tag)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return { source: 'jobicy', items: [] };
      const json = (await res.json()) as { jobs?: Array<Record<string, any>> };
      const items = (json.jobs || []).slice(0, 10).map((j, idx) => {
        const company = j.companyName || 'Global Remote Co';
        const applyUrl = j.url || 'https://jobicy.com';
        const desc = stripHtml(j.jobExcerpt || j.jobDescription || '');
        return {
          id: `jobicy-${j.id || idx}`,
          source: 'jobicy' as const,
          title: j.jobTitle || query.role,
          company,
          location: j.jobGeo || 'Remote',
          url: applyUrl,
          applyUrl,
          description: desc.slice(0, 500),
          contactEmail: extractEmailFromText(desc),
          tags: Array.isArray(j.jobIndustry) ? j.jobIndustry : [],
        };
      });
      return { source: 'jobicy', items };
    } catch {
      return { source: 'jobicy', items: [] };
    }
  }

  /**
   * Searches DuckDuckGo HTML for a specific company's real website & hiring/contact email
   * (e.g. "Lesedi Cleaning" -> info@lesedicleaning.co.za, "MTN" -> info@mtn.co.za).
   */
  private async findRealCompanyEmailViaWeb(
    companyName: string,
    targetCountry?: string,
  ): Promise<{ email?: string; websiteUrl?: string } | null> {
    try {
      const candidateSites: string[] = [];

      // 0. If the company name itself is a domain (e.g. "Lemon.io", "Turing.com"), check it directly first!
      const cleanBrand = companyName.trim();
      if (/^[a-z0-9-]+\.[a-z]{2,10}$/i.test(cleanBrand)) {
        candidateSites.push(`https://${cleanBrand.toLowerCase()}`);
      }

      const countryHint =
        targetCountry && !/anywhere|worldwide|global|remote/i.test(targetCountry) ? targetCountry : '';
      const q = `"${cleanBrand}" ${countryHint} careers OR contact email`.trim();

      // 1. Try Bing HTML search first (much higher rate-limit tolerance than DuckDuckGo HTML)
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}${getBingMarketParams(countryHint)}`;
      const bing = await fetchHtmlQuick(bingUrl, 3500);
      if (bing) {
        const bingSnippetEmail = extractEmailFromText(stripHtml(bing.html));
        const bingLinks = [...bing.html.matchAll(/<h2[^>]*><a[^>]+href="(https?:\/\/[^"]+)"/gi)]
          .map((m) => decodeSearchResultUrl(m[1]))
          .filter((u) => u.startsWith('http') && !isAggregatorOrNoiseHost(u) && domainMatchesCompany(u, cleanBrand));
        if (bingSnippetEmail && domainMatchesCompany(bingSnippetEmail, cleanBrand)) {
          return { email: bingSnippetEmail, websiteUrl: bingLinks[0] || candidateSites[0] };
        }
        candidateSites.push(...bingLinks.slice(0, 2));
      }

      // 2. Fallback to DuckDuckGo HTML if Bing returned no matching company links
      if (candidateSites.length === 0) {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
        const ddg = await fetchHtmlQuick(ddgUrl, 3500);
        if (ddg) {
          const snippetEmail = extractEmailFromText(stripHtml(ddg.html));
          const ddgLinks = [...ddg.html.matchAll(/class="result__a"[^>]*href="([^"]+)"/gi)]
            .map((m) => unwrapDuckDuckGoUrl(m[1]))
            .filter((u) => u.startsWith('http') && !isAggregatorOrNoiseHost(u) && domainMatchesCompany(u, cleanBrand));
          if (snippetEmail && domainMatchesCompany(snippetEmail, cleanBrand)) {
            return { email: snippetEmail, websiteUrl: ddgLinks[0] };
          }
          candidateSites.push(...ddgLinks.slice(0, 2));
        }
      }

      // 3. Scrape top matching company site + /contact, /careers
      const uniqueSites = Array.from(new Set(candidateSites)).slice(0, 2);
      for (const siteUrl of uniqueSites) {
        const page = await fetchHtmlQuick(siteUrl, 3000);
        if (!page) continue;
        const found = extractEmailFromText(page.html) || extractEmailFromText(stripHtml(page.html));
        if (found && domainMatchesCompany(found, cleanBrand)) {
          return { email: found, websiteUrl: page.finalUrl };
        }
        try {
          const origin = new URL(page.finalUrl).origin;
          for (const sub of ['/contact', '/careers']) {
            const subPage = await fetchHtmlQuick(`${origin}${sub}`, 2500);
            if (!subPage) continue;
            const subEmail =
              extractEmailFromText(subPage.html) || extractEmailFromText(stripHtml(subPage.html));
            if (subEmail && domainMatchesCompany(subEmail, cleanBrand)) {
              return { email: subEmail, websiteUrl: page.finalUrl };
            }
          }
        } catch {
          // ignore
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Discovers real hiring companies in the user's industry & location directly via web search
   * (e.g. cleaning companies, construction firms, banks, telecoms) and scrapes their real emails.
   */
  private async fetchDirectIndustryCompanies(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const country =
        query.targetCountry && !/anywhere|worldwide|global|remote/i.test(query.targetCountry)
          ? query.targetCountry
          : '';
      const pageNum = Math.max(1, query.page ?? 1);
      const firstOffset = (pageNum - 1) * 10 + 1;
      const q = `${query.role} ${country} company OR workshop OR services contact email`.trim();
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&first=${firstOffset}${getBingMarketParams(country)}`;
      const bing = await fetchHtmlQuick(bingUrl, 5000);
      if (!bing) return { source: 'company_direct', items: [] };

      const linkMatches = [
        ...bing.html.matchAll(/<h2[^>]*><a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
      ];

      const targets: Array<{ url: string; title: string }> = [];
      const seenHosts = new Set<string>();
      for (const m of linkMatches) {
        const url = decodeSearchResultUrl(m[1]);
        if (!url.startsWith('http') || isAggregatorOrNoiseHost(url)) continue;
        try {
          const host = new URL(url).hostname.replace(/^www\./, '');
          if (seenHosts.has(host)) continue;
          seenHosts.add(host);
          targets.push({ url, title: stripHtml(m[2]) });
          if (targets.length >= 10) break;
        } catch {
          // ignore
        }
      }

      const settled = await Promise.allSettled(
        targets.map(async (t, idx) => {
          const page = await fetchHtmlQuick(t.url, 3800);
          if (!page) return null;
          const cleanText = stripHtml(page.html);
          let email = extractEmailFromText(page.html) || extractEmailFromText(cleanText);
          if (!email) {
            try {
              const origin = new URL(page.finalUrl).origin;
              for (const sub of ['/contact', '/contact-us', '/careers']) {
                const contactPage = await fetchHtmlQuick(`${origin}${sub}`, 2800);
                if (!contactPage) continue;
                email =
                  extractEmailFromText(contactPage.html) ||
                  extractEmailFromText(stripHtml(contactPage.html));
                if (email) break;
              }
            } catch {
              // ignore
            }
          }
          if (!isValidCompanyEmail(email)) return null;

          const companyName =
            t.title.split(/[|\-–—:]/)[0]?.trim() ||
            new URL(page.finalUrl).hostname.replace(/^www\./, '');
          return {
            id: `direct-p${pageNum}-${idx}-${Date.now()}`,
            source: 'company_direct' as const,
            title: `${query.role} — Direct Application`,
            company: companyName.slice(0, 70),
            location: query.targetCountry || 'Direct Employer',
            url: page.finalUrl,
            applyUrl: page.finalUrl,
            description: cleanText.slice(0, 500),
            contactEmail: email,
            tags: [query.role],
          };
        }),
      );

      const items = settled
        .filter(
          (r): r is PromiseFulfilledResult<NonNullable<any>> =>
            r.status === 'fulfilled' && Boolean(r.value),
        )
        .map((r) => r.value);

      return { source: 'company_direct', items };
    } catch {
      return { source: 'company_direct', items: [] };
    }
  }

  private async fetchTheMuse(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const url = 'https://www.themuse.com/api/public/jobs?category=Software%20Engineering&page=1';
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return { source: 'themuse', items: [] };
      const json = (await res.json()) as { results?: Array<Record<string, any>> };
      const items = (json.results || []).slice(0, 8).map((j, idx) => {
        const company = j.company?.name || 'Tech Employer';
        const applyUrl = j.refs?.landing_page || 'https://www.themuse.com';
        const desc = stripHtml(j.contents || '');
        const locs = Array.isArray(j.locations)
          ? j.locations.map((l: any) => l?.name).filter(Boolean).join(', ')
          : '';
        return {
          id: `themuse-${j.id || idx}`,
          source: 'themuse' as const,
          title: j.name || query.role,
          company,
          location: locs || 'USA / Global',
          url: applyUrl,
          applyUrl,
          description: desc.slice(0, 500),
          contactEmail: extractEmailFromText(desc),
          tags: [],
        };
      });
      return { source: 'themuse', items };
    } catch {
      return { source: 'themuse', items: [] };
    }
  }
}

export const jobSearchApiService = new JobSearchApiService();
