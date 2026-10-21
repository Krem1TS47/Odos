import { AtsFingerprint, DetectionResult, JobPostingMetadata } from './types';
import { ATS_FINGERPRINTS } from './fingerprints';

/**
 * Parses JSON-LD scripts on the page to extract JobPosting schema metadata.
 * Handles top-level objects, arrays, and `@graph` structures.
 */
export function extractJobPosting(doc: Document): JobPostingMetadata | undefined {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));

  for (const script of scripts) {
    const rawContent = script.textContent?.trim();
    if (!rawContent) continue;

    try {
      const parsed = JSON.parse(rawContent);
      const candidates: any[] = [];

      if (Array.isArray(parsed)) {
        candidates.push(...parsed);
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed['@graph'])) {
          candidates.push(...parsed['@graph']);
        }
        candidates.push(parsed);
      }

      for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;

        const itemType = item['@type'];
        const isJobPosting =
          itemType === 'JobPosting' ||
          (Array.isArray(itemType) && itemType.includes('JobPosting'));

        if (isJobPosting) {
          let locationStr: string | undefined = undefined;

          if (item.jobLocation) {
            const loc = Array.isArray(item.jobLocation) ? item.jobLocation[0] : item.jobLocation;
            if (loc && typeof loc === 'object') {
              if (typeof loc.address === 'string') {
                locationStr = loc.address;
              } else if (loc.address && typeof loc.address === 'object') {
                const parts = [
                  loc.address.streetAddress,
                  loc.address.addressLocality,
                  loc.address.addressRegion,
                  loc.address.postalCode,
                  loc.address.addressCountry
                ].filter(Boolean);
                if (parts.length > 0) locationStr = parts.join(', ');
              }
            }
          }

          if (!locationStr && (item.jobLocationType === 'TELECOMMUTE' || /remote/i.test(String(item.description || '')))) {
            locationStr = 'Remote';
          }

          let companyStr: string | undefined = undefined;
          if (item.hiringOrganization) {
            if (typeof item.hiringOrganization === 'string') {
              companyStr = item.hiringOrganization;
            } else if (typeof item.hiringOrganization === 'object') {
              companyStr = item.hiringOrganization.name;
            }
          }

          let descriptionStr: string | undefined = undefined;
          if (item.description && typeof item.description === 'string') {
            descriptionStr = item.description;
          }

          return {
            title: item.title || item.name || undefined,
            company: companyStr,
            location: locationStr,
            description: descriptionStr,
            employmentType: Array.isArray(item.employmentType) ? item.employmentType.join(', ') : item.employmentType,
            datePosted: item.datePosted
          };
        }
      }
    } catch {
      // Ignore invalid JSON-LD blocks
    }
  }

  return undefined;
}

/**
 * Checks whether the page DOM contains an application form.
 */
export function isApplicationFormPresent(doc: Document, detectedAts: string | null): boolean {
  // 1. ATS-specific application markers
  if (detectedAts === 'greenhouse') {
    if (
      doc.querySelector('form#application_form') ||
      doc.querySelector('#first_name, input[name="first_name"], input[name="job_application[first_name]"]') ||
      doc.querySelector('input[id^="question_"]')
    ) {
      return true;
    }
  }

  if (detectedAts === 'lever') {
    if (
      doc.querySelector('form#application-form, .application-form') ||
      (doc.querySelector('input[name="name"]') && doc.querySelector('input[name="email"]'))
    ) {
      return true;
    }
  }

  if (detectedAts === 'ashby') {
    if (
      doc.querySelector('#_systemfield_name, input[name="_systemfield_name"]') ||
      doc.querySelector('#_systemfield_email, input[name="_systemfield_email"]')
    ) {
      return true;
    }
  }

  if (detectedAts === 'workday') {
    if (
      doc.querySelector('[data-automation-id="legalNameSection_firstName"]') ||
      doc.querySelector('[data-automation-id="file-upload-input-ref"]')
    ) {
      return true;
    }
  }

  // 2. Generic application heuristic:
  // Container/form with a file upload input AND at least one of name/email/phone
  const fileInputs = doc.querySelectorAll('input[type="file"]');
  if (fileInputs.length > 0) {
    const hasContact =
      doc.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]') ||
      doc.querySelector('input[name*="name" i], input[id*="name" i]') ||
      doc.querySelector('input[type="tel"], input[name*="phone" i], input[id*="phone" i]');

    if (hasContact) return true;
  }

  return false;
}

/**
 * Detects the ATS and classifies the page type.
 */
export function detectAts(
  urlOrString: URL | string,
  doc: Document,
  fingerprints: AtsFingerprint[] = ATS_FINGERPRINTS
): DetectionResult {
  let urlObj: URL;
  try {
    urlObj = typeof urlOrString === 'string' ? new URL(urlOrString) : urlOrString;
  } catch {
    urlObj = new URL('https://unknown.host/');
  }

  // Pre-collect script and iframe sources once for efficiency
  const scriptSources = Array.from(doc.querySelectorAll('script[src]'))
    .map((s) => s.getAttribute('src') || '')
    .filter(Boolean);

  const importMapContents = Array.from(doc.querySelectorAll('script[type="importmap"]'))
    .map((s) => s.textContent || '');

  const iframeSources = Array.from(doc.querySelectorAll('iframe[src]'))
    .map((f) => f.getAttribute('src') || '')
    .filter(Boolean);

  let bestAts: string | null = null;
  let bestScore = 0;
  let bestFingerprint: AtsFingerprint | null = null;
  let bestMatchedSignals: string[] = [];

  for (const fp of fingerprints) {
    let score = 0;
    const currentMatches: string[] = [];

    for (const signal of fp.signals) {
      let matched = false;

      switch (signal.kind) {
        case 'host':
          if (signal.pattern.test(urlObj.hostname)) {
            matched = true;
            currentMatches.push(`host:${urlObj.hostname}`);
          }
          break;

        case 'urlParam':
          if (urlObj.searchParams.has(signal.name)) {
            matched = true;
            currentMatches.push(`urlParam:${signal.name}`);
          }
          break;

        case 'dom':
          try {
            if (doc.querySelector(signal.selector)) {
              matched = true;
              currentMatches.push(`dom:${signal.selector}`);
            }
          } catch {
            // Ignore invalid CSS selector if any
          }
          break;

        case 'scriptSrc': {
          const matchingSrc =
            scriptSources.find((src) => signal.pattern.test(src)) ||
            (importMapContents.some((content) => signal.pattern.test(content)) ? 'importmap:greenhouse' : null);

          if (matchingSrc) {
            matched = true;
            currentMatches.push(`scriptSrc:${matchingSrc}`);
          }
          break;
        }

        case 'iframeSrc': {
          const matchingIframe = iframeSources.find((src) => signal.pattern.test(src));
          if (matchingIframe) {
            matched = true;
            currentMatches.push(`iframeSrc:${matchingIframe}`);
          }
          break;
        }
      }

      if (matched) {
        score += signal.weight;
      }
    }

    if (score >= fp.threshold && score > bestScore) {
      bestScore = score;
      bestAts = fp.id;
      bestFingerprint = fp;
      bestMatchedSignals = currentMatches;
    }
  }

  // Calculate confidence score (0.0 to 1.0)
  let confidence = 0;
  if (bestAts && bestFingerprint) {
    // Saturated confidence: threshold score gives ~0.65, 2x threshold gives 1.0
    const ratio = bestScore / (bestFingerprint.threshold * 2);
    confidence = Math.min(1.0, Math.max(0.6, Math.round(ratio * 100) / 100));
  }

  // Extract JSON-LD job posting
  const jobPosting = extractJobPosting(doc);

  // Classify page type
  let pageType: 'listing' | 'application' | 'unknown' = 'unknown';

  if (isApplicationFormPresent(doc, bestAts)) {
    pageType = 'application';
  } else if (
    jobPosting ||
    doc.querySelector('[data-automation-id="jobSearchPage"], .posting-page, #job-description, .job-description, h1.app-title')
  ) {
    pageType = 'listing';
  }

  return {
    ats: bestAts,
    confidence,
    matchedSignals: bestMatchedSignals,
    pageType,
    jobPosting
  };
}
