/**
 * User settings kept in chrome.storage.local. Read by the background (sent to the page with
 * GET_PAGE_DATA) and edited in the dashboard.
 */

export interface OdosSettings {
  /** Continue through multi-page applications automatically (stops at Review, never submits). */
  autoAdvancePages: boolean;
  /** Safety cap on pages per run. */
  maxPagesPerRun: number;
}

export const DEFAULT_SETTINGS: OdosSettings = {
  autoAdvancePages: true,
  maxPagesPerRun: 12
};

const KEY = 'odos_settings';

export function normalizeSettings(raw: unknown): OdosSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<OdosSettings>;
  return {
    autoAdvancePages: typeof r.autoAdvancePages === 'boolean' ? r.autoAdvancePages : DEFAULT_SETTINGS.autoAdvancePages,
    maxPagesPerRun:
      typeof r.maxPagesPerRun === 'number' && r.maxPagesPerRun >= 1 && r.maxPagesPerRun <= 50
        ? Math.floor(r.maxPagesPerRun)
        : DEFAULT_SETTINGS.maxPagesPerRun
  };
}

export async function loadSettings(): Promise<OdosSettings> {
  try {
    const res = await chrome.storage.local.get(KEY);
    return normalizeSettings(res?.[KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<OdosSettings>): Promise<OdosSettings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
