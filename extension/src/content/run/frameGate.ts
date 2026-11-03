import { hostsEmbeddedAtsForm } from '../adapters';

/**
 * Does this frame hold an application form worth filling? Every frame of the tab receives
 * RUN_ODOS; only frames that pass answer it. A careers page that embeds the ATS in an iframe,
 * or a page with a newsletter box and a search field, must not be "filled".
 */
export function looksLikeApplicationForm(doc: Document): boolean {
  if (hostsEmbeddedAtsForm(doc) && doc.querySelectorAll('input:not([type="hidden"]), select, textarea').length < 6) return false;
  const visible = Array.from(
    doc.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="search"]), select, textarea, [role="combobox"]')
  );
  if (visible.length < 3) return false;
  return Boolean(
    doc.querySelector(
      'input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email"], input[type="file"], input[name*="name" i], input[id*="first" i], [data-automation-id*="legalName"], [data-automation-id^="formField-"]'
    )
  );
}
