import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForElement, startAddedNodeRecorder, isElementVisible } from '../../extension/src/core/dom';

describe('waitForElement (R15: childList-only, coalesced, bounded)', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('resolves when a matching node is added, ignoring attribute churn', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = waitForElement('[role="option"]', 1000, document);

    // Attribute mutations must not satisfy the wait
    host.setAttribute('aria-expanded', 'true');
    host.className = 'churn';
    await new Promise((r) => setTimeout(r, 30));

    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    host.appendChild(li);
    const found = await p;
    expect(found).toBe(li);
  });

  it('finds matches nested inside an added subtree', async () => {
    const p = waitForElement('.select__option', 1000, document);
    const menu = document.createElement('div');
    menu.innerHTML = '<div class="select__menu"><div class="select__option">A</div></div>';
    document.body.appendChild(menu);
    expect((await p)?.textContent).toBe('A');
  });

  it('gives up at the cap and resolves null', async () => {
    vi.useFakeTimers();
    const p = waitForElement('.never', 800, document);
    vi.advanceTimersByTime(799);
    let settled = false;
    p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(2);
    expect(await p).toBeNull();
  });

  it('records nodes added after start for appeared-after-click routing', async () => {
    const rec = startAddedNodeRecorder(document);
    const a = document.createElement('ul');
    document.body.appendChild(a);
    await new Promise((r) => setTimeout(r, 0));
    expect(rec.peek()).toContain(a);
    const after = rec.stop();
    expect(after).toContain(a);
  });

  it('treats aria-hidden / hidden / display:none ancestors as invisible', () => {
    document.body.innerHTML = `
      <div aria-hidden="true"><span id="a">x</span></div>
      <div hidden><span id="b">x</span></div>
      <div style="display:none"><span id="c">x</span></div>
      <div><span id="d">x</span></div>`;
    expect(isElementVisible(document.getElementById('a'))).toBe(false);
    expect(isElementVisible(document.getElementById('b'))).toBe(false);
    expect(isElementVisible(document.getElementById('c'))).toBe(false);
    expect(isElementVisible(document.getElementById('d'))).toBe(true);
  });
});
