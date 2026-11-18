import { logger } from '../utils/logger';

export interface JobApiListing {
  id: string;
  source: 'indeed_jsearch' | 'indeed_publisher' | 'adzuna' | 'remotive' | 'arbeitnow' | 'jobicy' | 'themuse';
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

function extractEmailFromText(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0];
}

function guessCompanyEmail(company: string, url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (
      host &&
      !['remotive.com', 'arbeitnow.com', 'jobicy.com', 'themuse.com', 'indeed.com', 'linkedin.com'].includes(host)
    ) {
      return `careers@${host}`;
    }
  } catch {
    // ignore URL parse error
  }
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company';
  return `careers@${slug}.com`;
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

    logger.info(
      { totalFound: scored.length, returned: Math.min(scored.length, limit), sourcesUsed },
      'Aggregated live jobs from Job Search APIs',
    );

    return {
      jobs: scored.slice(0, limit),
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
          contactEmail: extractEmailFromText(desc) || guessCompanyEmail(company, applyUrl),
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
          contactEmail: extractEmailFromText(desc) || guessCompanyEmail(company, applyUrl),
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
          contactEmail: extractEmailFromText(desc) || guessCompanyEmail(company, applyUrl),
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
          contactEmail: extractEmailFromText(desc) || guessCompanyEmail(company, applyUrl),
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
          contactEmail: extractEmailFromText(desc) || guessCompanyEmail(company, applyUrl),
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
          contactEmail: extractEmailFromText(desc) || guessCompanyEmail(company, applyUrl),
          tags: Array.isArray(j.jobIndustry) ? j.jobIndustry : [],
        };
      });
      return { source: 'jobicy', items };
    } catch {
      return { source: 'jobicy', items: [] };
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
          contactEmail: extractEmailFromText(desc) || guessCompanyEmail(company, applyUrl),
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
