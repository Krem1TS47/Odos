import { FormField } from '../content/adapters/types';
import { BUILD_ID } from './buildInfo';

/**
 * Run diagnostics: what Odos saw on the page and what it did with each field.
 * Printed to the console on every run and copyable from the review panel, so a failing
 * page can be reported without a debugger session.
 */

export interface FieldDiagnostic {
  label: string;
  type: string;
  variant?: string;
  element: string;
  trigger?: string;
  canonical?: string;
  source?: string;
  status?: string;
  reason?: string;
  value?: string;
  suggestion?: string;
  rowIndex?: number;
  section?: string;
}

export interface DiagnosticsReport {
  build: string;
  version: string;
  url: string;
  adapter: string;
  at: string;
  counts: { fields: number; verified: number; unverified: number; failed: number; skipped: number };
  fields: FieldDiagnostic[];
}

/** Short, stable description of an element for bug reports. */
export function describeElement(el: Element | null | undefined): string {
  if (!el) return '';
  const parts = [el.tagName.toLowerCase()];
  const id = el.getAttribute('id');
  const name = el.getAttribute('name');
  const role = el.getAttribute('role');
  const type = el.getAttribute('type');
  const auto = el.getAttribute('data-automation-id');
  const cls = (el.getAttribute('class') || '').split(/\s+/).filter((c) => c && !/^(remix-css|css)-/.test(c)).slice(0, 3).join('.');
  if (id) parts.push(`#${id}`);
  if (name) parts.push(`[name=${name}]`);
  if (type) parts.push(`[type=${type}]`);
  if (role) parts.push(`[role=${role}]`);
  if (auto) parts.push(`[data-automation-id=${auto}]`);
  if (el.hasAttribute('aria-haspopup')) parts.push(`[aria-haspopup=${el.getAttribute('aria-haspopup')}]`);
  if (cls) parts.push(`.${cls}`);
  return parts.join('');
}

export function buildDiagnostics(input: { fields: FormField[]; adapterId: string; url: string; version?: string }): DiagnosticsReport {
  const fields = input.fields.map<FieldDiagnostic>((f) => ({
    label: f.label,
    type: f.type,
    variant: f.dropdownVariant,
    element: describeElement(f.element),
    trigger: f.trigger ? describeElement(f.trigger) : undefined,
    canonical: f.canonical,
    source: f.source,
    status: f.status,
    reason: f.statusReason,
    value: f.matchedValue,
    suggestion: f.suggestion ? `${f.suggestion.text} (${Math.round(f.suggestion.score * 100)}%)` : undefined,
    rowIndex: f.rowIndex,
    section: f.repeatSection
  }));
  const count = (s: string) => fields.filter((f) => f.status === s).length;
  return {
    build: BUILD_ID,
    version: input.version || '',
    url: input.url,
    adapter: input.adapterId,
    at: new Date().toISOString(),
    counts: { fields: fields.length, verified: count('verified'), unverified: count('unverified'), failed: count('failed'), skipped: count('skipped') },
    fields
  };
}

export function diagnosticsToText(report: DiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}

export function logDiagnostics(report: DiagnosticsReport): void {
  try {
    console.groupCollapsed(`[Odos] run diagnostics — build ${report.build} — ${report.adapter} — ${report.counts.verified} verified / ${report.counts.unverified} to check / ${report.counts.failed} needs input`);
    if (typeof console.table === 'function') {
      console.table(report.fields.map((f) => ({ label: f.label, type: f.variant ? `${f.type}:${f.variant}` : f.type, status: f.status, reason: f.reason, value: f.value, element: f.element })));
    }
    console.log(diagnosticsToText(report));
    console.groupEnd();
  } catch {
    // console may be unavailable
  }
}
