import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './extension/src/core'),
      '@content': path.resolve(__dirname, './extension/src/content'),
      '@background': path.resolve(__dirname, './extension/src/background'),
      '@dashboard': path.resolve(__dirname, './extension/src/dashboard'),
      '@popup': path.resolve(__dirname, './extension/src/popup'),
      '@llm': path.resolve(__dirname, './extension/src/llm'),
      '@ui': path.resolve(__dirname, './extension/src/components/ui'),
      '@lib': path.resolve(__dirname, './extension/src/lib')
    }
  }
});
