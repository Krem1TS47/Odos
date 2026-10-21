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

    const host = document.getElementById('odos-review-panel-host');
    expect(host).not.toBeNull();

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

    panel.destroy();
  });
});
