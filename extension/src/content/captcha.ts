/**
 * CAPTCHA Detector
 * Hard rule (Section 1): Never attempt to solve or bypass CAPTCHAs.
 * Detect hCaptcha, reCAPTCHA, and Cloudflare Turnstile and surface them
 * to the user to complete manually.
 */

export interface CaptchaDetection {
  present: boolean;
  type?: 'hCaptcha' | 'reCAPTCHA' | 'turnstile' | 'unknown';
}

export function detectPageCaptcha(doc: Document = document): CaptchaDetection {
  // 1. hCaptcha
  if (
    doc.querySelector(
      '.h-captcha, iframe[src*="hcaptcha.com"], [data-hcaptcha-widget-id], [name="h-captcha-response"], #hcaptcha'
    )
  ) {
    return { present: true, type: 'hCaptcha' };
  }

  // 2. Google reCAPTCHA
  if (
    doc.querySelector(
      '.g-recaptcha, iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"], #g-recaptcha-response, #recaptcha'
    )
  ) {
    return { present: true, type: 'reCAPTCHA' };
  }

  // 3. Cloudflare Turnstile
  if (
    doc.querySelector(
      '.cf-turnstile, iframe[src*="challenges.cloudflare.com"], [data-turnstile-sitekey], [name="cf-turnstile-response"]'
    )
  ) {
    return { present: true, type: 'turnstile' };
  }

  // 4. Generic data-sitekey marker
  if (doc.querySelector('[data-sitekey]')) {
    return { present: true, type: 'unknown' };
  }

  return { present: false };
}
