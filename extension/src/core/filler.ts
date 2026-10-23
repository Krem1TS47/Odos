import { assertNotSubmitControl } from '../content/submitGuard';
import { CanonicalField } from './fieldSchema';
import { waitForElement } from './dom';

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
 * Fills a standard HTML <select> dropdown by matching text or value.
 */
export function fillSelectElement(
  selectEl: HTMLSelectElement,
  desiredValue: string
): boolean {
  assertNotSubmitControl(selectEl, 'fillSelectElement');

  const normDesired = desiredValue.toLowerCase().trim();
  let matchedIdx = -1;

  for (let i = 0; i < selectEl.options.length; i++) {
    const opt = selectEl.options[i];
    const optText = opt.text.toLowerCase().trim();
    const optVal = opt.value.toLowerCase().trim();

    if (optText === normDesired || optVal === normDesired || optText.startsWith(normDesired)) {
      matchedIdx = i;
      break;
    }
  }

  if (matchedIdx !== -1) {
    selectEl.selectedIndex = matchedIdx;
    selectEl.value = selectEl.options[matchedIdx].value;
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
 * Fills a custom combobox or listbox widget (common in new Greenhouse and Workday).
 * Focuses control, searches, waits for role="option" elements, and clicks the best match.
 */
export async function fillComboboxWidget(
  comboboxEl: HTMLElement,
  desiredValue: string,
  searchContainer: HTMLElement | Document = document
): Promise<boolean> {
  assertNotSubmitControl(comboboxEl, 'fillComboboxWidget');

  const normDesired = desiredValue.toLowerCase().trim();

  // 1. Focus combobox and trigger popup
  if (typeof comboboxEl.focus === 'function') {
    comboboxEl.focus();
  }
  comboboxEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  comboboxEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  comboboxEl.click();

  // 2. If it's an input or has an embedded search input, type search text without blur
  const searchInput = comboboxEl instanceof HTMLInputElement
    ? comboboxEl
    : comboboxEl.querySelector<HTMLInputElement>('input[type="text"], input[role="searchbox"], input[aria-autocomplete]');

  if (searchInput) {
    const proto = HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(searchInput, desiredValue);
    } else {
      searchInput.value = desiredValue;
    }
    searchInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  // 3. Wait for options list to populate (search both searchContainer and document)
  const optionSelector = '[role="option"], li[data-value], .option, [data-automation-id="promptOption"], [data-automation-id="select-item"]';
  await waitForElement(optionSelector, 2000, searchContainer);

  const doc = searchContainer instanceof Document ? searchContainer : searchContainer.ownerDocument || document;
  const options = Array.from(doc.querySelectorAll<HTMLElement>(optionSelector));

  const matchingOption = options.find((opt) => {
    const text = (opt.textContent || '').toLowerCase().trim();
    const val = (opt.getAttribute('data-value') || '').toLowerCase().trim();
    return text === normDesired || val === normDesired || text.includes(normDesired) || normDesired.includes(text);
  });

  if (matchingOption) {
    // Workday Canvas Kit requires mousedown/mouseup to commit item in React state before click
    matchingOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matchingOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    matchingOption.click();
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
