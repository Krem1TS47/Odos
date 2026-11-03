import { defineConfig } from 'vitest/config';
import path from 'path';

/** `npm run scan -- <saved-page.html> [page-url]`: classify and dry-fill a saved real page. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 120000
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './extension/src/core'),
      '@content': path.resolve(__dirname, './extension/src/content')
    }
  }
});
