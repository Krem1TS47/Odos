import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.ts', 'extension/src/**/*.{test,spec}.ts']
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './extension/src/core'),
      '@content': path.resolve(__dirname, './extension/src/content'),
      '@background': path.resolve(__dirname, './extension/src/background'),
      '@dashboard': path.resolve(__dirname, './extension/src/dashboard'),
      '@popup': path.resolve(__dirname, './extension/src/popup'),
      '@llm': path.resolve(__dirname, './extension/src/llm')
    }
  }
});
