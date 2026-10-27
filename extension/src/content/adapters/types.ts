import { Job, Profile, StoredAnswer } from '../../core/models';
import { CanonicalField } from '../../core/fieldSchema';
import { CaptchaDetection } from '../captcha';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'select'
  | 'combobox'
  | 'textarea'
  | 'file'
  | 'radio'
  | 'checkbox'
  | 'radio_group'
  | 'checkbox_group';

/** How a dropdown is driven (eng review R2). */
export type DropdownVariant = 'native' | 'searchable' | 'listbox-button' | 'datalist';

/** Outcome of a fill attempt (eng review R1). */
export type FillStatus = 'verified' | 'unverified' | 'failed' | 'skipped';

export type FillSource = 'profile' | 'answer' | 'heuristic' | 'ai' | 'resume' | 'manual';

export interface FillSuggestion {
  text: string;
  score: number;
  source: 'option' | 'answer';
}

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unmatched';

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  element: HTMLElement;
  required: boolean;
  /** Visible option texts for select/combobox/radio_group/checkbox_group. */
  options?: string[];
  /** Option values aligned with `options` (radio/checkbox groups, native selects). */
  optionValues?: string[];
  /** Dropdown driving strategy. */
  dropdownVariant?: DropdownVariant;
  /** Wrapper/trigger element that opens the popup (may equal `element`). */
  trigger?: HTMLElement;
  /** Listbox/menu node the control owns, when resolvable at discovery time. */
  optionSource?: Element | null;
  /** All inputs in a radio/checkbox group. */
  groupElements?: HTMLInputElement[];
  /** Index of the repeatable row (education/experience) this field belongs to. */
  rowIndex?: number;
  /** Which repeatable section the field sits in, when detected. */
  repeatSection?: 'education' | 'experience' | 'website';
  matchedValue?: string;
  confidence?: ConfidenceLevel | number;
  matchedReason?: string;
  canonical?: CanonicalField;
  isCustomQuestion?: boolean;
  /** Fill outcome. */
  status?: FillStatus;
  statusReason?: string;
  source?: FillSource;
  /** Closest candidate when nothing was auto-selected. */
  suggestion?: FillSuggestion;
  /** Stored answer that supplied the value, when any (used by Fill & remember). */
  answerId?: string;
}

export interface AutofillPayload {
  profile: Profile;
  answers: StoredAnswer[];
  /** Adapter that discovered the fields (e.g. 'workday'); drives ATS-specific invariants. */
  adapterId?: string;
  resumeFile?: {
    fileName: string;
    fileType: string;
    data: ArrayBuffer | Blob;
  } | null;
}

export interface FillReportItem {
  field: FormField;
  status: 'filled' | 'needs_review' | 'skipped' | 'failed';
  value?: string;
  confidence: number;
  reason: string;
}

export interface FillReport {
  adapterId: string;
  items: FillReportItem[];
  filledCount: number;
  needsReviewCount: number;
  failedCount: number;
  captchaDetected?: CaptchaDetection;
  snapshot: Record<string, string>;
}

export interface AtsAdapter {
  id: string;
  name: string;
  matches(url: URL, doc: Document): boolean;
  extractJob(doc: Document, url: URL): Partial<Job>;
  discoverFields(doc: Document): FormField[];
  confirmationDetected(url: URL, doc: Document): boolean;
  detectCaptcha?(doc: Document): CaptchaDetection;
}
