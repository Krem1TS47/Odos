// Generates simple valid PNG icons for Chrome extension
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.resolve(__dirname, '../extension/public/icons');
fs.mkdirSync(iconsDir, { recursive: true });

// Minimal 1x1 base64 transparent PNG, or create simple solid color PNGs
// Minimal valid PNG buffer:
function createSolidColorPng(width, height) {
  // Simplest valid uncompressed PNG with indigo color #4f46e5 (RGBA: 79, 70, 229, 255)
  // Or we can write an SVG icon as fallback and use minimal PNG data:
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEeQHzE19+6wAAAABJRU5ErkJggg==';
  return Buffer.from(base64Png, 'base64');
}

for (const size of [16, 48, 128]) {
  const iconPath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(iconPath, createSolidColorPng(size, size));
}

console.log('Icons created in', iconsDir);
