import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewPanelController, ManualEdit } from '../../extension/src/content/ui/panel';
import { FormField } from '../../extension/src/content/adapters/types';

describe('Review panel learning loop (R1 status rows, R7 answer-in-panel, save-on-submit)', () => {
  let select: HTMLSelectElement;
  let text: HTMLInputElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    select = document.createElement('select');
    select.innerHTML = '<option value="">Select</option><option>LinkedIn</option><option>Indeed</option>';
    text = document.createElement('input');
    document.body.append(select, text);
  });

  it('renders needs-review rows with the closest candidate and an option control, and routes Fill through onFillField', async () => {
    const field: FormField = {
      id: 'src', name: 'src', label: 'How did you hear about us?', type: 'select', element: select, required: true,
      options: ['LinkedIn', 'Indeed'], status: 'failed', suggestion: { text: 'LinkedIn', score: 0.6, source: 'option' }
    };
    const onFillField = vi.fn(async () => ({ status: 'verified' as const, value: 'Indeed', reason: 'select_option' }));
    const panel = new ReviewPanelController({ job: { company: 'Acme' }, filledFields: [], emptyFields: [field], onConfirmSubmitted: vi.fn(), onFillField });
    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;

    expect(shadow.querySelector('.field-meta')?.textContent).toContain('closest: LinkedIn');
    const control = shadow.querySelector('.inline-answer select') as HTMLSelectElement;
    expect(control).not.toBeNull();
    expect(Array.from(control.options).map((o) => o.value)).toEqual(['LinkedIn', 'Indeed']);

    control.value = 'Indeed';
    (shadow.querySelector('button[data-action="fill"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onFillField).toHaveBeenCalledWith(field, 'Indeed', false);

    // Field moved to the filled list after a verified fill
    const after = (panel as any).shadow as ShadowRoot;
    expect(after.querySelector('.field-item[data-type="filled"]')).not.toBeNull();
    expect(after.querySelector('.field-item-empty')).toBeNull();
    panel.destroy();
  });

  it('Fill & remember passes remember=true and shows a text control when there are no options', async () => {
    const field: FormField = { id: 'why', name: 'why', label: 'Why do you want to work here?', type: 'textarea', element: text, required: false, status: 'failed' };
    const onFillField = vi.fn(async () => ({ status: 'verified' as const, value: 'Mission', reason: 'text_set' }));
    const panel = new ReviewPanelController({ job: { company: 'Acme' }, filledFields: [], emptyFields: [field], onConfirmSubmitted: vi.fn(), onFillField });
    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;
    const input = shadow.querySelector('.inline-answer input') as HTMLInputElement;
    input.value = 'Mission';
    (shadow.querySelector('button[data-action="remember"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onFillField).toHaveBeenCalledWith(field, 'Mission', true);
    panel.destroy();
  });

  it('shows unverified fills as "Check" rows inside the filled list', () => {
    const field: FormField = { id: 'c', name: 'c', label: 'Country', type: 'combobox', element: text, required: true, status: 'unverified', matchedValue: 'United States', options: ['Canada', 'United States'] };
    const panel = new ReviewPanelController({ job: { company: 'Acme' }, filledFields: [field], emptyFields: [], onConfirmSubmitted: vi.fn(), onFillField: vi.fn() });
    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;
    expect(shadow.querySelector('.check-badge')?.textContent).toContain('United States');
    expect(shadow.querySelector('.stat-label')?.parentElement?.textContent).toContain('1');
    expect(shadow.textContent).toContain('to check');
    panel.destroy();
  });

  it('offers to save manual edits on submit and calls onSaveAnswers with the selected ones', async () => {
    const edits = [
      { field: { id: 'a', name: 'a', label: 'Why us?', type: 'textarea', element: text, required: false } as FormField, value: 'Mission' },
      { field: { id: 'b', name: 'b', label: 'Favorite language', type: 'text', element: text, required: false } as FormField, value: 'TypeScript' }
    ];
    const onSaveAnswers = vi.fn(async (_edits: ManualEdit[]) => {});
    const onConfirmSubmitted = vi.fn();
    const panel = new ReviewPanelController({ job: { company: 'Acme' }, filledFields: [], emptyFields: [], onConfirmSubmitted, getManualEdits: () => edits, onSaveAnswers });
    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;
    (shadow.getElementById('btn-mark-submitted') as HTMLButtonElement).click();
    expect(onConfirmSubmitted).toHaveBeenCalled();
    const boxes = shadow.querySelectorAll<HTMLInputElement>('#save-offer input[type=checkbox]');
    expect(boxes.length).toBe(2);
    boxes[1].checked = false;
    (shadow.getElementById('btn-save-answers') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onSaveAnswers).toHaveBeenCalledTimes(1);
    expect(onSaveAnswers.mock.calls[0][0].map((e) => e.value)).toEqual(['Mission']);
    panel.destroy();
  });

  it('escapes field labels and values in the panel markup', () => {
    const field: FormField = { id: 'x', name: 'x', label: '<img src=x onerror=alert(1)>', type: 'text', element: text, required: false, status: 'verified', matchedValue: '<b>bold</b>' };
    const panel = new ReviewPanelController({ job: { company: 'Acme' }, filledFields: [field], emptyFields: [], onConfirmSubmitted: vi.fn() });
    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;
    expect(shadow.querySelector('img')).toBeNull();
    expect(shadow.querySelector('.field-title')?.textContent).toBe('<img src=x onerror=alert(1)>');
    panel.destroy();
  });
});
