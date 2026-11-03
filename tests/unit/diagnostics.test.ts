import { describe, it, expect, vi } from 'vitest';
import { describeElement, buildDiagnostics, diagnosticsToText } from '../../extension/src/core/diagnostics';
import { ReviewPanelController } from '../../extension/src/content/ui/panel';
import { FormField } from '../../extension/src/content/adapters/types';

describe('Run diagnostics', () => {
  it('describes elements compactly and summarises statuses', () => {
    document.body.innerHTML = `<div data-automation-id="searchWidget"><input id="school" type="text" data-automation-id="searchBox" class="remix-css-abc WDInput" /></div>`;
    const input = document.getElementById('school') as HTMLInputElement;
    expect(describeElement(input)).toBe('input#school[type=text][data-automation-id=searchBox].WDInput');

    const fields: FormField[] = [
      { id: 'school', name: 'school', label: 'School', type: 'combobox', dropdownVariant: 'searchable', element: input, trigger: input.parentElement as HTMLElement, required: true, status: 'failed', statusReason: 'no_results:enter:none', suggestion: { text: 'University of X', score: 0.6, source: 'option' } },
      { id: 'fn', name: 'first_name', label: 'First name', type: 'text', element: input, required: true, status: 'verified', matchedValue: 'Ada' }
    ];
    const report = buildDiagnostics({ fields, adapterId: 'workday', url: 'https://x.myworkdayjobs.com/apply', version: '2.0.0' });
    expect(report.counts).toEqual({ fields: 2, verified: 1, unverified: 0, failed: 1, skipped: 0 });
    expect(report.fields[0].trigger).toContain('data-automation-id=searchWidget');
    expect(report.fields[0].suggestion).toBe('University of X (60%)');
    const text = diagnosticsToText(report);
    expect(JSON.parse(text).adapter).toBe('workday');
  });

  it('panel exposes Copy diagnostics and shows the build id', async () => {
    document.body.innerHTML = '';
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const panel = new ReviewPanelController({ job: { company: 'Acme' }, filledFields: [], emptyFields: [], onConfirmSubmitted: vi.fn(), getDiagnostics: () => '{"ok":true}', buildId: '20261027-0130' });
    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;
    expect(shadow.querySelector('.odos-subtitle')?.textContent).toContain('build 20261027-0130');
    const btn = shadow.getElementById('btn-copy-diagnostics') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledWith('{"ok":true}');
    panel.destroy();
  });
});
