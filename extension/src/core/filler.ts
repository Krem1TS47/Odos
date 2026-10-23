import { assertNotSubmitControl } from '../content/submitGuard';
import { CanonicalField } from './fieldSchema';
import { waitForElement } from './dom';
import { findBestOptionMatch, OptionCandidate } from './dropdownResolver';

export interface FillReportItem {
  fieldId: string;
  fieldName: string;
  canonical?: CanonicalField;
  status: 'filled' | 'skipped' | 'failed';
  value?: string;
  reason: string;
}

/**
 * Sets a form field value safely via prototype property descriptor override.
 * React, Vue, and modern frameworks listen to value changes via setters.
 * Dispatches standard focus, input, change, and blur events.
 */
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  assertNotSubmitControl(el, 'setNativeValue');

  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');

  if (typeof el.focus === 'function') {
    el.focus();
  }

  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
}

/**
 * Fills a standard HTML <select> dropdown by matching text, value, or semantic synonyms.
 */
export function fillSelectElement(
  selectEl: HTMLSelectElement,
  desiredValue: string,
  hintCategory?: string
): boolean {
  assertNotSubmitControl(selectEl, 'fillSelectElement');

  const candidates: OptionCandidate[] = [];
  for (let i = 0; i < selectEl.options.length; i++) {
    const opt = selectEl.options[i];
    candidates.push({
      text: opt.text,
      value: opt.value,
      index: i
    });
  }

  const match = findBestOptionMatch(candidates, desiredValue, hintCategory);

  if (match) {
    const matchedIdx = match.candidate.index;
    selectEl.selectedIndex = matchedIdx;
    selectEl.value = selectEl.options[matchedIdx].value;

    for (let i = 0; i < selectEl.options.length; i++) {
      selectEl.options[i].selected = (i === matchedIdx);
    }

    selectEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    selectEl.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    return true;
  }

  return false;
}

/**
 * Selects a radio button or checkbox by matching option text or desired value.
 */
export function fillRadioOrCheckbox(
  inputEl: HTMLInputElement,
  desiredState = true
): boolean {
  assertNotSubmitControl(inputEl, 'fillRadioOrCheckbox');

  if (inputEl.type === 'radio') {
    if (!inputEl.checked) {
      inputEl.click();
      inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
    return true;
  }

  if (inputEl.type === 'checkbox') {
    if (inputEl.checked !== desiredState) {
      inputEl.click();
      inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
    return true;
  }

  return false;
}

/**
 * Fills a custom combobox, listbox, or creatable dropdown widget
 * (React-Select, Radix UI, Workday Canvas Kit, Headless UI, etc.).
 * Focuses control, searches, waits for options, matches semantic synonyms,
 * and handles "Creatable / Add Option" clicks.
 */
export async function fillComboboxWidget(
  comboboxEl: HTMLElement,
  desiredValue: string,
  searchContainer: HTMLElement | Document = document,
  hintCategory?: string
): Promise<boolean> {
  assertNotSubmitControl(comboboxEl, 'fillComboboxWidget');

  // 1. Focus combobox and trigger popup
  if (typeof comboboxEl.focus === 'function') {
    comboboxEl.focus();
  }
  comboboxEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  comboboxEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  comboboxEl.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
  comboboxEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  comboboxEl.click();

  // 2. If it's an input or has an embedded search input, type search text
  const searchInput = comboboxEl instanceof HTMLInputElement
    ? comboboxEl
    : comboboxEl.querySelector<HTMLInputElement>(
        'input[type="text"], input[role="searchbox"], input[aria-autocomplete], input.select__input, input[data-automation-id="searchBox"]'
      );

  if (searchInput) {
    const proto = HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(searchInput, desiredValue);
    } else {
      searchInput.value = desiredValue;
    }
    try {
      searchInput.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: desiredValue }));
    } catch {
      searchInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
    searchInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown', code: 'ArrowDown' }));
  }

  // 3. Wait for options list to populate (search both searchContainer and document body for portaled listboxes)
  const optionSelector =
    '[role="option"], li[data-value], .option, .select__option, div[id*="-option-"], [data-automation-id="promptOption"], [data-automation-id="select-item"], [data-automation-id="createOption"], [data-radix-collection-item], button[role="menuitem"]';
  
  await waitForElement(optionSelector, 2000, searchContainer);

  const doc = searchContainer instanceof Document ? searchContainer : searchContainer.ownerDocument || document;
  const options = Array.from(doc.querySelectorAll<HTMLElement>(optionSelector));

  // Build candidate options list
  const candidates: OptionCandidate[] = options.map((opt, idx) => ({
    text: opt.textContent || '',
    value: opt.getAttribute('data-value') || opt.getAttribute('value') || '',
    index: idx,
    element: opt
  }));

  const match = findBestOptionMatch(candidates, desiredValue, hintCategory);

  if (match && match.candidate.element) {
    const matchingOption = match.candidate.element;
    // Workday Canvas Kit & React-Select require mousedown/mouseup sequence
    matchingOption.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    matchingOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matchingOption.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    matchingOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    matchingOption.click();

    // Trigger blur or change on combobox to commit state
    comboboxEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    comboboxEl.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    return true;
  }

  // 4. Creatable / "+ Add Option" fallback: check if there is an Add button inside the popup
  const addOptionBtn = doc.querySelector<HTMLElement>(
    '[data-automation-id="createOption"], button.select__add-option, button.create-option, [role="button"][data-action="add"]'
  );
  if (addOptionBtn) {
    assertNotSubmitControl(addOptionBtn, 'fillComboboxWidget:addOptionBtn');
    addOptionBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    addOptionBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    addOptionBtn.click();
    return true;
  }

  return false;
}

/**
 * Attaches a resume or binary file to an input[type="file"].
 * Uses DataTransfer to assign files, plus fallback drop event.
 */
export function fillFileInput(
  fileInput: HTMLInputElement,
  fileData: { fileName: string; fileType: string; data: ArrayBuffer | Blob }
): boolean {
  assertNotSubmitControl(fileInput, 'fillFileInput');

  try {
    const file = fileData.data instanceof File
      ? fileData.data
      : new File([fileData.data], fileData.fileName, { type: fileData.fileType });

    let applied = false;

    if (typeof DataTransfer !== 'undefined') {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        applied = true;
      } catch {
        // Fallback below
      }
    }

    if (!applied) {
      // In jsdom or restricted environments, assign files property descriptor
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: true,
        configurable: true
      });
      applied = true;
    }

    if (applied) {
      fileInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      // Also dispatch drop event on parent container (some modern ATSs bind to drag/drop zone)
      const dropZone = fileInput.closest('.drop-zone, .file-upload, [role="button"]') || fileInput.parentElement;
      if (dropZone) {
        try {
          if (typeof DataTransfer !== 'undefined') {
            const dropDt = new DataTransfer();
            dropDt.items.add(file);
            const dropEvent = new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dropDt
            });
            dropZone.dispatchEvent(dropEvent);
          }
        } catch {
          // Fallback if DragEvent initialization differs
        }
      }

      return true;
    }
  } catch (err) {
    console.warn('[Odos Filler] Could not set file input via DataTransfer:', err);
  }

  return false;
}
