import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  isSubmitControl,
  assertNotSubmitControl,
  safeSetFieldValue,
  SubmitGuardViolationError
} from '../../extension/src/content/submitGuard';

describe('Submit Guard (Runtime Enforcement)', () => {
  it('correctly identifies submit buttons and inputs', () => {
    const form = document.createElement('form');
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';

    const submitInput = document.createElement('input');
    submitInput.type = 'submit';

    const applyDiv = document.createElement('div');
    applyDiv.setAttribute('role', 'button');
    applyDiv.textContent = 'Submit Application';

    const textInput = document.createElement('input');
    textInput.type = 'text';

    expect(isSubmitControl(form)).toBe(true);
    expect(isSubmitControl(submitBtn)).toBe(true);
    expect(isSubmitControl(submitInput)).toBe(true);
    expect(isSubmitControl(applyDiv)).toBe(true);
    expect(isSubmitControl(textInput)).toBe(false);
  });

  it('throws SubmitGuardViolationError when attempting to touch a submit element', () => {
    const submitInput = document.createElement('input');
    submitInput.type = 'submit';

    expect(() => assertNotSubmitControl(submitInput)).toThrow(SubmitGuardViolationError);
    expect(() => safeSetFieldValue(submitInput, 'submit')).toThrow(SubmitGuardViolationError);
  });

  it('safely sets value and dispatches input and change events on regular inputs', () => {
    const input = document.createElement('input');
    input.type = 'text';

    let inputFired = false;
    let changeFired = false;

    input.addEventListener('input', () => { inputFired = true; });
    input.addEventListener('change', () => { changeFired = true; });

    safeSetFieldValue(input, 'Jane Doe');

    expect(input.value).toBe('Jane Doe');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });
});

describe('Submit Guard (Static Code Scanner)', () => {
  it('scans content script files to ensure no forbidden submit triggers exist', () => {
    const contentDir = path.resolve(__dirname, '../../extension/src/content');
    if (!fs.existsSync(contentDir)) return;

    const files = fs.readdirSync(contentDir, { recursive: true }) as string[];
    const tsFiles = files.filter(f => f.endsWith('.ts') && !f.includes('submitGuard.ts'));

    const forbiddenPatterns = [
      /\.submit\s*\(/,
      /\.requestSubmit\s*\(/,
      /dispatchEvent\s*\(\s*new\s+KeyboardEvent\s*\([^)]*['"]Enter['"]/
    ];

    for (const file of tsFiles) {
      const fullPath = path.join(contentDir, file);
      if (fs.statSync(fullPath).isDirectory()) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        expect(
          match,
          `Forbidden submit action detected in ${file}: ${pattern.toString()}`
        ).toBeNull();
      }
    }
  });
});
