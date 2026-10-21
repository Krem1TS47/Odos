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
  | 'checkbox';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unmatched';

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  element: HTMLElement;
  required: boolean;
  options?: string[]; // For select, radio, checkbox, combobox options
  matchedValue?: string;
  confidence?: ConfidenceLevel | number;
  matchedReason?: string;
  canonical?: CanonicalField;
  isCustomQuestion?: boolean;
}

export interface AutofillPayload {
  profile: Profile;
  answers: StoredAnswer[];
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
