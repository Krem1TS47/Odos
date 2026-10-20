import fs from 'fs';
import path from 'path';

function inspectLever() {
  const html = fs.readFileSync('tests/fixtures/lever/lever_application.html', 'utf-8');
  console.log('--- LEVER FINGERPRINTS ---');
  console.log('Has form#application-form:', html.includes('id="application-form"'));
  console.log('Has name field:', html.includes('name="name"'));
  console.log('Has email field:', html.includes('name="email"'));
  console.log('Has phone field:', html.includes('name="phone"'));
  console.log('Has org field:', html.includes('name="org"'));
  console.log('Has urls[LinkedIn]:', html.includes('name="urls[LinkedIn]"'));
  console.log('Has urls[GitHub]:', html.includes('name="urls[GitHub]"'));
  console.log('Has urls[Portfolio]:', html.includes('name="urls[Portfolio]"'));
  console.log('Has resume file:', html.includes('name="resume"'));
  console.log('Has cards questions:', html.includes('name="cards['));
  console.log('Has hCaptcha:', html.includes('hcaptcha') || html.includes('h-captcha'));
  console.log('Has JSON-LD JobPosting:', html.includes('JobPosting'));
}

async function fetchAshby() {
  console.log('Fetching Ashby board for Applied Intuition...');
  const res = await fetch('https://jobs.ashbyhq.com/appliedintuition');
  const html = await res.text();
  const match = html.match(/\/appliedintuition\/([a-f0-9\-]+)/);
  if (!match) {
    console.log('No job URL found on Ashby page');
    return;
  }
  const jobUrl = `https://jobs.ashbyhq.com/appliedintuition/${match[1]}/application`;
  console.log('Fetching Ashby job apply page:', jobUrl);
  const applyRes = await fetch(jobUrl);
  const applyHtml = await applyRes.text();

  const destDir = path.resolve('tests/fixtures/ashby');
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, 'ashby_application.html'), applyHtml, 'utf-8');
  console.log('Saved Ashby fixture:', applyHtml.length, 'bytes');

  console.log('--- ASHBY FINGERPRINTS ---');
  console.log('Has _systemfield_name:', applyHtml.includes('_systemfield_name'));
  console.log('Has _systemfield_email:', applyHtml.includes('_systemfield_email'));
  console.log('Has _systemfield_resume:', applyHtml.includes('_systemfield_resume'));
  console.log('Has _systemfield_:', applyHtml.includes('_systemfield_'));
  console.log('Has ashby in script src:', applyHtml.includes('ashbyhq.com'));
  console.log('Has JSON-LD JobPosting:', applyHtml.includes('JobPosting'));
}

import { execFileSync } from 'child_process';

async function fetchWorkday() {
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const url = 'https://workday.wd5.myworkdayjobs.com/en-US/Workday';
  console.log('Rendering Workday via headless chrome...');
  try {
    const output = execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--virtual-time-budget=6000',
      '--dump-dom',
      url
    ], { maxBuffer: 20 * 1024 * 1024 }).toString();

    console.log('Workday output length:', output.length);
    const autoIds = [...output.matchAll(/data-automation-id="([^"]+)"/g)].map(m => m[1]);
    console.log('Found', autoIds.length, 'data-automation-id elements:');
    console.log([...new Set(autoIds)].slice(0, 20));

    const destDir = path.resolve('tests/fixtures/workday');
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'workday_listing.html'), output, 'utf-8');
    console.log('Saved tests/fixtures/workday/workday_listing.html');
  } catch (err) {
    console.error('Workday fetch error:', err.message);
  }
}

async function fetchWaymo() {
  console.log('Fetching careers.withwaymo.com...');
  try {
    const res = await fetch('https://careers.withwaymo.com');
    const html = await res.text();
    console.log('Waymo length:', html.length);
    console.log('Has greenhouse:', html.toLowerCase().includes('greenhouse'));
    console.log('Has grnhse:', html.toLowerCase().includes('grnhse'));
    console.log('Has gh_jid:', html.includes('gh_jid'));
    console.log('Has iframe:', html.includes('<iframe'));
    const matches = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
    const ghMatches = matches.filter(s => s.includes('greenhouse') || s.includes('grnhse'));
    console.log('Greenhouse script/iframe src matches:', ghMatches);

    const destDir = path.resolve('tests/fixtures/greenhouse');
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'waymo_careers_home.html'), html, 'utf-8');
    console.log('Saved tests/fixtures/greenhouse/waymo_careers_home.html');
  } catch (err) {
    console.error('Waymo error:', err.message);
  }
}

async function inspectWaymoJob() {
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const url = 'https://careers.withwaymo.com/';
  console.log('Rendering Waymo via headless chrome...');
  const output = execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--virtual-time-budget=6000',
    '--dump-dom',
    url
  ], { maxBuffer: 20 * 1024 * 1024 }).toString();

  const links = [...output.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  console.log('Found', links.length, 'links in rendered Waymo page:');
  const jobLinks = links.filter(l => l.includes('/jobs/') || l.includes('job') || l.includes('gh_jid') || l.includes('openings'));
  console.log('Job links:', jobLinks.slice(0, 10));

  // Also check if greenhouse or grnhse is in the rendered output
  console.log('Rendered Waymo has greenhouse:', output.toLowerCase().includes('greenhouse'));
  console.log('Rendered Waymo has grnhse:', output.toLowerCase().includes('grnhse'));
  console.log('Rendered Waymo has gh_jid:', output.includes('gh_jid'));
  console.log('Rendered Waymo has iframes:', [...output.matchAll(/<iframe[^>]+src="([^"]+)"/g)].map(m => m[1]));

  fs.writeFileSync('tests/fixtures/greenhouse/waymo_careers_home.html', output, 'utf-8');
}

async function fetchGreenhouse() {
  console.log('Fetching Anthropic Greenhouse board...');
  try {
    const res = await fetch('https://job-boards.greenhouse.io/anthropic');
    const html = await res.text();
    const matches = [...html.matchAll(/href="([^"]*jobs[^"]*)"/g)].map(m => m[1]);
    console.log('Anthropic job matches:', matches.slice(0, 5));
    const jobPath = matches.find(m => m.includes('/jobs/'));
    if (jobPath) {
      const jobUrl = jobPath.startsWith('http') ? jobPath : `https://job-boards.greenhouse.io${jobPath}`;
      console.log('Fetching Greenhouse job URL:', jobUrl);
      const jobRes = await fetch(jobUrl);
      const jobHtml = await jobRes.text();

      console.log('--- GREENHOUSE NEW BOARD FINGERPRINTS ---');
      console.log('Has job-boards.greenhouse.io:', jobHtml.includes('greenhouse.io'));
      console.log('Has question_:', jobHtml.includes('question_') || jobHtml.includes('id="question'));
      console.log('Has combobox:', jobHtml.includes('role="combobox"') || jobHtml.includes('combobox'));
      console.log('Has first_name:', jobHtml.includes('first_name'));
      console.log('Has JSON-LD JobPosting:', jobHtml.includes('JobPosting'));

      const destDir = path.resolve('tests/fixtures/greenhouse');
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, 'greenhouse_new_board.html'), jobHtml, 'utf-8');
      console.log('Saved tests/fixtures/greenhouse/greenhouse_new_board.html');
    }
  } catch (err) {
    console.error('Greenhouse error:', err.message);
  }
}

async function run() {
  inspectLever();
  await fetchGreenhouse();
}

run().catch(console.error);
