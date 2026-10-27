/**
 * DOM Utilities: shadow-root piercing queries, bounded async waits, visibility
 * checks, and the added-node recorder used to scope dropdown option pools.
 *
 * Performance contract (eng review R15):
 *  - waitForElement observes childList+subtree only (never attributes), coalesces
 *    callbacks per animation frame, and checks only the nodes that were added.
 *  - Callers pass the narrowest root they know (e.g. the listbox a combobox owns).
 */

/**
 * Escapes a string for use inside a CSS attribute selector. Shared by all adapters.
 */
export function escapeCss(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Traverses light DOM and any open shadow roots to find the first matching element.
 */
export function deepQuerySelector(selector: string, root: ParentNode = document): Element | null {
  const lightMatch = root.querySelector(selector);
  if (lightMatch) return lightMatch;

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

  const lightMatches = root.querySelectorAll(selector);
  results.push(...Array.from(lightMatches));

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
 * Schedules a callback on the next animation frame (or a short timer when rAF is unavailable).
 */
export function nextFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => cb());
  } else {
    setTimeout(cb, 16);
  }
}

/**
 * Returns the first element matching `selector` among `node` itself and its subtree
 * (including open shadow roots).
 */
function matchInAddedNode(node: Node, selector: string): Element | null {
  if (node.nodeType !== 1) return null;
  const el = node as Element;
  try {
    if (el.matches(selector)) return el;
  } catch {
    return null;
  }
  return deepQuerySelector(selector, el);
}

/**
 * Asynchronously waits for an element matching `selector` to appear under `root`.
 * Observes added nodes only; attribute churn never triggers a scan.
 */
export function waitForElement(
  selector: string,
  timeoutMs = 5000,
  root: ParentNode = document
): Promise<Element | null> {
  const existing = deepQuerySelector(selector, root);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let scheduled = false;
    let pending: Node[] = [];
    let done = false;

    const finish = (el: Element | null) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      observer.disconnect();
      resolve(el);
    };

    const flush = () => {
      scheduled = false;
      if (done) return;
      const nodes = pending;
      pending = [];
      for (const n of nodes) {
        const found = matchInAddedNode(n, selector);
        if (found) {
          finish(found);
          return;
        }
      }
    };

    const observer = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n.nodeType === 1) pending.push(n);
        });
      }
      if (!scheduled && pending.length > 0) {
        scheduled = true;
        nextFrame(flush);
      }
    });

    timer = setTimeout(() => finish(null), timeoutMs);

    const observeTarget: Node = (root as Document).body || (root as Node);
    observer.observe(observeTarget, { childList: true, subtree: true });
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

export interface AddedNodeRecorder {
  /** Stops observing and returns every element added since start (document order). */
  stop(): Element[];
  /** Snapshot of elements added so far without stopping. */
  peek(): Element[];
}

/**
 * Records elements added under `root` from now until stop(). Used to find the
 * listbox/menu that a combobox opened (eng review R10: appeared-after-click).
 */
export function startAddedNodeRecorder(root: ParentNode = document): AddedNodeRecorder {
  const added: Element[] = [];
  const seen = new Set<Element>();
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && !seen.has(n as Element)) {
          seen.add(n as Element);
          added.push(n as Element);
        }
      });
    }
  });
  const target: Node = (root as Document).body || (root as Node);
  observer.observe(target, { childList: true, subtree: true });
  return {
    stop() {
      observer.disconnect();
      return added.slice();
    },
    peek() {
      return added.slice();
    }
  };
}

/**
 * True when the element is not hidden by aria-hidden, the hidden attribute, or
 * display:none / visibility:hidden on itself or an ancestor. offsetParent is not
 * used because jsdom never lays out.
 */
export function isElementVisible(el: Element | null | undefined, options: { computed?: boolean } = {}): boolean {
  if (!el) return false;
  const useComputed = options.computed !== false;
  let node: Element | null = el;
  let depth = 0;
  while (node) {
    if (node.getAttribute('aria-hidden') === 'true') return false;
    if (node.hasAttribute('hidden')) return false;
    const style = (node as HTMLElement).style;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    // Computed style is expensive (jsdom re-cascades stylesheets); only consult it for the
    // element itself and its first two ancestors.
    if (useComputed && depth < 3 && typeof getComputedStyle === 'function') {
      try {
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      } catch {
        // ignore
      }
    }
    const parent: Node | null = node.parentNode;
    if (parent && (parent as ShadowRoot).host) {
      node = (parent as ShadowRoot).host;
    } else {
      node = node.parentElement;
    }
    depth++;
  }
  return true;
}

/**
 * Resolves the element(s) referenced by an id-list attribute (aria-controls, aria-owns, aria-labelledby).
 */
export function resolveIdRefs(el: Element, attr: string, doc: Document = document): Element[] {
  const raw = el.getAttribute(attr);
  if (!raw) return [];
  const root: ParentNode = (el.getRootNode && (el.getRootNode() as ParentNode)) || doc;
  const out: Element[] = [];
  for (const id of raw.split(/\s+/).filter(Boolean)) {
    const found =
      (root as Document | ShadowRoot).getElementById?.(id) ||
      doc.getElementById(id) ||
      null;
    if (found) out.push(found);
  }
  return out;
}
