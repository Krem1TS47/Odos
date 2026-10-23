import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewPanelController } from '../../extension/src/content/ui/panel';
import { FormField } from '../../extension/src/content/adapters/types';

describe('Review Panel UI (Step 8)', () => {
  let container: HTMLDivElement;
  let input1: HTMLInputElement;
  let input2: HTMLInputElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    input1 = document.createElement('input');
    input1.id = 'name_field';
    input1.value = 'Ada Lovelace';
    input2 = document.createElement('input');
    input2.id = 'question_why';
    input2.value = '';

    container.appendChild(input1);
    container.appendChild(input2);
    document.body.appendChild(container);
  });

  it('renders within a closed shadow root attached to body', () => {
    const filledFields: FormField[] = [
      {
        id: 'name_field',
        name: 'name',
        label: 'Full Name',
        type: 'text',
        element: input1,
        required: true,
        matchedValue: 'Ada Lovelace'
      }
    ];

    const emptyFields: FormField[] = [
      {
        id: 'question_why',
        name: 'why',
        label: 'Why do you want to work here?',
        type: 'text',
        element: input2,
        required: false
      }
    ];

    const panel = new ReviewPanelController({
      job: { company: 'Anthropic', title: 'Research Engineer' },
      atsName: 'Greenhouse',
      filledFields,
      emptyFields,
      onConfirmSubmitted: vi.fn()
    });

    panel.render();

    const host = document.getElementById('odos-review-panel-host');
    expect(host).not.toBeNull();
    // In closed shadow mode, host.shadowRoot is null from outside
    expect(host?.shadowRoot).toBeNull();

    // Check inner shadow content via controller reference
    const shadow = (panel as any).shadow as ShadowRoot;
    expect(shadow).not.toBeNull();
    expect(shadow.querySelector('.odos-title')?.textContent).toBe('Anthropic');
    expect(shadow.querySelector('.field-list')).not.toBeNull();
    expect(shadow.querySelectorAll('.field-item').length).toBe(2);

    panel.destroy();
    expect(document.getElementById('odos-review-panel-host')).toBeNull();
  });

  it('surfaces CAPTCHA alert when CAPTCHA is detected', () => {
    const panel = new ReviewPanelController({
      job: { company: 'Palantir' },
      atsName: 'Lever',
      filledFields: [],
      emptyFields: [],
      captcha: { present: true, type: 'hCaptcha' },
      onConfirmSubmitted: vi.fn()
    });

    panel.render();

    const shadow = (panel as any).shadow as ShadowRoot;
    expect(shadow.querySelector('.captcha-alert')).not.toBeNull();
    expect(shadow.querySelector('.captcha-alert')?.textContent).toContain('hCaptcha CAPTCHA Detected');

    panel.destroy();
  });

  it('handles undo prefill callback when requested', () => {
    const onUndo = vi.fn();
    const panel = new ReviewPanelController({
      job: { company: 'Test Company' },
      filledFields: [],
      emptyFields: [],
      onConfirmSubmitted: vi.fn(),
      onUndoPrefill: onUndo
    });

    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;
    const undoBtn = shadow.getElementById('btn-undo');
    expect(undoBtn).not.toBeNull();

    undoBtn?.click();
    expect(onUndo).toHaveBeenCalledTimes(1);

    panel.destroy();
  });

  it('toggles minimize and expand when toggle button is clicked', () => {
    const panel = new ReviewPanelController({
      job: { company: 'Google' },
      filledFields: [],
      emptyFields: [],
      onConfirmSubmitted: vi.fn()
    });

    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;

    // Initially expanded
    expect(shadow.querySelector('.odos-body')).not.toBeNull();

    // Click minimize button
    const toggleBtn = shadow.getElementById('btn-toggle-expand');
    toggleBtn?.click();

    // Now collapsed
    expect(shadow.querySelector('.odos-panel-collapsed')).not.toBeNull();
    expect(shadow.querySelector('.odos-body')).toBeNull();

    // Click again to expand
    const expandBtn = shadow.getElementById('btn-toggle-expand');
    expandBtn?.click();
    expect(shadow.querySelector('.odos-body')).not.toBeNull();

    panel.destroy();
  });

  it('dismisses panel when close button is clicked', () => {
    const panel = new ReviewPanelController({
      job: { company: 'Stripe' },
      filledFields: [],
      emptyFields: [],
      onConfirmSubmitted: vi.fn()
    });

    panel.render();
    const shadow = (panel as any).shadow as ShadowRoot;
    const closeBtn = shadow.getElementById('btn-close-panel');
    closeBtn?.click();

    expect(document.getElementById('odos-review-panel-host')).toBeNull();
  });

  it('filters fields when clicking tabs and focuses field element on click', () => {
    const scrollIntoViewMock = vi.fn();
    const focusMock = vi.fn();
    input1.scrollIntoView = scrollIntoViewMock;
    input1.focus = focusMock;

    const filledFields: FormField[] = [
      {
        id: 'name_field',
        name: 'name',
        label: 'Full Name',
        type: 'text',
        element: input1,
        required: true,
        matchedValue: 'Ada Lovelace'
      }
    ];

    const emptyFields: FormField[] = [
      {
        id: 'question_why',
        name: 'why',
        label: 'Why do you want to work here?',
        type: 'text',
        element: input2,
        required: false
      }
    ];

    const panel = new ReviewPanelController({
      job: { company: 'Figma' },
      filledFields,
      emptyFields,
      onConfirmSubmitted: vi.fn()
    });

    panel.render();
    let shadow = (panel as any).shadow as ShadowRoot;

    // Initially activeTab === 'all'
    expect(shadow.querySelectorAll('.field-item').length).toBe(2);

    // Switch to filled tab
    const tabFilled = shadow.getElementById('tab-filled');
    tabFilled?.click();
    shadow = (panel as any).shadow as ShadowRoot;
    expect(shadow.querySelectorAll('.field-item').length).toBe(1);
    expect(shadow.querySelector('.field-item')?.getAttribute('data-type')).toBe('filled');

    // Click the filled field item to jump/focus
    const fieldItem = shadow.querySelector('.field-item') as HTMLElement;
    fieldItem.click();
    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(focusMock).toHaveBeenCalled();

    panel.destroy();
  });
});
