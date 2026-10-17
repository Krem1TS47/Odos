import { Job } from '../../core/models';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'select'
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
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  required: boolean;
  options?: string[]; // For select, radio, or checkbox options
  matchedValue?: string;
  confidence?: ConfidenceLevel;
  matchedReason?: string;
}

export interface AtsAdapter {
  id: string;
  matches(url: URL, doc: Document): boolean;
  extractJob(doc: Document, url: URL): Partial<Job>;
  discoverFields(doc: Document): FormField[];
  confirmationDetected(url: URL, doc: Document): boolean;
}
