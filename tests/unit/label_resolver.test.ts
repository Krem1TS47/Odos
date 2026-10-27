import { describe, it, expect, beforeEach } from 'vitest';
import { resolveFieldLabel, getElementLabelText } from '../../extension/src/core/fieldMapper';
import { escapeCss } from '../../extension/src/core/dom';

describe('Shared label resolver (R12)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('joins multi-id aria-labelledby in order', () => {
    document.body.innerHTML = `<span id="a">Phone</span><span id="b">Device Type</span><button id="btn" aria-labelledby="a b">Select one</button>`;
    expect(resolveFieldLabel(document.getElementById('btn')!)).toBe('Phone Device Type');
  });

  it('finds id-suffix labels (<id>-label) and label[for]', () => {
    document.body.innerHTML = `<div id="q1-label">Constellation application form</div><input id="q1" /><label for="q2">Email</label><input id="q2" />`;
    expect(resolveFieldLabel(document.getElementById('q1')!)).toBe('Constellation application form');
    expect(resolveFieldLabel(document.getElementById('q2')!)).toBe('Email');
  });

  it('uses a container heading that does not wrap another input, and ATS extras', () => {
    document.body.innerHTML = `
      <div class="field">
        <label><input type="checkbox" id="other" /> Other</label>
        <label class="label">Years of experience *</label>
        <input id="yrs" />
      </div>
      <div><input id="wd" data-automation-id="legalNameSection_firstName" /><span data-automation-id="legalNameSection_firstNameLabel">First Name</span></div>`;
    expect(resolveFieldLabel(document.getElementById('yrs')!)).toBe('Years of experience *');
    expect(
      resolveFieldLabel(document.getElementById('wd')!, document, {
        attributeLabel: (el, d) => d.querySelector(`[data-automation-id="${escapeCss(el.getAttribute('data-automation-id') || '')}Label"]`)?.textContent
      })
    ).toBe('First Name');
  });

  it('falls back to placeholder, then name, unless disabled', () => {
    document.body.innerHTML = `<input id="p" placeholder="Your city" name="city" /><input id="n" name="zip" />`;
    expect(resolveFieldLabel(document.getElementById('p')!)).toBe('Your city');
    expect(resolveFieldLabel(document.getElementById('n')!)).toBe('zip');
    expect(getElementLabelText(document.getElementById('n')!)).toBe('');
  });

  it('escapeCss handles ids with special characters', () => {
    document.body.innerHTML = `<label for="cards[1][field0]">Card question</label><input id="cards[1][field0]" />`;
    expect(resolveFieldLabel(document.getElementById('cards[1][field0]')!)).toBe('Card question');
  });
});
