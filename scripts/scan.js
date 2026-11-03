#!/usr/bin/env node
// Usage: npm run scan -- <saved-page.html> [page-url]
import { spawnSync } from 'child_process';
import path from 'path';

const [file, url] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run scan -- <saved-page.html> [page-url]\nSave the application page in Chrome with File > Save Page As > "Webpage, HTML only".');
  process.exit(1);
}
const res = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', '--config', 'vitest.live.config.ts', '--silent=false'],
  { stdio: 'inherit', env: { ...process.env, ODOS_SCAN_FILE: path.resolve(file), ODOS_SCAN_URL: url || '' } }
);
process.exit(res.status ?? 1);
