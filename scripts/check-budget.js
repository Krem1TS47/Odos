import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contentPath = path.resolve(__dirname, '../extension/dist/content.js');

if (!fs.existsSync(contentPath)) {
  console.error('❌ extension/dist/content.js does not exist. Run "npm run build" first.');
  process.exit(1);
}

const rawBytes = fs.readFileSync(contentPath);
const gzipped = zlib.gzipSync(rawBytes);
const rawKb = (rawBytes.length / 1024).toFixed(2);
const gzipKb = (gzipped.length / 1024).toFixed(2);

console.log(`Content script raw size: ${rawKb} KB`);
console.log(`Content script gzipped size: ${gzipKb} KB (Budget: < 50 KB)`);

if (gzipped.length > 50 * 1024) {
  console.error(`❌ Content script exceeds 50 KB gzipped budget!`);
  process.exit(1);
} else {
  console.log(`✅ Performance budget satisfied!`);
}
