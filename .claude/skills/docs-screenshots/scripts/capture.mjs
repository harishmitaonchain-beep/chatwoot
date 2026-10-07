#!/usr/bin/env node
// Capture framed doc screenshots from a local Chatwoot through Chrome DevTools Protocol.
// Usage: node capture.mjs <spec.json> [--only id1,id2]
// Spec format: ../reference/shot-spec.md. Needs Node 22+ (global WebSocket) and Google Chrome.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const specPath = resolve(process.argv[2] || '');
if (!process.argv[2] || !existsSync(specPath)) {
  console.error('usage: node capture.mjs <spec.json> [--only id1,id2]');
  process.exit(1);
}
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1].split(',') : null;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const outDir = dirname(specPath);
const cfg = {
  baseUrl: 'http://localhost:3000',
  accountId: 1,
  email: process.env.CW_EMAIL || 'john@acme.inc',
  password: process.env.CW_PASSWORD,
  viewport: { width: 1440, height: 900 },
  scale: 2,
  theme: 'dark',
  // What the address bar shows. Cloud by default; set displayHost to the fake self-hosted domain for self-hosted shots.
  displayHost: 'app.chatwoot.com',
  displayAccountId: 318452,
  urlRewrites: [], // [["/captain/1/", "/captain/2917/"], ...] applied after the account swap
  crop: null, // full window (Safari frame); set a crop per shot for dialogs and panels
  frame: true,
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  profileDir: join(homedir(), 'Library/Caches/cw-docs-chrome'), // outside iCloud-synced Desktop: sync churn stalls page loads
  hide: [],
  ...spec.config,
};
// Handbook colors: annotation red #FE2500, brand blue #46A7F6.
const style = { color: '#FE2500', stroke: 4, radius: 8, padding: 6, font: 15, ...spec.style };
const HIDE_ALWAYS = ['#cw-widget-holder', '#cw-bubble-holder', '.woot-widget-holder', '.woot--bubble-holder',
  '[class*="toast"]', '.profiler-results', '#profiler'];

// ---------- CDP plumbing ----------
class Page {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.mocks = [];
    this.captured = {};
    this.ready = new Promise((ok, fail) => {
      this.ws.addEventListener('open', ok, { once: true });
      this.ws.addEventListener('error', fail, { once: true });
    });
    this.ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.method) {
        (this.listeners.get(m.method) || []).forEach(fn => fn(m.params));
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result || {});
    });
    this.on('Fetch.requestPaused', p => this.onPaused(p));
    this.on('Runtime.exceptionThrown', p => console.error(`  page error: ${p.exceptionDetails?.exception?.description?.split('\n')[0] || p.exceptionDetails?.text}`));
  }

  on(method, fn) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), fn]);
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.id++;
    const promise = new Promise((ok, fail) => this.pending.set(id, { ok, fail }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  // Staged responses (option c): fulfil matching API calls with demo data instead of hitting the backend.
  async onPaused({ requestId, request }) {
    const mock = this.mocks.find(m => request.url.includes(m.urlIncludes) && (!m.method || m.method === request.method));
    if (!mock) return this.send('Fetch.continueRequest', { requestId }).catch(() => {});
    this.captured[mock.urlIncludes] = { url: request.url, body: request.postData ? JSON.parse(request.postData) : null };
    const body = Buffer.from(JSON.stringify(mock.body ?? {})).toString('base64');
    return this.send('Fetch.fulfillRequest', {
      requestId, responseCode: mock.status || 200, body,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    }).catch(() => {});
  }

  async addMock(mock) {
    this.mocks.push(mock);
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  }

  async eval(fnOrExpr, ...args) {
    const expression = typeof fnOrExpr === 'function' ? `(${fnOrExpr})(...${JSON.stringify(args)})` : fnOrExpr;
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  }

  async until(fn, args = [], timeout = 15000, what = 'condition') {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.eval(fn, ...args).catch(() => false)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${what}`);
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await sleep(300);
    await this.until(() => document.readyState === 'complete', [], 30000, 'page load');
    // SPA: wait until the app has actually rendered (the first Vite compile can take a while)
    const rendered = () => (document.querySelector('#app')?.innerText || document.body.innerText || '').trim().length > 20;
    try {
      await this.until(rendered, [], 45000, 'app render');
    } catch {
      await this.send('Page.reload', { ignoreCache: false }); // a stalled Vite chunk usually loads on reload
      await this.until(rendered, [], 60000, 'app render (after reload)');
    }
    await this.settle();
  }

  // No spinners/skeletons for two polls in a row, then a short pause for transitions.
  async settle() {
    let calm = 0;
    const start = Date.now();
    while (calm < 2 && Date.now() - start < 12000) {
      const busy = await this.eval(() => !!document.querySelector('.animate-spin, [class*="skeleton"], [class*="spinner"]'));
      calm = busy ? 0 : calm + 1;
      await sleep(250);
    }
    await sleep(500);
  }

  async mouse(type, x, y) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
  }

  async click(target) {
    const b = await this.box(target, true);
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await this.mouse('mouseMoved', x, y);
    await sleep(80);
    await this.mouse('mousePressed', x, y);
    await this.mouse('mouseReleased', x, y);
    await sleep(400);
    await this.settle();
  }

  async hover(target) {
    const b = await this.box(target, true);
    await this.mouse('mouseMoved', b.x + b.width / 2, b.y + b.height / 2);
    await sleep(500);
  }

  async type(target, text) {
    await this.click(target);
    await this.eval(() => { const el = document.activeElement; if (el && 'value' in el) el.select?.(); });
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await this.send('Input.insertText', { text });
    await sleep(300);
  }

  async press(key) {
    const codes = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38 };
    const base = { key, code: key, windowsVirtualKeyCode: codes[key] || 0 };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key === 'Enter' ? '\r' : undefined });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(400);
    await this.settle();
  }

  async box(target, scroll = false) {
    const b = await this.eval(findTarget, target, scroll);
    if (!b) throw new Error(`Target not found: ${JSON.stringify(target)}`);
    return b;
  }
}

// Runs in the page. Resolves a target to a CSS-pixel rect.
// target: { text, exact?, nth?, within?, tight? } | { selector, nth? } | { testid } | { placeholder } | { rect: [x,y,w,h] }
function findTarget(t, scroll) {
  const visible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  if (t.rect) return { x: t.rect[0], y: t.rect[1], width: t.rect[2], height: t.rect[3] };
  const root = t.within ? document.querySelector(t.within) : document;
  if (!root) return null;
  let els = [];
  if (t.selector) els = [...root.querySelectorAll(t.selector)];
  else if (t.testid) els = [...root.querySelectorAll(`[data-testid="${t.testid}"]`)];
  else if (t.placeholder) els = [...root.querySelectorAll(`[placeholder="${t.placeholder}"]`)];
  else if (t.text) {
    const want = t.text.trim().toLowerCase();
    const own = el => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const all = [...root.querySelectorAll('button,a,label,input,textarea,select,[role],h1,h2,h3,h4,h5,h6,p,span,div,td,th,li')];
    const hits = all.filter(el => (t.exact === false ? own(el).includes(want) : own(el) === want));
    els = hits.filter(el => !hits.some(o => o !== el && el.contains(o))); // innermost matches only
  }
  els = els.filter(visible);
  let el = els[t.nth || 0];
  if (!el) return null;
  if (t.text && !t.tight) el = el.closest('button,a,[role="button"],[role="tab"],[role="menuitem"],label') || el;
  const pre = el.getBoundingClientRect();
  const offscreen = pre.top < 0 || pre.left < 0 || pre.bottom > innerHeight || pre.right > innerWidth;
  if (scroll && offscreen) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

// Runs in the page. Draws annotation marks in a fixed overlay; returns the union rect of the marks.
function drawOverlay(items, style) {
  document.getElementById('__doc_overlay')?.remove();
  const layer = document.createElement('div');
  layer.id = '__doc_overlay';
  layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(layer);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', innerWidth);
  svg.setAttribute('height', innerHeight);
  svg.style.cssText = 'position:absolute;inset:0;overflow:visible;';
  layer.appendChild(svg);
  const marks = [];
  const pad = (r, p) => ({ x: r.x - p, y: r.y - p, width: r.width + 2 * p, height: r.height + 2 * p });
  const div = css => { const d = document.createElement('div'); d.style.cssText = `position:absolute;${css}`; return d; };
  const at = r => `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;`;

  for (const a of items) {
    const color = a.color || style.color;
    const r = pad(a.box, a.padding ?? style.padding);
    if (a.type === 'box') {
      layer.appendChild(div(`${at(r)}box-sizing:border-box;border-radius:${a.radius ?? style.radius}px;border:${a.stroke || style.stroke}px solid ${color};`));
      marks.push(r);
    } else if (a.type === 'highlight') {
      layer.appendChild(div(`${at(r)}border-radius:${a.radius ?? style.radius}px;background:${a.fill || 'rgba(255,214,10,0.35)'};`));
      marks.push(r);
    } else if (a.type === 'spotlight') {
      layer.insertBefore(div(`${at(r)}border-radius:${a.radius ?? style.radius}px;box-shadow:0 0 0 99999px rgba(15,23,42,${a.opacity ?? 0.45});`), svg);
    } else if (a.type === 'blur') {
      layer.insertBefore(div(`${at(r)}border-radius:4px;backdrop-filter:blur(${a.amount || 6}px);`), svg);
    } else if (a.type === 'svg') {
      // A supplied SVG (cursor, marker) placed relative to the target: anchor = center|top-left|..., dx/dy offsets, width in CSS px.
      const d = div('');
      d.innerHTML = a.markup;
      const w = a.width || 40;
      const anchor = { center: [r.x + r.width / 2, r.y + r.height / 2], 'bottom-right': [r.x + r.width, r.y + r.height], 'top-left': [r.x, r.y] }[a.anchor || 'center'];
      const x = anchor[0] + (a.dx || 0);
      const y = anchor[1] + (a.dy || 0);
      d.style.cssText += `left:${x}px;top:${y}px;width:${w}px;`;
      d.querySelector('svg')?.setAttribute('width', w);
      layer.appendChild(d);
      marks.push({ x, y, width: w, height: d.offsetHeight || w });
    } else if (a.type === 'arrow') {
      const from = a.from || 'left';
      const len = a.length || 90;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const tip = { left: [r.x - 4, cy], right: [r.x + r.width + 4, cy], top: [cx, r.y - 4], bottom: [cx, r.y + r.height + 4] }[from];
      const vec = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[from];
      const tail = [tip[0] + vec[0] * len, tip[1] + vec[1] * len];
      const sw = a.stroke || style.stroke;
      const hs = sw * 4;
      const line = document.createElementNS(svgNS, 'line');
      Object.entries({ x1: tail[0], y1: tail[1], x2: tip[0] + vec[0] * hs, y2: tip[1] + vec[1] * hs, stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' })
        .forEach(([k, v]) => line.setAttribute(k, v));
      const head = document.createElementNS(svgNS, 'polygon');
      const [px, py] = [-vec[1], vec[0]];
      const base = [tip[0] + vec[0] * hs, tip[1] + vec[1] * hs];
      head.setAttribute('points', `${tip[0]},${tip[1]} ${base[0] + px * hs * 0.6},${base[1] + py * hs * 0.6} ${base[0] - px * hs * 0.6},${base[1] - py * hs * 0.6}`);
      head.setAttribute('fill', color);
      svg.append(line, head);
      marks.push({ x: Math.min(tip[0], tail[0]) - hs, y: Math.min(tip[1], tail[1]) - hs, width: Math.abs(tip[0] - tail[0]) + 2 * hs, height: Math.abs(tip[1] - tail[1]) + 2 * hs });
    }
  }
  if (!marks.length) return null;
  const x1 = Math.min(...marks.map(m => m.x));
  const y1 = Math.min(...marks.map(m => m.y));
  return { x: x1, y: y1, width: Math.max(...marks.map(m => m.x + m.width)) - x1, height: Math.max(...marks.map(m => m.y + m.height)) - y1 };
}

// Runs in the compose page. Two house frames:
//   safari: full-window shots, drawn as a macOS Safari window with the page address in the address field.
//   plain:  cropped shots (dialogs, panels), the black rounded shell with no address bar.
function composeFrame(src, w, h, url, theme, mode) {
  const dark = theme !== 'light';
  document.body.style.cssText = 'margin:0;background:transparent;';
  if (mode === 'safari') {
    const c = dark
      ? { bar: '#2B2B2D', field: '#1E1E20', text: '#E4E4E7', icon: '#9A9AA0', edge: 'rgba(255,255,255,0.10)', line: '#1A1A1C' }
      : { bar: '#F4F4F5', field: '#E4E4E7', text: '#27272A', icon: '#71717A', edge: 'rgba(0,0,0,0.12)', line: '#D4D4D8' };
    const ico = (d, vb = 24) => `<svg width="17" height="17" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="${c.icon}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const dot = col => `<span style="width:12px;height:12px;border-radius:50%;background:${col};display:inline-block;"></span>`;
    const lock = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c.icon}" stroke-width="2.6" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
    document.body.innerHTML = `
      <div id="frame" style="display:inline-block;padding:36px 44px 56px;">
        <div style="border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px ${c.edge},0 22px 60px rgba(0,0,0,0.45),0 6px 18px rgba(0,0,0,0.25);">
          <div style="position:relative;display:flex;align-items:center;height:52px;padding:0 16px;background:${c.bar};border-bottom:1px solid ${c.line};
            font:400 13px/1 -apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,sans-serif;">
            <div style="display:flex;gap:8px;align-items:center;">${dot('#FF5F57')}${dot('#FEBC2E')}${dot('#28C840')}</div>
            <div style="display:flex;gap:18px;align-items:center;margin-left:26px;">
              ${ico('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>')}
              ${ico('<path d="M15 18l-6-6 6-6"/>')}${ico('<path d="M9 18l6-6-6-6"/>')}
            </div>
            <div style="position:absolute;left:50%;transform:translateX(-50%);width:${Math.min(Math.round(w * 0.5), 760)}px;height:30px;border-radius:8px;background:${c.field};
              display:flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;box-sizing:border-box;color:${c.text};white-space:nowrap;overflow:hidden;">
              ${url ? `${lock}<span style="overflow:hidden;text-overflow:ellipsis;">${url}</span>` : ''}
            </div>
            <div style="display:flex;gap:18px;align-items:center;margin-left:auto;">
              ${ico('<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>')}
              ${ico('<path d="M12 5v14"/><path d="M5 12h14"/>')}
              ${ico('<rect x="3" y="7" width="13" height="13" rx="2"/><path d="M8 4h11a2 2 0 0 1 2 2v11"/>')}
            </div>
          </div>
          <img src="${src}" style="display:block;width:${w}px;height:${h}px;">
        </div>
      </div>`;
  } else {
    document.body.innerHTML = `
      <div id="frame" style="display:inline-block;padding:16px;background:${dark ? '#000000' : '#E4E4E7'};border-radius:24px;">
        <img src="${src}" style="display:block;width:${w}px;height:${h}px;border-radius:12px;">
      </div>`;
  }
  return new Promise(ok => {
    const img = document.querySelector('img');
    const done = () => { const r = document.getElementById('frame').getBoundingClientRect(); ok({ x: r.x, y: r.y, width: r.width, height: r.height }); };
    img.complete ? done() : img.addEventListener('load', done);
  });
}

// ---------- Chrome lifecycle ----------
async function newPage(port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const page = new Page(target.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  return page;
}

async function launchChrome() {
  mkdirSync(cfg.profileDir, { recursive: true });
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(cfg.chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${cfg.profileDir}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-features=Translate',
    `--window-size=${cfg.viewport.width},${cfg.viewport.height}`, 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  return { proc, page: await newPage(port), composer: await newPage(port) };
}

async function prepareViewport(page, viewport = cfg.viewport, scale = cfg.scale) {
  await page.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: scale, mobile: false });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: cfg.theme }] });
}

async function ensureLogin(page) {
  await page.goto(`${cfg.baseUrl}/app/accounts/${cfg.accountId}/dashboard`);
  const onLogin = await page.eval(() => !!document.querySelector('[data-testid="email_input"]'));
  if (!onLogin) return;
  if (!cfg.password) throw new Error('Not logged in. Set CW_PASSWORD (and CW_EMAIL if not john@acme.inc) and rerun.');
  await page.type({ testid: 'email_input' }, cfg.email);
  await page.type({ testid: 'password_input' }, cfg.password);
  await page.click({ testid: 'submit_button' });
  await page.until(() => !document.querySelector('[data-testid="email_input"]'), [], 20000, 'login');
  await page.settle();
}

async function hideNoise(page, extra = []) {
  const css = `${[...HIDE_ALWAYS, ...cfg.hide, ...extra].join(',')}{display:none!important}*{caret-color:transparent!important}`;
  await page.eval(c => {
    let s = document.getElementById('__doc_hide');
    if (!s) { s = document.createElement('style'); s.id = '__doc_hide'; document.head.appendChild(s); }
    s.textContent = c;
  }, css);
}

// Runs Ruby in the local app (for staged backend events). CAPTURED holds request bodies caught by mocks.
function runRails(code, captured) {
  execFileSync('/bin/zsh', ['-lc', `eval "$(rbenv init -)"; bundle exec rails runner "$CODE"`], {
    cwd: REPO, env: { ...process.env, CODE: code, CAPTURED: JSON.stringify(captured) }, stdio: 'ignore',
  });
}

async function runStep(page, step) {
  const [kind, arg] = Object.entries(step)[0];
  const url = p => (p.startsWith('http') ? p : `${cfg.baseUrl}${p.replaceAll('{account}', cfg.accountId)}`);
  if (kind === 'goto') return page.goto(url(arg));
  if (kind === 'click') return page.click(arg);
  if (kind === 'hover') return page.hover(arg);
  if (kind === 'type') return page.type(arg.target, arg.text);
  if (kind === 'press') return page.press(arg);
  if (kind === 'wait') return sleep(arg);
  if (kind === 'waitFor') return page.until(findTarget, [arg, false], 20000, JSON.stringify(arg));
  if (kind === 'scrollTo') return page.eval(findTarget, arg, true);
  if (kind === 'eval') return page.eval(arg);
  if (kind === 'mock') return page.addMock(arg);
  if (kind === 'rails') return runRails(arg, page.captured);
  throw new Error(`Unknown step: ${kind}`);
}

function displayUrl(href, shot) {
  if (shot.url) return shot.url;
  const u = new URL(href);
  let path = `${u.pathname}${u.search}`.replace(`/accounts/${cfg.accountId}/`, `/accounts/${cfg.displayAccountId}/`);
  // A "re:" prefix makes the rewrite a pattern, e.g. ["re:/captain/\\d+/", "/captain/2918/"] for IDs created during the run.
  for (const [from, to] of [...(shot.urlRewrites || []), ...cfg.urlRewrites]) {
    path = from.startsWith('re:') ? path.replace(new RegExp(from.slice(3)), to) : path.replace(from, to);
  }
  return `${shot.displayHost || cfg.displayHost}${path}`;
}

async function captureShot(page, composer, shot) {
  // Background tabs pause CSS transitions (side panels never slide in); keep the capture tab in front.
  await page.send('Page.bringToFront');
  let href = null;
  if (shot.image) {
    // Frame an existing screenshot (Meta screens, your own captures): 1 CSS px = imageScale image px.
    const data = readFileSync(resolve(outDir, shot.image)).toString('base64');
    const s = shot.imageScale || 2;
    const dims = await page.eval(async src => { const i = new Image(); i.src = src; await i.decode(); return { w: i.naturalWidth, h: i.naturalHeight }; },
      `data:image/png;base64,${data}`);
    await prepareViewport(page, { width: Math.round(dims.w / s), height: Math.round(dims.h / s) }, s);
    await page.send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await page.eval((src, w, h) => { document.body.style.margin = '0'; document.body.innerHTML = `<img src="${src}" style="display:block;width:${w}px;height:${h}px">`; },
      `data:image/png;base64,${data}`, Math.round(dims.w / s), Math.round(dims.h / s));
    await sleep(300);
  } else {
    await prepareViewport(page, shot.viewport || cfg.viewport);
    if (shot.route) await runStep(page, { goto: shot.route });
    for (const step of shot.steps || []) await runStep(page, step);
    await hideNoise(page, shot.hide || []);
    await page.eval(() => { document.activeElement?.blur?.(); });
    if (shot.hoverAfter) await page.hover(shot.hoverAfter);
    href = await page.eval(() => location.href);
  }

  const resolved = [];
  for (const a of shot.annotations || []) resolved.push({ ...a, box: await page.box(a.target) });
  const marks = await page.eval(drawOverlay, resolved, style);

  const vp = await page.eval(() => ({ width: innerWidth, height: innerHeight }));
  const crop = shot.image ? shot.crop : (shot.crop === undefined ? cfg.crop : shot.crop);
  let clip = null;
  if (crop) {
    const cp = crop.padding ?? 24;
    let r = crop.target ? await page.box(crop.target) : { x: 0, y: 0, ...vp };
    if (marks && crop.includeMarks !== false) {
      const x1 = Math.min(r.x, marks.x);
      const y1 = Math.min(r.y, marks.y);
      r = { x: x1, y: y1, width: Math.max(r.x + r.width, marks.x + marks.width) - x1, height: Math.max(r.y + r.height, marks.y + marks.height) - y1 };
    }
    const x = Math.max(0, r.x - cp);
    const y = Math.max(0, r.y - cp);
    clip = { x, y, width: Math.min(vp.width, r.x + r.width + cp) - x, height: Math.min(vp.height, r.y + r.height + cp) - y, scale: 1 };
  }
  const raw = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...(clip ? { clip } : {}) });
  await page.eval(() => document.getElementById('__doc_overlay')?.remove());

  let png = raw.data;
  // Full-window shots get the Safari window with the address; cropped shots get the plain frame and no address.
  const mode = shot.frameStyle || (clip ? 'plain' : 'safari');
  const url = mode === 'safari' && shot.urlBar !== false ? (shot.url || (href && displayUrl(href, shot))) : null;
  if (shot.frame ?? cfg.frame) {
    const w = clip ? clip.width : vp.width;
    const h = clip ? clip.height : vp.height;
    await composer.send('Emulation.setDeviceMetricsOverride', { width: Math.ceil(w + 120), height: Math.ceil(h + 180), deviceScaleFactor: cfg.scale, mobile: false });
    await composer.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const box = await composer.eval(composeFrame, `data:image/png;base64,${raw.data}`, w, h, url, cfg.theme, mode);
    png = (await composer.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } })).data;
  }
  const file = join(outDir, `${shot.id}.png`);
  const buf = Buffer.from(png, 'base64');
  writeFileSync(file, buf);
  // Handbook minimum: landscape at least 1000 px wide, portrait at least 500 px on the wide edge.
  const [pw, ph] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  const tooSmall = pw >= ph ? pw < 1000 : ph < 500;
  return { file, url, size: `${pw}x${ph}`, ...(tooSmall ? { warning: 'below handbook minimum size' } : {}) };
}

// ---------- main ----------
const { proc, page, composer } = await launchChrome();
const results = [];
try {
  await prepareViewport(page);
  if ((spec.shots || []).some(s => !s.image)) await ensureLogin(page);
  for (const shot of spec.shots) {
    if (only && !only.includes(shot.id)) continue;
    try {
      const { file, url, size, warning } = await captureShot(page, composer, shot);
      results.push({ id: shot.id, ok: true, file, url, size, warning, notion: shot.notion || null });
      console.log(`ok    ${shot.id} -> ${file} (${size})${url ? `  [${url}]` : ''}${warning ? `  WARN ${warning}` : ''}`);
    } catch (e) {
      results.push({ id: shot.id, ok: false, error: e.message });
      console.log(`FAIL  ${shot.id}: ${e.message}`);
      const snap = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
      if (snap) writeFileSync(join(outDir, `${shot.id}.FAILED.png`), Buffer.from(snap.data, 'base64'));
    }
    page.mocks = [];
    await page.send('Fetch.disable').catch(() => {});
  }
} finally {
  page.ws.close();
  composer.ws.close();
  proc.kill();
}
const manifestPath = join(outDir, 'manifest.json');
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { shots: [] };
const merged = new Map(previous.shots.map(s => [s.id, s]));
results.forEach(r => merged.set(r.id, { ...merged.get(r.id), ...r, capturedAt: new Date().toISOString() }));
writeFileSync(manifestPath, JSON.stringify({ spec: specPath, shots: [...merged.values()] }, null, 2));
process.exit(results.some(r => !r.ok) ? 2 : 0);
