import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import YAML from 'yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'extension/dist');

/**
 * Pre-processes repo YAML configuration into a bundled seed JSON asset.
 */
function prepareYamlConfiguration() {
  console.log('📋 Step 0: Processing repo YAML configuration...');

  // 1. Profile YAML
  const profilePath = path.resolve(rootDir, 'config/profile.yaml');

  let profile = {
    schemaVersion: 1,
    contact: { fullName: '', firstName: '', lastName: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '' },
    workAuthorization: { authorizedCountries: [], requiresSponsorship: false },
    education: [],
    experience: [],
    skills: [],
    resumes: []
  };

  let defaultResumeRelPath = '';

  if (fs.existsSync(profilePath)) {
    const raw = YAML.parse(fs.readFileSync(profilePath, 'utf-8')) || {};
    const contactRaw = raw.contact || raw.personal || {};
    const firstName = contactRaw.first_name || contactRaw.firstName || '';
    const lastName = contactRaw.last_name || contactRaw.lastName || '';
    const fullName = (contactRaw.full_name || contactRaw.fullName || `${firstName} ${lastName}`).trim();

    let locationStr = '';
    if (typeof contactRaw.location === 'object' && contactRaw.location !== null) {
      locationStr = [contactRaw.location.city, contactRaw.location.state, contactRaw.location.country].filter(Boolean).join(', ');
    } else if (typeof contactRaw.location === 'string') {
      locationStr = contactRaw.location;
    }

    const phone = contactRaw.phone ? `${contactRaw.area || ''}${contactRaw.phone}`.trim() : '';

    const workAuthRaw = raw.work_authorization || raw.workAuthorization || {};
    const countries = workAuthRaw.authorized_countries || workAuthRaw.authorized_to_work_in || workAuthRaw.authorizedCountries || [];

    profile = {
      schemaVersion: 1,
      contact: {
        fullName,
        firstName,
        lastName,
        email: contactRaw.email || '',
        phone,
        location: locationStr,
        linkedin: contactRaw.linkedin || '',
        github: contactRaw.github || '',
        website: contactRaw.website || contactRaw.portfolio || ''
      },
      workAuthorization: {
        authorizedCountries: Array.isArray(countries) ? countries.map(String) : [],
        requiresSponsorship: Boolean(workAuthRaw.requires_sponsorship ?? workAuthRaw.requiresSponsorship ?? false)
      },
      education: Array.isArray(raw.education)
        ? raw.education.map((edu, i) => ({
            id: edu.id || `edu_${i + 1}`,
            school: edu.school || '',
            degree: edu.degree || '',
            field: edu.field || '',
            startDate: edu.start_date || edu.startDate || edu.start || '',
            endDate: edu.end_date || edu.endDate || edu.end || '',
            gpa: edu.gpa ? String(edu.gpa) : ''
          }))
        : [],
      experience: Array.isArray(raw.experience)
        ? raw.experience.map((exp, i) => ({
            id: exp.id || `exp_${i + 1}`,
            company: exp.company || '',
            title: exp.title || '',
            startDate: exp.start_date || exp.startDate || exp.start || '',
            endDate: exp.end_date || exp.endDate || exp.end || '',
            summary: exp.summary || ''
          }))
        : [],
      skills: Array.isArray(raw.skills) ? raw.skills.map(String) : [],
      resumes: []
    };

    if (raw.resumes && typeof raw.resumes === 'object' && raw.resumes.default) {
      defaultResumeRelPath = raw.resumes.default;
    }
  }

  // 2. Answers YAML
  const answersPath = path.resolve(rootDir, 'config/answers.yaml');

  const answers = [];
  if (fs.existsSync(answersPath)) {
    const raw = YAML.parse(fs.readFileSync(answersPath, 'utf-8')) || {};
    if (Array.isArray(raw.answers)) {
      raw.answers.forEach((item, i) => {
        if (!item || typeof item !== 'object') return;
        const patterns = Array.isArray(item.patterns)
          ? item.patterns.map(String)
          : item.pattern
          ? [String(item.pattern)]
          : [];
        if (patterns.length === 0) return;

        answers.push({
          id: item.id || `ans_${i + 1}`,
          questionPatterns: patterns,
          category: ['eligibility', 'demographic', 'motivation', 'logistics', 'other'].includes(item.category)
            ? item.category
            : 'other',
          answer: String(item.answer || ''),
          autoFill: Boolean(item.autofill ?? item.autoFill ?? false)
        });
      });
    }
  }

  // 3. Default Resume binary
  let defaultResume = null;
  const candidateResumePaths = [
    defaultResumeRelPath ? path.resolve(rootDir, 'config', defaultResumeRelPath) : null,
    defaultResumeRelPath ? path.resolve(rootDir, defaultResumeRelPath) : null,
    path.resolve(rootDir, 'config/resumes/Benjamin_Ching_Resume.pdf')
  ].filter(Boolean);

  for (const p of candidateResumePaths) {
    if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
      const fileName = path.basename(p);
      const fileBuffer = fs.readFileSync(p);
      const base64 = fileBuffer.toString('base64');
      defaultResume = {
        fileName,
        fileType: 'application/pdf',
        fileSize: fileBuffer.length,
        dataBase64: base64
      };
      console.log(`   📄 Bundled resume: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
      break;
    }
  }

  const bundledConfig = {
    profile,
    answers,
    defaultResume,
    bundledAt: new Date().toISOString()
  };

  // Write to src/core/config/bundledConfig.json so TS can import it
  const srcConfigDir = path.resolve(rootDir, 'extension/src/core/config');
  fs.mkdirSync(srcConfigDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcConfigDir, 'bundledConfig.json'),
    JSON.stringify(bundledConfig, null, 2),
    'utf-8'
  );

  console.log(`   ✓ Profile parsed: ${profile.contact.fullName || 'User'} (${profile.skills.length} skills)`);
  console.log(`   ✓ Stored answers: ${answers.length} configured questions`);
  return bundledConfig;
}

async function runBuild() {
  console.log('🚀 Building Odos Extension...');

  // Ensure clean output directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Step 0: Process YAML files into bundledConfig.json
  const bundledConfig = prepareYamlConfiguration();

  const alias = {
    '@core': path.resolve(rootDir, 'extension/src/core'),
    '@content': path.resolve(rootDir, 'extension/src/content'),
    '@background': path.resolve(rootDir, 'extension/src/background'),
    '@dashboard': path.resolve(rootDir, 'extension/src/dashboard'),
    '@popup': path.resolve(rootDir, 'extension/src/popup'),
    '@llm': path.resolve(rootDir, 'extension/src/llm')
  };

  // Step 1: Build Pages & Background (ES Module)
  console.log('\n📦 Step 1: Building Dashboard, Popup & Background...');
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
  console.log('\n📦 Step 2: Building Content Script (IIFE)...');
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
  console.log('\n📄 Step 3: Copying manifest and assets...');
  fs.copyFileSync(
    path.resolve(rootDir, 'extension/manifest.json'),
    path.resolve(outDir, 'manifest.json')
  );

  const publicDir = path.resolve(rootDir, 'extension/public');
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, outDir, { recursive: true });
  }

  // Copy bundledConfig.json to dist
  fs.writeFileSync(
    path.resolve(outDir, 'bundledConfig.json'),
    JSON.stringify(bundledConfig, null, 2),
    'utf-8'
  );

  // Copy config resumes if existing
  const configResumes = path.resolve(rootDir, 'config/resumes');
  if (fs.existsSync(configResumes)) {
    fs.cpSync(configResumes, path.resolve(outDir, 'resumes'), { recursive: true });
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
