/**
 * Repeatable Section & Dynamic Additions Manager for Odos
 * 
 * Handles job application forms that require clicking "+ Add" / "Add Another"
 * buttons to generate repeatable entries (Education, Work Experience, Websites)
 * before or during form autofill.
 * 
 * Invariant 1: Strictly verifies every clicked button is not a submit control.
 */

import { assertNotSubmitControl } from '../content/submitGuard';
import { Profile } from './models';
import { waitForCondition } from './dom';

/** Upper bound for a row to appear after clicking Add. */
export const ADD_ROW_WAIT_MS = 150;

export interface RepeatableSectionConfig {
  type: 'education' | 'experience' | 'website';
  containerSelector: string;
  itemSelector: string;
  addButtonSelector: string;
  textRegex?: RegExp;
}

export const REPEATABLE_CONFIGS: RepeatableSectionConfig[] = [
  // Workday Repeaters
  {
    type: 'education',
    containerSelector: '[data-automation-id="educationSection"]',
    itemSelector: '[data-automation-id="education-item"], [data-automation-id="educationSection"] [data-automation-id*="item"]',
    addButtonSelector: '[data-automation-id="educationSection"] button[data-automation-id="Add"], button[data-automation-id="addEducation"]',
    textRegex: /add\s*(another)?\s*(education|school)/i
  },
  {
    type: 'experience',
    containerSelector: '[data-automation-id="workExperienceSection"]',
    itemSelector: '[data-automation-id="workExperience-item"], [data-automation-id="workExperienceSection"] [data-automation-id*="item"]',
    addButtonSelector: '[data-automation-id="workExperienceSection"] button[data-automation-id="Add"], button[data-automation-id="addWorkExperience"]',
    textRegex: /add\s*(another)?\s*(work\s*experience|experience|job|employment)/i
  },
  {
    type: 'website',
    containerSelector: '[data-automation-id="websiteSection"], [data-automation-id="websitesSection"]',
    itemSelector: '[data-automation-id="website-item"], [data-automation-id="websiteSection"] [data-automation-id*="item"]',
    addButtonSelector: '[data-automation-id="websiteSection"] button[data-automation-id="Add"], button[data-automation-id="addWebsite"]',
    textRegex: /add\s*(another)?\s*(website|url|link)/i
  },

  // Greenhouse & Generic Repeaters
  {
    type: 'education',
    containerSelector: '.education-section, #education_section, [data-field="education"]',
    itemSelector: '.education-entry, .school-entry, [data-field="education_item"]',
    addButtonSelector: 'button.add-education, button[data-field="add-education"], a.add-education, a[data-field="education"]',
    textRegex: /add\s*(another)?\s*(education|school)/i
  },
  {
    type: 'experience',
    containerSelector: '.employment-section, #employment_section, [data-field="employment"]',
    itemSelector: '.employment-entry, .job-entry, [data-field="employment_item"]',
    addButtonSelector: 'button.add-employment, button[data-field="add-employment"], a.add-employment, a[data-field="employment"]',
    textRegex: /add\s*(another)?\s*(job|position|experience|employment)/i
  },
  {
    type: 'website',
    containerSelector: '.websites-section, #urls_section',
    itemSelector: '.website-entry, .url-entry',
    addButtonSelector: 'button.add-website, button.add-url, a.add-url',
    textRegex: /add\s*(another)?\s*(website|url|link)/i
  }
];

/**
 * Finds an "Add" button for a given section type using selectors or button text heuristics.
 */
export function findAddButton(doc: Document, config: RepeatableSectionConfig): HTMLButtonElement | HTMLElement | null {
  // 1. Selector match
  const directBtn = doc.querySelector<HTMLElement>(config.addButtonSelector);
  if (directBtn) {
    return directBtn;
  }

  // 2. Container search
  const container = doc.querySelector(config.containerSelector);
  if (container) {
    const btns = Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]'));
    for (const b of btns) {
      const text = (b.textContent || b.getAttribute('aria-label') || '').trim();
      if (config.textRegex && config.textRegex.test(text)) {
        return b;
      }
      if (b.getAttribute('data-automation-id') === 'Add' || b.getAttribute('data-automation-id') === 'add-button') {
        return b;
      }
    }
  }

  // 3. Document-wide button search by text, bounded to buttons whose nearest heading/legend
  //    names this section (eng review R9: never click an unrelated "Add" button).
  if (config.textRegex) {
    const allButtons = Array.from(doc.querySelectorAll<HTMLElement>('button, a[role="button"], span[role="button"]'));
    for (const b of allButtons) {
      const text = (b.textContent || b.getAttribute('aria-label') || '').trim();
      if (!config.textRegex.test(text)) continue;
      if (nearestHeadingMatches(b, config.type)) return b;
    }
  }

  return null;
}

const SECTION_HEADING_WORDS: Record<RepeatableSectionConfig['type'], RegExp> = {
  education: /education|school|academic|degree/i,
  experience: /experience|employment|work history|job history|positions?/i,
  website: /website|links?|urls?|social/i
};

/**
 * True when a heading/legend/label near the button (ancestors up to 6 levels, their
 * preceding siblings) names the section type.
 */
export function nearestHeadingMatches(btn: Element, type: RepeatableSectionConfig['type']): boolean {
  const re = SECTION_HEADING_WORDS[type];
  let node: Element | null = btn.parentElement;
  for (let depth = 0; depth < 6 && node; depth++) {
    const heading = node.querySelector('h1, h2, h3, h4, h5, h6, legend, [role="heading"], .section-title, .section-header');
    if (heading && re.test(heading.textContent || '')) return true;
    let prev = node.previousElementSibling;
    for (let i = 0; i < 3 && prev; i++) {
      if (/^(H[1-6]|LEGEND|LABEL|P|DIV|SPAN)$/.test(prev.tagName) && re.test(prev.textContent || '') && (prev.textContent || '').length < 120) {
        return true;
      }
      prev = prev.previousElementSibling;
    }
    const aria = node.getAttribute('aria-label') || node.getAttribute('data-automation-id') || '';
    if (re.test(aria)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Counts currently existing item entries for a section in the document.
 */
export function countExistingItems(doc: Document, config: RepeatableSectionConfig): number {
  const container = doc.querySelector(config.containerSelector);
  if (!container) return 0;

  const items = container.querySelectorAll(config.itemSelector);
  return items.length;
}

/**
 * True when the section container exists, so row counts are meaningful.
 */
export function isSectionCountable(doc: Document, config: RepeatableSectionConfig): boolean {
  return doc.querySelector(config.containerSelector) !== null;
}

/**
 * Programmatically triggers the addition of dynamic repeatable blocks up to targetCount.
 * Safely clicks Add button with framework events and waits for DOM insertion.
 */
export async function triggerAdditionsForSection(
  doc: Document,
  config: RepeatableSectionConfig,
  targetCount: number
): Promise<number> {
  if (targetCount <= 0) return 0;

  // Guard (eng review R9): without a countable container we cannot tell whether a click
  // produced a row, so we never click.
  if (!isSectionCountable(doc, config)) return 0;

  let added = 0;
  let currentCount = countExistingItems(doc, config);

  while (currentCount < targetCount) {
    const btn = findAddButton(doc, config);
    if (!btn) break;

    assertNotSubmitControl(btn, 'triggerAdditionsForSection');

    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    btn.click();
    added++;

    // Wait for the row to appear (bounded), instead of a fixed sleep.
    const before = currentCount;
    await waitForCondition(() => countExistingItems(doc, config) > before, ADD_ROW_WAIT_MS, 25);

    const newCount = countExistingItems(doc, config);
    if (newCount <= currentCount) {
      break;
    }
    currentCount = newCount;
  }

  return added;
}

/**
 * Scans document for supported repeatable sections and triggers additions
 * based on user's profile contents (education, experience, websites).
 */
export async function processDynamicAdditions(
  doc: Document,
  profile: Profile
): Promise<{ addedEducation: number; addedExperience: number; addedWebsites: number }> {
  let addedEducation = 0;
  let addedExperience = 0;
  let addedWebsites = 0;

  // 1. Education
  const targetEducationCount = (profile.education || []).length;
  if (targetEducationCount > 0) {
    for (const cfg of REPEATABLE_CONFIGS.filter((c) => c.type === 'education')) {
      const added = await triggerAdditionsForSection(doc, cfg, targetEducationCount);
      if (added > 0) {
        addedEducation += added;
        break;
      }
    }
  }

  // 2. Experience
  const targetExperienceCount = (profile.experience || []).length;
  if (targetExperienceCount > 0) {
    for (const cfg of REPEATABLE_CONFIGS.filter((c) => c.type === 'experience')) {
      const added = await triggerAdditionsForSection(doc, cfg, targetExperienceCount);
      if (added > 0) {
        addedExperience += added;
        break;
      }
    }
  }

  // 3. Websites
  const websiteCount = [profile.contact.linkedin, profile.contact.github, profile.contact.website].filter(Boolean).length;
  if (websiteCount > 0) {
    for (const cfg of REPEATABLE_CONFIGS.filter((c) => c.type === 'website')) {
      const added = await triggerAdditionsForSection(doc, cfg, websiteCount);
      if (added > 0) {
        addedWebsites += added;
        break;
      }
    }
  }

  return { addedEducation, addedExperience, addedWebsites };
}
