import { logger } from '../utils/logger';

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
  skills?: string[];
  targetCountry?: string;
  limit?: number;
}

function stripHtml(html: string): string {
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
  'domain.com',
  'yourdomain.com',
  'yourcompany.com',
  'placeholder.com',
  'acme.com',
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

function isValidCompanyEmail(email?: string): email is string {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(clean)) return false;
  if (/^(noreply|no-reply|donotreply|mailer-daemon|postmaster|support@|privacy@|legal@|dmca@|your\.email@|email@|user@|name@|test@)/i.test(clean)) {
    return false;
  }
  const domain = clean.split('@')[1] || '';
  if (isAggregatorOrNoiseHost(domain)) return false;
  return true;
}

function extractEmailFromText(text: string): string | undefined {
  const mailtoMatches = [...text.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)]
    .map((m) => m[1])
    .filter(isValidCompanyEmail);
  const textMatches = (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
    .filter(isValidCompanyEmail);

  const candidates = Array.from(new Set([...mailtoMatches, ...textMatches]));
  if (candidates.length === 0) return undefined;

  // Prefer hiring/careers/HR/info/contact addresses over random personal/other addresses
  const preferred = candidates.find((e) =>
    /^(careers|jobs|hr|recruitment|recruit|talent|hiring|apply|info|contact|admin|enquiries|hello)@/i.test(e),
  );
  return preferred || candidates[0];
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

async function fetchHtmlQuick(url: string, timeoutMs = 4500): Promise<{ finalUrl: string; html: string } | null> {
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

export function scoreJobListing(
  job: Omit<JobApiListing, 'matchScore'>,
  query: JobSearchQuery,
): number {
  let score = 10;
  const titleLower = job.title.toLowerCase();
  const bodyLower = `${job.title} ${job.description} ${job.tags.join(' ')}`.toLowerCase();
  const locLower = job.location.toLowerCase();

  const roleTokens = query.role
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  for (const token of roleTokens) {
    if (titleLower.includes(token)) score += 15;
    else if (bodyLower.includes(token)) score += 5;
  }

  for (const skill of query.skills ?? []) {
    const s = skill.toLowerCase().trim();
    if (s.length >= 2 && bodyLower.includes(s)) {
      score += 8;
    }
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

    const tasks: Array<Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }>> = [
      this.fetchDirectIndustryCompanies(query),
      this.fetchRemotive(query),
      this.fetchArbeitnow(query),
      this.fetchJobicy(query),
      this.fetchTheMuse(query),
    ];

    if (process.env.RAPIDAPI_KEY) {
      tasks.push(this.fetchIndeedViaJSearch(query, process.env.RAPIDAPI_KEY));
    }
    if (process.env.INDEED_PUBLISHER_ID) {
      tasks.push(this.fetchIndeedPublisher(query, process.env.INDEED_PUBLISHER_ID));
    }
    if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
      tasks.push(this.fetchAdzuna(query, process.env.ADZUNA_APP_ID, process.env.ADZUNA_APP_KEY));
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

      scored.push({
        ...item,
        matchScore: scoreJobListing(item, query),
      });
    }

    scored.sort((a, b) => b.matchScore - a.matchScore);

    // Enrich top candidates by scraping Adzuna/job detail pages & searching real company websites for actual emails
    const candidatesToEnrich = scored.slice(0, Math.min(scored.length, Math.max(limit * 2, 10)));
    await Promise.allSettled(
      candidatesToEnrich.map(async (job) => {
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
              job.description = pageText.slice(0, 700);
            }
            if (detailPage.finalUrl && !isAggregatorOrNoiseHost(detailPage.finalUrl)) {
              job.applyUrl = detailPage.finalUrl;
            }
          }
        }

        // 2. If still no verified company email, search DuckDuckGo for the real company's contact/careers email
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
      }),
    );

    scored.sort((a, b) => b.matchScore - a.matchScore);

    // Prefer jobs that actually have a verified real company email!
    const withEmail = scored.filter((j) => isValidCompanyEmail(j.contactEmail));
    const finalJobs = (withEmail.length >= limit ? withEmail : [...withEmail, ...scored.filter((j) => !isValidCompanyEmail(j.contactEmail))]).slice(0, limit);

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
      const url = `https://api.adzuna.com/v1/api/jobs/${cc}/search/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&what=${encodeURIComponent(query.role)}&results_per_page=10`;
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
      const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(searchTerm)}&limit=12`;
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
      const roleToken = (query.role.split(' ')[0] || 'developer').toLowerCase();
      const filtered = (json.data || [])
        .filter((j) => {
          const t = `${j.title || ''} ${(j.tags || []).join(' ')}`.toLowerCase();
          return t.includes(roleToken) || t.includes('software') || t.includes('react') || t.includes('engineer');
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

  private async fetchJobicy(
    query: JobSearchQuery,
  ): Promise<{ source: string; items: Array<Omit<JobApiListing, 'matchScore'>> }> {
    try {
      const tag = (query.skills?.[0] || 'react').toLowerCase().replace(/[^a-z0-9]/g, '');
      const url = `https://jobicy.com/api/v2/remote-jobs?count=12&tag=${encodeURIComponent(tag || 'software')}`;
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
      const q = `"${companyName}" ${targetCountry || ''} email OR careers OR contact`;
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
      const ddg = await fetchHtmlQuick(ddgUrl, 4500);
      if (!ddg) return null;

      const snippetEmail = extractEmailFromText(stripHtml(ddg.html));
      const links = [...ddg.html.matchAll(/class="result__a"[^>]*href="([^"]+)"/gi)]
        .map((m) => unwrapDuckDuckGoUrl(m[1]))
        .filter((u) => u.startsWith('http') && !isAggregatorOrNoiseHost(u));

      if (snippetEmail) {
        return { email: snippetEmail, websiteUrl: links[0] };
      }

      for (const siteUrl of links.slice(0, 2)) {
        const page = await fetchHtmlQuick(siteUrl, 4000);
        if (!page) continue;
        const found = extractEmailFromText(page.html) || extractEmailFromText(stripHtml(page.html));
        if (found) {
          return { email: found, websiteUrl: page.finalUrl };
        }
        // Try /contact or /careers on the same origin
        try {
          const origin = new URL(page.finalUrl).origin;
          for (const sub of ['/contact', '/contact-us', '/careers']) {
            const subPage = await fetchHtmlQuick(`${origin}${sub}`, 3000);
            if (!subPage) continue;
            const subEmail =
              extractEmailFromText(subPage.html) || extractEmailFromText(stripHtml(subPage.html));
            if (subEmail) {
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
      const country = query.targetCountry || '';
      const q = `${query.role} company ${country} ("info@" OR "careers@" OR "hr@")`;
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
      const ddg = await fetchHtmlQuick(ddgUrl, 5000);
      if (!ddg) return { source: 'company_direct', items: [] };

      const linkMatches = [
        ...ddg.html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
      ];

      const targets: Array<{ url: string; title: string }> = [];
      const seenHosts = new Set<string>();
      for (const m of linkMatches) {
        const url = unwrapDuckDuckGoUrl(m[1]);
        if (!url.startsWith('http') || isAggregatorOrNoiseHost(url)) continue;
        try {
          const host = new URL(url).hostname.replace(/^www\./, '');
          if (seenHosts.has(host)) continue;
          seenHosts.add(host);
          targets.push({ url, title: stripHtml(m[2]) });
          if (targets.length >= 6) break;
        } catch {
          // ignore
        }
      }

      const settled = await Promise.allSettled(
        targets.map(async (t, idx) => {
          const page = await fetchHtmlQuick(t.url, 4000);
          if (!page) return null;
          const cleanText = stripHtml(page.html);
          let email = extractEmailFromText(page.html) || extractEmailFromText(cleanText);
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

          const companyName =
            t.title.split(/[|\-–—:]/)[0]?.trim() ||
            new URL(page.finalUrl).hostname.replace(/^www\./, '');
          return {
            id: `direct-${idx}-${Date.now()}`,
            source: 'company_direct' as const,
            title: `${query.role} — Direct Application`,
            company: companyName.slice(0, 70),
            location: query.targetCountry || 'Direct Employer',
            url: page.finalUrl,
            applyUrl: page.finalUrl,
            description: cleanText.slice(0, 450),
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
