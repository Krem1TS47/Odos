import { describe, it, expect } from 'vitest';
import {
  resolveOption,
  deriveApplicableDictionaries,
  matchesTerm,
  OptionCandidate,
  OPTION_MATCH_FLOOR
} from '../../extension/src/core/dropdownResolver';

const cands = (texts: string[]): OptionCandidate[] => texts.map((t, i) => ({ text: t, value: t.toLowerCase().replace(/\s+/g, '_'), index: i }));

describe('Dictionary scoping and short-token rules (R5)', () => {
  it('"in" does not turn "Not in the US" into India', () => {
    const res = resolveOption(cands(['Not in the US', 'In the US']), 'India');
    expect(res.selected).toBeNull();
  });

  it('"Work phone" is not treated as work authorization, and "work" does not pick a landline', () => {
    const res = resolveOption(cands(['Yes, I am authorized', 'No, I am not authorized']), 'Work', 'work_authorization');
    expect(res.selected).toBeNull();
    const phone = resolveOption(cands(['Mobile', 'Home', 'Work']), 'Mobile', 'phone_type');
    expect(phone.selected?.candidate.text).toBe('Mobile');
  });

  it('"MS" in a state list does not match through the degree dictionary', () => {
    const states = cands(['Mississippi', 'Missouri', 'Montana']);
    const res = resolveOption(states, 'Master of Science');
    expect(res.selected).toBeNull();
    // but an abbreviation set off by parentheses still matches via the short-token rule
    expect(matchesTerm('bachelor s degree ba bs bfa', 'bs', "Bachelor's Degree (BA, BS, BFA)")).toBe(true);
    expect(matchesTerm('bs engineering', 'bs', 'BS Engineering')).toBe(false);
    expect(matchesTerm('bs', 'bs', 'BS')).toBe(true);
  });

  it('derives the yes/no dictionary from the option set when no hint is given', () => {
    const yesNo = cands(['Yes, I agree', 'No, I disagree']);
    expect(deriveApplicableDictionaries(yesNo).length).toBeGreaterThan(0);
    const res = resolveOption(yesNo, 'No');
    expect(res.selected?.candidate.index).toBe(1);
    expect(res.selected?.strategy).toBe('synonym');
  });

  it('does not apply a dictionary when only one of its keys appears among the options', () => {
    // Only the "yes" side of the boolean dictionary is present; "no" must not be forced onto anything
    const res = resolveOption(cands(['I agree to the terms', 'Send me updates']), 'No');
    expect(res.selected).toBeNull();
  });

  it('country shortcuts resolve with the country hint', () => {
    const res = resolveOption(cands(['Canada', 'United States of America', 'United Kingdom']), 'USA', 'country');
    expect(res.selected?.candidate.index).toBe(1);
    expect(res.selected!.score).toBeGreaterThanOrEqual(OPTION_MATCH_FLOOR);
  });

  it('placeholder options are never selected', () => {
    const res = resolveOption(cands(['Select one', 'Please select', 'Option A']), 'select');
    expect(res.selected).toBeNull();
  });
});
