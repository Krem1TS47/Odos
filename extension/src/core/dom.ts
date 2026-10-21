/**
 * DOM Utilities: Shadow-root piercing queries and async element observers.
 */

/**
 * Traverses light DOM and any open shadow roots to find the first matching element.
 */
export function deepQuerySelector(selector: string, root: ParentNode = document): Element | null {
  const lightMatch = root.querySelector(selector);
  if (lightMatch) return lightMatch;

  // Search inside all open shadow roots
  const allElements = root.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if ((el as Element).shadowRoot) {
      const shadowMatch = deepQuerySelector(selector, (el as Element).shadowRoot!);
      if (shadowMatch) return shadowMatch;
    }
  }

  return null;
}

/**
 * Traverses light DOM and all open shadow roots to find all matching elements.
 */
export function deepQuerySelectorAll(selector: string, root: ParentNode = document): Element[] {
  const results: Element[] = [];

  // Match at current root
  const lightMatches = root.querySelectorAll(selector);
  results.push(...Array.from(lightMatches));

  // Recurse into all open shadow roots
  const allElements = root.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if ((el as Element).shadowRoot) {
      const shadowMatches = deepQuerySelectorAll(selector, (el as Element).shadowRoot!);
      results.push(...shadowMatches);
    }
  }

  return results;
}

/**
 * Asynchronously waits for an element matching `selector` to appear in the DOM.
 */
export function waitForElement(
  selector: string,
  timeoutMs = 5000,
  root: ParentNode = document
): Promise<Element | null> {
  const existing = deepQuerySelector(selector, root);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let timer: any = null;

    const observer = new MutationObserver(() => {
      const el = deepQuerySelector(selector, root);
      if (el) {
        cleanup();
        resolve(el);
      }
    });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };

    timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    const observeTarget = (root as Document).body || (root as Node);
    observer.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true
    });
  });
}

/**
 * Polls for a condition until truthy or timeout.
 */
export function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 5000,
  intervalMs = 50
): Promise<boolean> {
  if (predicate()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - startTime >= timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, intervalMs);
  });
}
