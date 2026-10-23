import { describe, it, expect } from 'vitest';
import {
  setNativeValue,
  fillSelectElement,
  fillRadioOrCheckbox,
  fillFileInput,
  reconcileField
} from '../../extension/src/core/filler';
import { deepQuerySelector, deepQuerySelectorAll } from '../../extension/src/core/dom';

describe('Filler and DOM Piercing (Step 4)', () => {
  describe('setNativeValue', () => {
    it('sets input value and dispatches input, change, and blur events', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      const events: string[] = [];
      input.addEventListener('input', () => events.push('input'));
      input.addEventListener('change', () => events.push('change'));
      input.addEventListener('blur', () => events.push('blur'));

      setNativeValue(input, 'Ada Lovelace');

      expect(input.value).toBe('Ada Lovelace');
      expect(events).toEqual(['input', 'change', 'blur']);
      document.body.removeChild(input);
    });

    it('sets textarea value and dispatches events', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      let changed = false;
      textarea.addEventListener('change', () => {
        changed = true;
      });

      setNativeValue(textarea, 'I am excited about this opportunity.');

      expect(textarea.value).toBe('I am excited about this opportunity.');
      expect(changed).toBe(true);
      document.body.removeChild(textarea);
    });

    it('throws error when trying to fill a submit button (Invariant 1)', () => {
      const btn = document.createElement('input');
      btn.type = 'submit';
      btn.value = 'Submit Application';
      document.body.appendChild(btn);

      expect(() => setNativeValue(btn, 'test')).toThrowError(/SUBMIT GUARD VIOLATION/);
      document.body.removeChild(btn);
    });

    it('synchronizes React _valueTracker so React onChange triggers reliably', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      // Simulate React 16-19 _valueTracker
      let trackedVal = '';
      (input as any)._valueTracker = {
        getValue: () => trackedVal,
        setValue: (v: string) => { trackedVal = v; }
      };

      let reactStateUpdated = false;
      input.addEventListener('input', () => {
        // React's internal check:
        const tracker = (input as any)._valueTracker;
        const lastValue = tracker ? tracker.getValue() : null;
        if (input.value !== lastValue) {
          tracker.setValue(input.value);
          reactStateUpdated = true;
        }
      });

      setNativeValue(input, 'Grace Hopper');

      expect(input.value).toBe('Grace Hopper');
      expect(reactStateUpdated).toBe(true);
      document.body.removeChild(input);
    });

    it('reconciles field if controlled component wiped value during re-render', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = ''; // Framework wiped it back
      document.body.appendChild(input);

      const restored = reconcileField(input, 'Alan Turing');
      expect(restored).toBe(true);
      expect(input.value).toBe('Alan Turing');
      document.body.removeChild(input);
    });

    it('fills contenteditable elements', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      document.body.appendChild(div);

      const success = setNativeValue(div, 'Cover letter text in rich editor');
      expect(success).toBe(true);
      expect(div.textContent).toBe('Cover letter text in rich editor');
      document.body.removeChild(div);
    });
  });

  describe('fillSelectElement', () => {
    it('selects option by visible text', () => {
      const select = document.createElement('select');
      select.innerHTML = `
        <option value="">Select country</option>
        <option value="US">United States</option>
        <option value="CA">Canada</option>
      `;
      document.body.appendChild(select);

      const success = fillSelectElement(select, 'United States');
      expect(success).toBe(true);
      expect(select.value).toBe('US');
      expect(select.selectedIndex).toBe(1);

      document.body.removeChild(select);
    });

    it('selects option by value attribute', () => {
      const select = document.createElement('select');
      select.innerHTML = `
        <option value="">Select gender</option>
        <option value="female">Woman</option>
        <option value="male">Man</option>
      `;
      document.body.appendChild(select);

      const success = fillSelectElement(select, 'female');
      expect(success).toBe(true);
      expect(select.value).toBe('female');

      document.body.removeChild(select);
    });

    it('returns false if option is not found', () => {
      const select = document.createElement('select');
      select.innerHTML = `<option value="1">Option 1</option>`;
      document.body.appendChild(select);

      const success = fillSelectElement(select, 'Non-existent');
      expect(success).toBe(false);

      document.body.removeChild(select);
    });
  });

  describe('fillRadioOrCheckbox', () => {
    it('clicks radio button if not checked', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'sponsorship';
      radio.value = 'no';
      document.body.appendChild(radio);

      const success = fillRadioOrCheckbox(radio, true);
      expect(success).toBe(true);
      expect(radio.checked).toBe(true);

      document.body.removeChild(radio);
    });

    it('toggles checkbox to match desired state', () => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      document.body.appendChild(checkbox);

      expect(checkbox.checked).toBe(false);
      fillRadioOrCheckbox(checkbox, true);
      expect(checkbox.checked).toBe(true);

      fillRadioOrCheckbox(checkbox, false);
      expect(checkbox.checked).toBe(false);

      document.body.removeChild(checkbox);
    });
  });

  describe('fillFileInput', () => {
    it('attaches file via DataTransfer and dispatches events', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      document.body.appendChild(fileInput);

      let changeDispatched = false;
      fileInput.addEventListener('change', () => {
        changeDispatched = true;
      });

      const blob = new Blob(['sample resume content'], { type: 'application/pdf' });
      const success = fillFileInput(fileInput, {
        fileName: 'resume.pdf',
        fileType: 'application/pdf',
        data: blob
      });

      expect(success).toBe(true);
      expect(fileInput.files).not.toBeNull();
      expect(fileInput.files?.length).toBe(1);
      expect(fileInput.files?.[0].name).toBe('resume.pdf');
      expect(changeDispatched).toBe(true);

      document.body.removeChild(fileInput);
    });
  });

  describe('Shadow DOM Piercing (dom.ts)', () => {
    it('locates elements deeply nested in open shadow roots', () => {
      const host = document.createElement('div');
      document.body.appendChild(host);

      if (typeof host.attachShadow === 'function') {
        const shadow = host.attachShadow({ mode: 'open' });
        const innerContainer = document.createElement('div');
        const nestedInput = document.createElement('input');
        nestedInput.id = 'shadow-first-name';
        innerContainer.appendChild(nestedInput);
        shadow.appendChild(innerContainer);

        const found = deepQuerySelector('#shadow-first-name', document.body);
        expect(found).not.toBeNull();
        expect(found?.id).toBe('shadow-first-name');

        const allFound = deepQuerySelectorAll('input', document.body);
        expect(allFound.some(el => el.id === 'shadow-first-name')).toBe(true);
      }

      document.body.removeChild(host);
    });
  });
});
