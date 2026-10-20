export class SubmitGuardViolationError extends Error {
  constructor(message: string) {
    super(`[SUBMIT GUARD VIOLATION] ${message}`);
    this.name = 'SubmitGuardViolationError';
  }
}

/**
 * Returns true if the element is a submit button, submit input, or form element
 * that could trigger form submission.
 */
export function isSubmitControl(element: Element | null | undefined): boolean {
  if (!element) return false;

  const tag = element.tagName.toUpperCase();

  // Any form element
  if (tag === 'FORM') {
    return true;
  }

  // Input with type=submit or type=image
  if (tag === 'INPUT') {
    const inputType = (element.getAttribute('type') || 'text').toLowerCase();
    if (inputType === 'submit' || inputType === 'image') {
      return true;
    }
  }

  // Button element (default type in forms is "submit" unless explicitly set to "button")
  if (tag === 'BUTTON') {
    const btnType = (element.getAttribute('type') || 'submit').toLowerCase();
    if (btnType === 'submit') {
      return true;
    }
    // Also guard buttons whose text explicitly indicates submission
    const text = (element.textContent || '').trim().toLowerCase();
    if (/^(submit|apply|submit application|send application)/i.test(text)) {
      return true;
    }
  }

  // Any element with role=button and submit-like text
  const role = element.getAttribute('role')?.toLowerCase();
  if (role === 'button') {
    const text = (element.textContent || '').trim().toLowerCase();
    if (/^(submit|apply|submit application|send application)/i.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Throws a SubmitGuardViolationError if the given element is a submit control.
 */
export function assertNotSubmitControl(element: Element | null | undefined, actionDescription = 'interaction'): void {
  if (isSubmitControl(element)) {
    throw new SubmitGuardViolationError(
      `Attempted ${actionDescription} on a submit control or form: <${element?.tagName.toLowerCase()} type="${element?.getAttribute('type') || ''}">. Invariant 1 violation: Odos must never submit forms.`
    );
  }
}

/**
 * Sets a form field value safely, ensuring React/Vue/standard forms detect the change,
 * while strictly guarding against touching submit controls or dispatching Enter keypresses.
 */
export function safeSetFieldValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): void {
  assertNotSubmitControl(element, 'setting value');

  // React and modern frameworks track the property setter on the prototype
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch standard events so framework listeners update internal state
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}
