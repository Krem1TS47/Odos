# ATS Adapter Authoring Guide

## Overview
Every ATS (Greenhouse, Lever, Ashby, and Generic fallback) implements the `AtsAdapter` interface.

```typescript
export interface AtsAdapter {
  id: string;
  matches(url: URL, doc: Document): boolean;
  extractJob(doc: Document): Partial<Job>;
  discoverFields(doc: Document): FormField[];
  confirmationDetected(url: URL, doc: Document): boolean;
}
```

## Safety Rule: Submit Guard
Adapters must **never** interact with or submit forms.
- Do **not** call `.click()` on buttons with `type="submit"` or text indicating submission.
- Do **not** call `.submit()` or `.requestSubmit()` on any `<form>`.
- Do **not** dispatch synthetic `Enter` keypress events.
- All form writes must use `safeSetFieldValue(element, value)` from `@content/submitGuard`.

## Field Discovery
Adapters should inspect elements and return:
```typescript
export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'url' | 'select' | 'textarea' | 'file' | 'radio' | 'checkbox';
  element: HTMLElement;
  required: boolean;
  options?: string[]; // for select/radio
}
```

## Confirmation Detection
`confirmationDetected(url, doc)` should inspect the DOM and URL after submission to determine if the application was successfully submitted (e.g. "Thank you for applying", "#confirmation" in URL).
If ambiguous, Odos presents the user with a single prompt: *"Did you submit? (Yes / No / Later)"*.
