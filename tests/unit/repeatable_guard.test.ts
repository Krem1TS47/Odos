import { describe, it, expect, beforeEach, vi } from 'vitest';
import { REPEATABLE_CONFIGS, triggerAdditionsForSection, findAddButton, nearestHeadingMatches } from '../../extension/src/core/repeatableManager';
import * as repeatable from '../../extension/src/core/repeatableManager';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { DEFAULT_PROFILE } from '../../extension/src/core/models';

describe('Repeatable additions guard (R9)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not click an Add button when the section container cannot be counted', async () => {
    document.body.innerHTML = `<button type="button" id="add">Add education</button>`;
    let clicks = 0;
    document.getElementById('add')!.addEventListener('click', () => clicks++);
    const cfg = REPEATABLE_CONFIGS.find((c) => c.type === 'education' && c.containerSelector.includes('educationSection'))!;
    const added = await triggerAdditionsForSection(document, cfg, 2);
    expect(added).toBe(0);
    expect(clicks).toBe(0);
  });

  it('document-wide fallback only matches buttons under a heading that names the section', () => {
    document.body.innerHTML = `
      <section><h3>Certifications</h3><button type="button" id="wrong">Add another school</button></section>
      <section><h3>Education</h3><div data-automation-id="educationSection"></div><button type="button" id="right">Add another school</button></section>`;
    const cfg = REPEATABLE_CONFIGS.find((c) => c.type === 'education' && c.containerSelector.includes('educationSection'))!;
    expect(nearestHeadingMatches(document.getElementById('wrong')!, 'education')).toBe(false);
    expect(nearestHeadingMatches(document.getElementById('right')!, 'education')).toBe(true);
    expect(findAddButton(document, cfg)?.id).toBe('right');
  });

  it('executeAutofill no longer triggers additions itself (single pass lives in the entry point)', async () => {
    const spy = vi.spyOn(repeatable, 'processDynamicAdditions');
    document.body.innerHTML = `<div data-automation-id="educationSection"><button type="button" data-automation-id="Add">Add</button></div>`;
    await executeAutofill([], { profile: { ...DEFAULT_PROFILE, education: [{ id: '1', school: 'A', degree: '', field: '', startDate: '', endDate: '', gpa: '' }] }, answers: [] });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stops after one click when the row count does not increase', async () => {
    document.body.innerHTML = `<div data-automation-id="educationSection"><button type="button" data-automation-id="Add">Add</button></div>`;
    let clicks = 0;
    document.querySelector('button')!.addEventListener('click', () => clicks++);
    const cfg = REPEATABLE_CONFIGS.find((c) => c.type === 'education' && c.containerSelector.includes('educationSection'))!;
    const added = await triggerAdditionsForSection(document, cfg, 3);
    expect(added).toBe(1);
    expect(clicks).toBe(1);
  });
});
