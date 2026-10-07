#!/usr/bin/env node
// Record the product beats of a video spec from the local Chatwoot.
// Usage: node record.mjs <spec.json> --take v01 [--only section1,section2]
// Writes <take>/capture/<section>/<beat>/NNN.png and <take>/capture/<section>/timeline.json.
// Spec format: ../reference/spec.md. Frames are screen states, not a screen recording: motion
// (cursor travel, camera focus, typing cadence) is rebuilt by render.py from the timeline.
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTarget, launchChrome, newPage, runRails, sleep } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const specPath = resolve(args[0] || '');
const take = flag('--take');
if (!args[0] || !existsSync(specPath) || !take) {
  console.error('usage: node record.mjs <spec.json> --take v01 [--only section1,section2]');
  process.exit(1);
}
const only = flag('--only')?.split(',');

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const takeDir = join(dirname(specPath), take);
const cfg = {
  baseUrl: 'http://localhost:3000',
  accountId: Number(process.env.CW_ACCOUNT_ID || 1), // seed_paper_layer.rb writes it; it changes on every RESET
  email: process.env.CW_EMAIL,
  password: process.env.CW_PASSWORD,
  viewport: { width: 1440, height: 900 },
  scale: 2, // 2880x1800 frames: enough pixels for a 4K final with focus zooms
  theme: 'light',
  hide: [],
  ...spec.config,
};
const HIDE_ALWAYS = ['.profiler-results', '#profiler', '#cw-widget-holder', '#cw-bubble-holder', '.woot-widget-holder', '.woot--bubble-holder'];

// Minimum screen time per event (seconds). render.py stretches the last event of a beat to fit narration.
const MIN = { start: 0.8, goto: 1.2, click: 1.4, hover: 1.0, press: 1.0, scroll: 1.0, snap: 0.8, charRate: 14 };
// Within a click event, the pre-click frame shows while the cursor travels; the result frame swaps in here.
const CLICK_SWITCH = 0.8;

async function prepare(page) {
  await page.send('Emulation.setDeviceMetricsOverride', { ...cfg.viewport, deviceScaleFactor: cfg.scale, mobile: false });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: cfg.theme }] });
  await page.send('Page.bringToFront'); // background tabs pause CSS transitions
}

async function hideNoise(page) {
  const css = `${[...HIDE_ALWAYS, ...cfg.hide].join(',')}{display:none!important}`;
  await page.eval(c => {
    let s = document.getElementById('__video_hide');
    if (!s) { s = document.createElement('style'); s.id = '__video_hide'; document.head.appendChild(s); }
    s.textContent = c;
  }, css);
}

async function ensureLogin(page) {
  await page.goto(`${cfg.baseUrl}/app/accounts/${cfg.accountId}/dashboard`);
  const onLogin = await page.eval(() => !!document.querySelector('[data-testid="email_input"]'));
  if (!onLogin) return;
  if (!cfg.email || !cfg.password) throw new Error('Not logged in. Set CW_EMAIL and CW_PASSWORD (the Paper Layer host agent) and rerun.');
  for (const [testid, value] of [['email_input', cfg.email], ['password_input', cfg.password]]) {
    const b = await page.box({ testid });
    await page.mouse('mousePressed', b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse('mouseReleased', b.x + b.width / 2, b.y + b.height / 2);
    await page.send('Input.insertText', { text: value });
  }
  const s = await page.box({ testid: 'submit_button' });
  await page.mouse('mousePressed', s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse('mouseReleased', s.x + s.width / 2, s.y + s.height / 2);
  await page.until(() => !document.querySelector('[data-testid="email_input"]'), [], 20000, 'login');
  await page.settle();
}

// Routes may use {account} and {env:NAME} (ids the seed writes to ~/.config/chatwoot-video/env, e.g. CW_HERO_CONTACT_ID).
const fill = p => p.replaceAll('{account}', cfg.accountId).replace(/\{env:([A-Z_]+)\}/g, (_, k) => {
  if (!process.env[k]) throw new Error(`${k} is not set: load ~/.config/chatwoot-video/env`);
  return process.env[k];
});
const url = p => (p.startsWith('http') ? fill(p) : `${cfg.baseUrl}${fill(p)}`);
const center = b => ({ x: (b.x + b.width / 2) * cfg.scale, y: (b.y + b.height / 2) * cfg.scale });
const cursorState = b => (b.cursor === 'pointer' ? 'hand' : b.cursor === 'text' ? 'ibeam' : 'arrow');

class BeatRecorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.events = [];
    this.n = 0;
  }

  async snap(kind, min, extra = {}) {
    await hideNoise(this.page);
    const file = join(this.dir, `${String(++this.n).padStart(3, '0')}.png`);
    writeFileSync(file, await this.page.screenshot());
    this.events.push({ file, kind, min, ...extra });
  }

  hold(seconds) {
    if (this.events.length) this.events.at(-1).min += seconds;
  }

  async click(target) {
    const b = await this.page.box(target, true);
    const c = center(b);
    await this.page.mouse('mouseMoved', c.x / cfg.scale, c.y / cfg.scale);
    await sleep(120);
    await this.page.mouse('mousePressed', c.x / cfg.scale, c.y / cfg.scale);
    await this.page.mouse('mouseReleased', c.x / cfg.scale, c.y / cfg.scale);
    await sleep(400);
    await this.page.settle();
    await this.snap('click', MIN.click, { switchAt: CLICK_SWITCH, cursor: { ...c, state: cursorState(b) } });
  }

  // Types in chunks and keeps every intermediate state, so the render shows real typing.
  async type({ target, text, every = 2, replace = true }) {
    await this.click(target);
    const b = await this.page.box(target);
    if (replace) {
      await this.page.eval(() => { const el = document.activeElement; if (el && 'value' in el) el.select?.(); });
      await this.page.key('Backspace');
    }
    const c = { ...center(b), state: 'ibeam' };
    for (let i = 0; i < text.length; i += every) {
      const chunk = text.slice(i, i + every);
      await this.page.send('Input.insertText', { text: chunk });
      await sleep(60);
      await this.snap('type', chunk.length / MIN.charRate, { cursor: c });
    }
    this.hold(0.4);
  }

  async step(step) {
    const [kind, arg] = Object.entries(step)[0];
    const p = this.page;
    if (kind === 'goto') { await p.goto(url(arg)); return this.snap('goto', MIN.goto); }
    if (kind === 'click') return this.click(arg);
    if (kind === 'type') return this.type(arg);
    if (kind === 'hover') {
      const b = await p.box(arg, true);
      const c = center(b);
      await p.mouse('mouseMoved', c.x / cfg.scale, c.y / cfg.scale);
      await sleep(500);
      return this.snap('hover', MIN.hover, { switchAt: CLICK_SWITCH, cursor: { ...c, state: cursorState(b) } });
    }
    if (kind === 'press') { await p.key(arg); await sleep(300); await p.settle(); return this.snap('press', MIN.press); }
    if (kind === 'scrollTo') { await p.eval(findTarget, arg, true); await sleep(400); return this.snap('scroll', MIN.scroll); }
    if (kind === 'snap') return this.snap('snap', MIN.snap);
    if (kind === 'hold') return this.hold(arg);
    if (kind === 'wait') return sleep(arg);
    if (kind === 'waitFor') return p.until(findTarget, [arg, false], 20000, JSON.stringify(arg));
    if (kind === 'eval') return p.eval(arg);
    if (kind === 'mock') return p.addMock(arg);
    if (kind === 'rails') return runRails(REPO, arg, p.captured);
    // Chatwoot remembers open panels per user; pin them so a section starts the same alone or mid-tour.
    // Takes effect on the next goto (the dashboard reads them when it loads).
    if (kind === 'ui') {
      return runRails(REPO, "User.find_by!(email: ENV['CW_EMAIL']).update!(ui_settings: JSON.parse(ENV['UI']))", {},
        { CW_EMAIL: cfg.email, UI: JSON.stringify(arg) });
    }
    throw new Error(`Unknown step: ${kind}`);
  }
}

async function recordSection(page, section) {
  const sectionDir = join(takeDir, 'capture', section.id);
  rmSync(sectionDir, { recursive: true, force: true }); // a take never mixes frames from older runs
  rmSync(`${sectionDir}.FAILED.png`, { force: true });
  mkdirSync(sectionDir, { recursive: true });
  const runner = new BeatRecorder(page, sectionDir);
  for (const step of section.setup || []) await runner.step(step);

  const beats = [];
  for (const beat of section.beats) {
    if (beat.scene) { // motion-graphic beat, rendered by cards.mjs
      beats.push({ id: beat.id, scene: beat.scene });
      continue;
    }
    const rec = new BeatRecorder(page, join(sectionDir, beat.id));
    mkdirSync(rec.dir, { recursive: true });
    const steps = [...(beat.do || [])];
    // A beat that opens a page starts on that page, not on whatever the browser showed before.
    if (steps[0]?.goto) await page.goto(url(steps.shift().goto));
    await rec.snap('start', MIN.start);
    for (const step of steps) await rec.step(step);
    if (beat.hold) rec.hold(beat.hold);
    const focus = beat.focus ? await page.box(beat.focus) : null;
    beats.push({
      id: beat.id,
      zoom: beat.zoom || 1.3,
      drift: beat.drift || 0,
      focus: focus && { x: focus.x * cfg.scale, y: focus.y * cfg.scale, width: focus.width * cfg.scale, height: focus.height * cfg.scale },
      events: rec.events,
    });
    console.log(`  beat ${beat.id}: ${rec.events.length} frames`);
  }
  const size = { width: cfg.viewport.width * cfg.scale, height: cfg.viewport.height * cfg.scale };
  writeFileSync(join(sectionDir, 'timeline.json'), JSON.stringify({ section: section.id, take, size, recordedAt: new Date().toISOString(), beats }, null, 2));
}

// Static pages a beat embeds (e.g. a dashboard app): "serve": { "port": 3099, "dir": "templates/apps" } (dir relative to the skill).
let server = null;
if (cfg.serve) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', cfg.serve.dir);
  server = createServer((req, res) => {
    const file = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' }).end(readFileSync(file));
  }).listen(cfg.serve.port);
}

const { proc, port } = await launchChrome(cfg.viewport);
const page = await newPage(port);
let failed = false;
try {
  await prepare(page);
  // Chatwoot keeps unsent reply drafts and UI state in localStorage; a take must not inherit them from the last run.
  // Cookies (the login) are kept.
  await page.send('Storage.clearDataForOrigin', { origin: cfg.baseUrl, storageTypes: 'local_storage,indexeddb,cache_storage' });
  if (cfg.login !== false) await ensureLogin(page);
  for (const section of spec.sections) {
    if (section.skip || (only && !only.includes(section.id))) continue;
    if (!section.beats.some(b => !b.scene)) continue; // scene-only sections need no browser capture
    console.log(`section ${section.id}`);
    try {
      await recordSection(page, section);
    } catch (e) {
      failed = true;
      console.log(`FAIL  ${section.id}: ${e.message}`);
      writeFileSync(join(takeDir, 'capture', `${section.id}.FAILED.png`), await page.screenshot().catch(() => Buffer.alloc(0)));
    }
    page.mocks = [];
    await page.send('Fetch.disable').catch(() => {});
  }
} finally {
  page.ws.close();
  proc.kill();
  server?.close();
}
process.exit(failed ? 2 : 0);
