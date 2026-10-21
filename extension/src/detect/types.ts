/**
 * ATS Detection Engine Types
 */

export type Signal =
  | { kind: 'host'; pattern: RegExp; weight: number }
  | { kind: 'urlParam'; name: string; weight: number }
  | { kind: 'dom'; selector: string; weight: number }
  | { kind: 'scriptSrc'; pattern: RegExp; weight: number }
  | { kind: 'iframeSrc'; pattern: RegExp; weight: number }
  | { kind: 'jsonld'; weight: number };

export interface AtsFingerprint {
  id: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters' | 'icims' | 'workable' | string;
  name: string;
  signals: Signal[];
  threshold: number; // minimum summed weight to claim a match
}

export interface JobPostingMetadata {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  employmentType?: string;
  datePosted?: string;
}

export interface DetectionResult {
  ats: string | null;       // best match id, or null
  confidence: number;       // 0..1
  matchedSignals: string[]; // names of signals that fired
  pageType: 'listing' | 'application' | 'unknown';
  jobPosting?: JobPostingMetadata;
}
