import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'extension/dist');

async function runBuild() {
  console.log('🚀 Building Odos Extension...');

  // Ensure clean output directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  const alias = {
    '@core': path.resolve(rootDir, 'extension/src/core'),
    '@content': path.resolve(rootDir, 'extension/src/content'),
    '@background': path.resolve(rootDir, 'extension/src/background'),
    '@dashboard': path.resolve(rootDir, 'extension/src/dashboard'),
    '@popup': path.resolve(rootDir, 'extension/src/popup'),
    '@llm': path.resolve(rootDir, 'extension/src/llm')
  };

  // Step 1: Build Pages & Background (ES Module)
  console.log('📦 Step 1: Building Dashboard, Popup & Background...');
  await build({
    root: path.resolve(rootDir, 'extension'),
    plugins: [react()],
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          dashboard: path.resolve(rootDir, 'extension/dashboard.html'),
          popup: path.resolve(rootDir, 'extension/popup.html'),
          background: path.resolve(rootDir, 'extension/src/background/index.ts')
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background') return 'background.js';
            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    }
  });

  // Step 2: Build Content Script (Self-contained IIFE, no code splitting)
  console.log('📦 Step 2: Building Content Script (IIFE)...');
  await build({
    root: path.resolve(rootDir, 'extension'),
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: path.resolve(rootDir, 'extension/src/content/index.ts'),
        name: 'OdosContent',
        formats: ['iife'],
        fileName: () => 'content.js'
      },
      rollupOptions: {
        output: {
          extend: true
        }
      }
    }
  });

  // Step 3: Copy manifest.json & public static assets
  console.log('📄 Step 3: Copying manifest and assets...');
  fs.copyFileSync(
    path.resolve(rootDir, 'extension/manifest.json'),
    path.resolve(outDir, 'manifest.json')
  );

  const publicDir = path.resolve(rootDir, 'extension/public');
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, outDir, { recursive: true });
  }

  // Step 4: Verify Content Script Performance Budget (< 50 KB gzipped)
  const contentPath = path.resolve(outDir, 'content.js');
  if (fs.existsSync(contentPath)) {
    const rawBytes = fs.readFileSync(contentPath);
    const gzipped = zlib.gzipSync(rawBytes);
    const rawKb = (rawBytes.length / 1024).toFixed(2);
    const gzipKb = (gzipped.length / 1024).toFixed(2);

    console.log(`\n📊 Performance Budget Check:`);
    console.log(`   Content script raw: ${rawKb} KB`);
    console.log(`   Content script gzipped: ${gzipKb} KB (Budget: < 50 KB)`);

    if (gzipped.length > 50 * 1024) {
      console.error(`❌ Content script exceeded budget! (${gzipKb} KB > 50 KB)`);
      process.exit(1);
    } else {
      console.log(`✅ Content script is well within budget!`);
    }
  }

  console.log('\n🎉 Build completed successfully! Extension ready in extension/dist/');
}

runBuild().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
