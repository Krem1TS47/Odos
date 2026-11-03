/**
 * Live page scan: shows how Odos classifies and fills every field on a page you saved from
 * Chrome (File > Save Page As > "Webpage, HTML only"), using your bundled profile and answers.
 *
 *   npm run scan -- ~/Downloads/application.html https://jobs.lever.co/acme/123/apply
 *
 * Widgets are not live here (no site JavaScript), so custom dropdowns report popup_not_found;
 * what this shows reliably is: adapter choice, question text, field type, which profile value
 * or stored answer would be used, and native select / radio / text outcomes.
 */
import { it } from 'vitest';
import fs from 'fs';
import path from 'path';
import bundled from '../../extension/src/core/config/bundledConfig.json';
import { ProfileSchema, StoredAnswerSchema } from '../../extension/src/core/models';
import { findMatchingAdapter } from '../../extension/src/content/adapters';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { mapElementToCanonical } from '../../extension/src/core/fieldMapper';
import { looksLikeApplicationForm } from '../../extension/src/content/index';

const file = process.env.ODOS_SCAN_FILE;
const url = process.env.ODOS_SCAN_URL || 'https://example.com/apply';

it.skipIf(!file)('scan saved page', async () => {
  const html = fs.readFileSync(path.resolve(file!), 'utf-8');
  document.documentElement.innerHTML = html;
  const profile = ProfileSchema.parse((bundled as any).profile);
  const answers = ((bundled as any).answers as any[]).map((a) => StoredAnswerSchema.parse(a));
  const adapter = findMatchingAdapter(new URL(url), document);
  const lines: string[] = [];
  lines.push(`page: ${file}`);
  lines.push(`url: ${url}`);
  lines.push(`adapter: ${adapter?.id ?? 'none'}   looks like an application form: ${looksLikeApplicationForm(document)}`);
  if (!adapter) {
    console.log(lines.join('\n'));
    return;
  }
  const fields = adapter.discoverFields(document);
  await executeAutofill(fields, { profile, answers, adapterId: adapter.id });
  lines.push(`fields: ${fields.length}\n`);
  lines.push(['status', 'type', 'question', 'mapped to', 'source', 'value', 'reason'].join(' | '));
  for (const f of fields) {
    const m = mapElementToCanonical(f.element, { id: f.id, name: f.name, type: f.type, labelText: f.label });
    lines.push(
      [
        f.status || '-',
        f.dropdownVariant ? `${f.type}:${f.dropdownVariant}` : f.type,
        f.label.slice(0, 80),
        m.canonical ? `${m.canonical} (${m.confidence})` : '-',
        f.source || '-',
        (f.matchedValue || f.suggestion?.text || '').slice(0, 50),
        f.statusReason || ''
      ].join(' | ')
    );
  }
  console.log('\n' + lines.join('\n') + '\n');
});
