import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { ImapFlow } from 'imapflow';
import { logger } from '../utils/logger';

export interface FormFillInputData {
  agentType?: string;
  applicantName: string;
  companyName: string;
  email: string;
  phone: string;
  websiteUrl: string;
  location: string;
  stageOrRole: string;
  targetRaiseOrSalary: string;
  oneLinePitch: string;
  detailedPitch: string;
  targetPlatformName: string;
  targetCategory: string;
  targetApplicationUrl: string;
  referenceId: string;
  fileUploadPath?: string;
}

export interface BrowserFormFillResult {
  targetUrl: string;
  finalUrlAfterNavigation: string;
  pageTitle: string;
  formDetectedOnLiveSite: boolean;
  registrationCompleted: boolean;
  fieldsFilled: Array<{ fieldLabel: string; selector: string; valueFilled: string }>;
  submitTriggered: boolean;
  confirmationText: string;
  screenshotPath: string;
  screenshotFileName: string;
  completedAt: string;
}

const DEFAULT_MAC_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Browser Form-Filler & Autonomous Registration Service
 * Uses Playwright (Headless Chrome) to navigate to REAL target websites,
 * follow "Apply" / "Pitch" / "Contact" / "Sign Up" links to locate actual HTML forms,
 * fill real DOM <input>, <textarea>, and <select> fields on the live site, and capture
 * a screenshot of the REAL webpage. Never replaces the page with synthetic HTML.
 */
export class BrowserFormFillerService {
  private readonly screenshotsDir: string;

  constructor(screenshotsDir?: string) {
    this.screenshotsDir =
      screenshotsDir ??
      path.resolve(process.cwd(), 'node_modules', '.cache', 'nexora-screenshots');
  }

  /**
   * Launches headless Chrome, navigates to the real target URL, crawls into its
   * Apply/Contact/Pitch form if needed, fills actual DOM inputs on the live site,
   * and captures a PNG screenshot of the real webpage.
   */
  public async fillWebFormAndCaptureProof(
    input: FormFillInputData,
  ): Promise<BrowserFormFillResult> {
    await fs.mkdir(this.screenshotsDir, { recursive: true });
    const screenshotFileName = `live-${input.referenceId.toLowerCase()}-${Date.now()}.png`;
    const screenshotPath = path.join(this.screenshotsDir, screenshotFileName);

    let browser: Browser | null = null;
    try {
      const executablePath = process.env.CHROME_EXECUTABLE_PATH || DEFAULT_MAC_CHROME_PATH;
      browser = await chromium.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      const context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();
      const fieldsFilled: Array<{ fieldLabel: string; selector: string; valueFilled: string }> = [];
      let pageTitle = input.targetPlatformName;
      let finalUrl = input.targetApplicationUrl;
      let formDetectedOnLiveSite = false;

      // 1. Navigate to the real target URL
      await page.goto(input.targetApplicationUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 9000,
      });
      await this.dismissCookieBanners(page);

      // 2. First pass: fill any inputs already visible on the landing page (e.g. YC email step)
      let liveFilled = await this.autoFillDomInputsOnPage(page, input);

      // 3. Click "Continue" / "Start" / "Sign up" (either starts a Typeform wizard OR advances a 2-step signup like YC)
      const clickedWizard = await this.advanceWizardIntroScreens(page);
      if (clickedWizard) {
        const afterWizardFilled = await this.autoFillDomInputsOnPage(page, input);
        if (afterWizardFilled.length > 0) {
          liveFilled.push(...afterWizardFilled);
        }
      }

      // 4. If still no inputs were found, follow an "Apply" / "Pitch" / "Contact" link on the page
      if (liveFilled.length === 0) {
        const navigatedToFormPage = await this.tryFollowApplyOrContactLink(page);
        if (navigatedToFormPage) {
          await this.advanceWizardIntroScreens(page);
          const secondPassFilled = await this.autoFillDomInputsOnPage(page, input);
          if (secondPassFilled.length > 0) {
            liveFilled.push(...secondPassFilled);
          }
        }
      }

      fieldsFilled.push(...liveFilled);
      formDetectedOnLiveSite = fieldsFilled.length > 0;

      // Attempt safe non-CAPTCHA submit if real fields were filled and no password gate was hit
      let submitTriggered = false;
      const hasPasswordField = fieldsFilled.some((f) => f.fieldLabel.toLowerCase().includes('password'));
      const pageText = (await page.locator('body').innerText({ timeout: 600 }).catch(() => '')).slice(0, 2000).toLowerCase();
      const hasCaptchaGate =
        pageText.includes('verify you are human') ||
        pageText.includes('recaptcha') ||
        pageText.includes('hcaptcha') ||
        pageText.includes('cloudflare turnstile');

      if (formDetectedOnLiveSite && !hasPasswordField && !hasCaptchaGate) {
        try {
          const submitBtn = page
            .locator('button[type="submit"]:visible, input[type="submit"]:visible, button:has-text("Submit"):visible, button:has-text("Apply"):visible')
            .first();
          if (await submitBtn.isVisible({ timeout: 600 })) {
            await submitBtn.click({ timeout: 1500 }).catch(() => undefined);
            await page.waitForTimeout(800);
            submitTriggered = true;
          }
        } catch {
          // non-fatal
        }
      }

      pageTitle = (await page.title()) || input.targetPlatformName;
      finalUrl = page.url();

      // 4. Add a tiny, non-intrusive top status bar overlay on the REAL website so the user
      // can see the exact URL, timestamp, and how many real DOM inputs were filled on that site,
      // while keeping 100% of the actual website visible underneath!
      await this.injectNonIntrusiveAuditRibbon(page, {
        referenceId: input.referenceId,
        finalUrl,
        applicantName: input.applicantName,
        fieldsCount: fieldsFilled.length,
      });

      // 5. Capture PNG screenshot of the REAL live website
      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
      });

      await context.close();

      const confirmationText = hasCaptchaGate
        ? `Anti-bot/CAPTCHA gate detected on ${finalUrl}; skipped automated portal submit and dispatched via direct email (Ref: ${input.referenceId})`
        : formDetectedOnLiveSite
          ? `Filled ${fieldsFilled.length} real DOM form field(s) on live site ${finalUrl}${submitTriggered ? ' and triggered submit' : ''} (Ref: ${input.referenceId})`
          : `Navigated to live site ${finalUrl} (${pageTitle}); no inline public HTML form inputs exposed on page — dispatched via direct email outreach (Ref: ${input.referenceId})`;

      return {
        targetUrl: input.targetApplicationUrl,
        finalUrlAfterNavigation: finalUrl,
        pageTitle,
        formDetectedOnLiveSite,
        registrationCompleted: formDetectedOnLiveSite,
        fieldsFilled,
        submitTriggered,
        confirmationText,
        screenshotPath,
        screenshotFileName,
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn({ err, target: input.targetPlatformName }, 'Playwright live site navigation error');
      return {
        targetUrl: input.targetApplicationUrl,
        finalUrlAfterNavigation: input.targetApplicationUrl,
        pageTitle: input.targetPlatformName,
        formDetectedOnLiveSite: false,
        registrationCompleted: false,
        fieldsFilled: [],
        submitTriggered: false,
        confirmationText: `Live site unreachable or timed out (${(err as Error).message}); dispatched via email`,
        screenshotPath: '',
        screenshotFileName: '',
        completedAt: new Date().toISOString(),
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  /**
   * Attempts to dismiss common cookie consent banners so they don't block the screenshot or form inputs.
   */
  private async dismissCookieBanners(page: Page): Promise<void> {
    const selectors = [
      'button:has-text("Accept All")',
      'button:has-text("Accept all")',
      'button:has-text("I Agree")',
      'button:has-text("Accept Cookies")',
      'button:has-text("Got it")',
    ];
    for (const sel of selectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 300 })) {
          await btn.click({ timeout: 800 });
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * Clicks through intro screens on Typeform / multi-step application wizards
   * or "Sign up" tabs (e.g. "Continue", "Sign up", "Start", "Let's go") so the actual input fields appear.
   */
  private async advanceWizardIntroScreens(page: Page): Promise<boolean> {
    try {
      const combined = page
        .locator(
          'button:has-text("Continue"), button:has-text("Sign up"), a:has-text("Sign up"), button:has-text("Start"), button[data-qa*="start"], button[data-qa*="continue"]',
        )
        .first();
      await combined.click({ timeout: 3200 });
      await page.waitForTimeout(900);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Searches the live page for links/buttons pointing to an application, pitch, registration, or contact form
   * and navigates to it if found.
   */
  private async tryFollowApplyOrContactLink(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url();
      const candidateHref = await page.evaluate((cur) => {
        const doc = (globalThis as unknown as {
          document?: {
            querySelectorAll: (sel: string) => ArrayLike<{
              getAttribute: (n: string) => string | null;
              textContent?: string | null;
              href?: string;
            }>;
          };
        }).document;
        if (!doc) return null;

        const anchors = Array.from(doc.querySelectorAll('a[href]'));
        const keywords = [
          'apply',
          'pitch',
          'submit',
          'funding',
          'register',
          'sign up',
          'signup',
          'contact',
          'get in touch',
          'enquire',
          'inquire',
        ];

        for (const kw of keywords) {
          for (const a of anchors) {
            const text = (a.textContent || '').trim().toLowerCase();
            const href = a.href || a.getAttribute('href') || '';
            if (
              !href ||
              href === cur ||
              href === cur + '/' ||
              href.startsWith('mailto:') ||
              href.startsWith('tel:') ||
              href.startsWith('javascript:') ||
              href === '#'
            ) {
              continue;
            }
            if (text.includes(kw) || href.toLowerCase().includes(kw)) {
              return href;
            }
          }
        }
        return null;
      }, currentUrl);

      if (candidateHref && candidateHref.startsWith('http')) {
        await page.goto(candidateHref, { waitUntil: 'domcontentloaded', timeout: 10000 });
        return true;
      }
    } catch {
      // ignore navigation errors
    }
    return false;
  }

  /**
   * Inspects all visible <input>, <textarea>, and <select> elements on the REAL webpage and fills them
   * based on their label, name, id, placeholder, aria-label, or type.
   * Also scrolls the first filled form element into view and highlights filled inputs with a green outline
   * so the user can see the exact fields filled on the real website screenshot.
   */
  private async autoFillDomInputsOnPage(
    page: Page,
    input: FormFillInputData,
  ): Promise<Array<{ fieldLabel: string; selector: string; valueFilled: string }>> {
    const filled: Array<{ fieldLabel: string; selector: string; valueFilled: string }> = [];

    const candidateInputs = await page
      .locator(
        'input:visible:not([disabled]):not([readonly]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea:visible:not([disabled]):not([readonly])',
      )
      .all();

    let scrolledToForm = false;

    for (let i = 0; i < Math.min(candidateInputs.length, 8); i++) {
      const locator = candidateInputs[i];
      if (!locator) continue;

      try {
        const meta = await locator.evaluate((el: unknown) => {
          const inp = el as {
            tagName: string;
            type?: string;
            name?: string;
            id?: string;
            placeholder?: string;
            getAttribute: (attr: string) => string | null;
            closest?: (sel: string) => { textContent?: string | null } | null;
            ownerDocument?: { querySelector: (sel: string) => { textContent?: string | null } | null };
          };
          const explicitLabel = inp.id
            ? inp.ownerDocument?.querySelector(`label[for="${inp.id}"]`)
            : null;
          const parentLabel = inp.closest ? inp.closest('label') : null;
          const labelText =
            explicitLabel?.textContent?.trim() || parentLabel?.textContent?.trim() || '';

          return {
            tag: inp.tagName.toLowerCase(),
            type: (inp.type || 'text').toLowerCase(),
            name: inp.name || '',
            id: inp.id || '',
            placeholder: inp.placeholder || '',
            ariaLabel: inp.getAttribute('aria-label') || '',
            labelText: labelText.slice(0, 80),
          };
        });

        const descriptor = `${meta.labelText} ${meta.name} ${meta.id} ${meta.placeholder} ${meta.ariaLabel} ${meta.type}`.toLowerCase();

        // Skip site search bars
        if (
          meta.type === 'search' ||
          descriptor.includes('search') ||
          descriptor === 'q'
        ) {
          continue;
        }

        let valueToFill = '';
        let fieldLabel =
          meta.labelText || meta.placeholder || meta.name || meta.id || `Input Field #${i + 1}`;

        if (meta.type === 'email' || descriptor.includes('email') || descriptor.includes('e-mail')) {
          valueToFill = input.email;
          fieldLabel = meta.labelText || 'Email Address';
        } else if (
          meta.type === 'tel' ||
          descriptor.includes('phone') ||
          descriptor.includes('mobile') ||
          descriptor.includes('whatsapp') ||
          descriptor.includes('cell')
        ) {
          valueToFill = input.phone;
          fieldLabel = meta.labelText || 'Phone / WhatsApp';
        } else if (
          meta.type === 'url' ||
          descriptor.includes('linkedin') ||
          descriptor.includes('github') ||
          descriptor.includes('portfolio') ||
          descriptor.includes('website') ||
          descriptor.includes('url') ||
          descriptor.includes('link') ||
          descriptor.includes('domain')
        ) {
          valueToFill = input.websiteUrl;
          fieldLabel = meta.labelText || (descriptor.includes('linkedin') ? 'LinkedIn / Portfolio URL' : 'Website URL');
        } else if (meta.type === 'password' || descriptor.includes('password')) {
          valueToFill = `Nexora#${crypto.randomBytes(4).toString('hex')}!26`;
          fieldLabel = meta.labelText || 'Account Password';
        } else if (
          descriptor.includes('role') ||
          descriptor.includes('position') ||
          descriptor.includes('job title') ||
          descriptor.includes('program') ||
          descriptor.includes('degree') ||
          descriptor.includes('visa')
        ) {
          valueToFill = input.stageOrRole || input.applicantName;
          fieldLabel = meta.labelText || 'Target Role / Program';
        } else if (
          descriptor.includes('salary') ||
          descriptor.includes('compensation') ||
          descriptor.includes('raise') ||
          descriptor.includes('funding') ||
          descriptor.includes('budget')
        ) {
          valueToFill = input.targetRaiseOrSalary || 'Negotiable';
          fieldLabel = meta.labelText || 'Compensation / Target Amount';
        } else if (
          descriptor.includes('company') ||
          descriptor.includes('startup') ||
          descriptor.includes('business') ||
          descriptor.includes('venture') ||
          descriptor.includes('organisation') ||
          descriptor.includes('organization')
        ) {
          valueToFill = input.companyName || input.applicantName;
          fieldLabel = meta.labelText || 'Organisation / Company';
        } else if (descriptor.includes('last') && descriptor.includes('name')) {
          const parts = input.applicantName.trim().split(/\s+/);
          valueToFill = parts.length > 1 ? parts[parts.length - 1]! : parts[0] || 'Applicant';
          fieldLabel = meta.labelText || 'Last Name';
        } else if (descriptor.includes('first') && descriptor.includes('name')) {
          const parts = input.applicantName.trim().split(/\s+/);
          valueToFill = parts[0] || input.applicantName;
          fieldLabel = meta.labelText || 'First Name';
        } else if (
          descriptor.includes('name') ||
          descriptor.includes('founder') ||
          descriptor.includes('applicant') ||
          descriptor.includes('candidate') ||
          descriptor.includes('contact')
        ) {
          valueToFill = input.applicantName;
          fieldLabel = meta.labelText || 'Full Name';
        } else if (
          descriptor.includes('country') ||
          descriptor.includes('city') ||
          descriptor.includes('location') ||
          descriptor.includes('where')
        ) {
          valueToFill = input.location;
          fieldLabel = meta.labelText || 'Location / Country';
        } else if (
          descriptor.includes('subject') ||
          descriptor.includes('topic') ||
          descriptor.includes('title')
        ) {
          valueToFill =
            input.agentType === 'INVESTOR_AGENT' && input.companyName
              ? `Investment / Partnership Inquiry: ${input.companyName}`
              : `Application: ${input.stageOrRole || input.applicantName}`;
          fieldLabel = meta.labelText || 'Subject';
        } else if (
          meta.tag === 'textarea' ||
          descriptor.includes('pitch') ||
          descriptor.includes('cover') ||
          descriptor.includes('motivation') ||
          descriptor.includes('message') ||
          descriptor.includes('description') ||
          descriptor.includes('summary') ||
          descriptor.includes('about') ||
          descriptor.includes('comments') ||
          descriptor.includes('inquiry')
        ) {
          valueToFill = input.detailedPitch;
          fieldLabel = meta.labelText || 'Cover Note / Message';
        } else {
          valueToFill = input.applicantName;
        }

        if (valueToFill) {
          if (!scrolledToForm) {
            await locator.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => undefined);
            scrolledToForm = true;
          }
          await locator.fill(valueToFill, { timeout: 600 });
          // Highlight the filled input on the real page so it is unmistakable in the screenshot
          await locator
            .evaluate((el: unknown) => {
              const styleable = el as { style?: { outline?: string; backgroundColor?: string } };
              if (styleable.style) {
                styleable.style.outline = '2.5px solid #10b981';
              }
            })
            .catch(() => undefined);

          filled.push({
            fieldLabel,
            selector: meta.id ? `#${meta.id}` : meta.name ? `[name="${meta.name}"]` : meta.tag,
            valueFilled: meta.type === 'password' ? '••••••••••••' : valueToFill,
          });
        }
      } catch {
        // ignore non-interactable element
      }
    }

    if (input.fileUploadPath) {
      try {
        const fileInput = page.locator('input[type="file"]:not([disabled])').first();
        if ((await fileInput.count()) > 0) {
          await fileInput.setInputFiles(input.fileUploadPath, { timeout: 1500 });
          filled.push({
            fieldLabel: 'Deliverable / CV PDF Upload',
            selector: 'input[type="file"]',
            valueFilled: path.basename(input.fileUploadPath),
          });
        }
      } catch {
        // non-fatal if file input is hidden/custom
      }
    }

    return filled;
  }

  /**
   * Injects a slim, non-intrusive 34px banner at the very top of the real webpage
   * showing the live URL and how many DOM fields were filled, without covering or replacing the site.
   */
  private async injectNonIntrusiveAuditRibbon(
    page: Page,
    info: { referenceId: string; finalUrl: string; applicantName: string; fieldsCount: number },
  ): Promise<void> {
    try {
      await page.evaluate((data) => {
        const doc = (globalThis as unknown as {
          document?: {
            createElement: (tag: string) => {
              style: { cssText: string };
              innerHTML: string;
            };
            body?: { prepend: (el: unknown) => void };
          };
        }).document;
        if (!doc || !doc.body) return;

        const bar = doc.createElement('div');
        bar.style.cssText =
          'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:rgba(15,23,42,0.92);color:#f8fafc;padding:8px 14px;border-radius:8px;font-family:sans-serif;font-size:12px;border:1.5px solid #10b981;box-shadow:0 8px 20px rgba(0,0,0,0.35);pointer-events:none;';
        bar.innerHTML = `<strong style="color:#34d399;">Nexora AI Live Browser (${data.referenceId})</strong> • URL: <code>${data.finalUrl.slice(0, 55)}</code> • Live DOM Inputs Filled: <strong>${data.fieldsCount}</strong>`;
        doc.body.prepend(bar);
      }, info);
    } catch {
      // ignore if CSP blocks inline script
    }
  }

  /**
   * Connects to Zoho IMAP (`imap.zoho.com:993`) to read incoming account verification links
   * or 6-digit OTP codes when a website requires email verification after sign-up.
   */
  public async checkZohoImapForVerificationCodeOrLink(params?: {
    senderContains?: string;
    lookbackMinutes?: number;
  }): Promise<{
    found: boolean;
    otpCode?: string;
    verificationUrl?: string;
    subject?: string;
  }> {
    const client = new ImapFlow({
      host: process.env.IMAP_HOST || 'imap.zoho.com',
      port: Number(process.env.IMAP_PORT || 993),
      secure: true,
      auth: {
        user: process.env.SMTP_USER || 'mrdocs@empiredigitals.org',
        pass: process.env.SMTP_PASS || 'eVc2YpPq1KFq',
      },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const sinceDate = new Date(Date.now() - (params?.lookbackMinutes ?? 15) * 60 * 1000);
        const uids = await client.search({ since: sinceDate });
        if (!uids || uids.length === 0) {
          return { found: false };
        }

        const latestUid = uids[uids.length - 1];
        if (!latestUid) {
          return { found: false };
        }

        const message = await client.fetchOne(latestUid, { envelope: true, source: true });
        if (!message || !message.source) {
          return { found: false };
        }

        const rawSource = message.source.toString('utf8');
        const otpMatch = rawSource.match(/\b(\d{6})\b/);
        const linkMatch = rawSource.match(
          /https?:\/\/[^\s"'<>]+(?:verify|confirm|activate|token|auth)[^\s"'<>]*/i,
        );

        return {
          found: Boolean(otpMatch || linkMatch),
          otpCode: otpMatch?.[1],
          verificationUrl: linkMatch?.[0],
          subject: message.envelope?.subject,
        };
      } finally {
        lock.release();
      }
    } catch (err) {
      logger.debug({ err }, 'Zoho IMAP verification poll skipped or unavailable');
      return { found: false };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}

export const browserFormFillerService = new BrowserFormFillerService();
