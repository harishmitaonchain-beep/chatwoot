// Chrome DevTools Protocol plumbing shared by record.mjs and cards.mjs.
// Adapted from docs-screenshots/scripts/capture.mjs (targets, staging, settle) and
// Sojan's chatwoot-demo-video-creator cdp_capture.js (native-surface screenshots).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export class Page {
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
      m.error ? p.fail(new Error(`${p.method}: ${m.error.message}`)) : p.ok(m.result || {});
    });
    this.on('Fetch.requestPaused', p => this.onPaused(p));
  }

  on(method, fn) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), fn]);
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.id++;
    const promise = new Promise((ok, fail) => this.pending.set(id, { ok, fail, method }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  // Staged API responses: fulfil matching calls with demo data (screens that cannot run locally).
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
    // SPA: wait until the app has rendered (the first Vite compile can take a while)
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
  async settle(extraMs = 500) {
    let calm = 0;
    const start = Date.now();
    while (calm < 2 && Date.now() - start < 12000) {
      const busy = await this.eval(() => !!document.querySelector('.animate-spin, [class*="skeleton"], [class*="spinner"]'));
      calm = busy ? 0 : calm + 1;
      await sleep(250);
    }
    await sleep(extraMs);
  }

  async mouse(type, x, y) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
  }

  async key(key) {
    const codes = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, Backspace: 8 };
    const base = { key, code: key, windowsVirtualKeyCode: codes[key] || 0 };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key === 'Enter' ? '\r' : undefined });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async box(target, scroll = false) {
    const b = await this.eval(findTarget, target, scroll);
    if (!b) throw new Error(`Target not found: ${JSON.stringify(target)}`);
    return b;
  }

  // Compositor-surface PNG at the emulated device scale (crisp text for 4K output).
  async screenshot() {
    const r = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    return Buffer.from(r.data, 'base64');
  }
}

// Runs in the page. Resolves a target to a CSS-pixel rect.
// target: { text, exact?, nth?, within?, tight? } | { selector, nth? } | { testid } | { placeholder } | { rect: [x,y,w,h] }
export function findTarget(t, scroll) {
  const visible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  if (t.rect) return { x: t.rect[0], y: t.rect[1], width: t.rect[2], height: t.rect[3], cursor: 'default' };
  const root = t.within ? document.querySelector(t.within) : document;
  if (!root) return null;
  let els = [];
  if (t.selector) els = [...root.querySelectorAll(t.selector)];
  else if (t.testid) els = [...root.querySelectorAll(`[data-testid="${t.testid}"]`)];
  else if (t.placeholder) els = [...root.querySelectorAll(`[placeholder="${t.placeholder}"]`)];
  else if (t.text || t.regex) {
    const want = (t.text || '').trim().toLowerCase();
    const re = t.regex && new RegExp(t.regex, 'i'); // e.g. "^all \\d+$" for a tab that shows a count
    const own = el => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const all = [...root.querySelectorAll('button,a,label,input,textarea,select,[role],h1,h2,h3,h4,h5,h6,p,span,div,td,th,li')];
    const hits = all.filter(el => (re ? re.test(own(el)) : t.exact === false ? own(el).includes(want) : own(el) === want));
    els = hits.filter(el => !hits.some(o => o !== el && el.contains(o))); // innermost matches only
  }
  els = els.filter(visible);
  let el = els[t.nth || 0];
  if (!el) return null;
  if ((t.text || t.regex) && !t.tight) el = el.closest('button,a,[role="button"],[role="tab"],[role="menuitem"],label') || el;
  const pre = el.getBoundingClientRect();
  const offscreen = pre.top < 0 || pre.left < 0 || pre.bottom > innerHeight || pre.right > innerWidth;
  if (scroll && offscreen) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  // Editable fields report `auto`; the video cursor should show an I-beam there.
  const editable = el.matches('input,textarea,[contenteditable="true"],.ProseMirror') || el.closest('[contenteditable="true"],.ProseMirror');
  const css = getComputedStyle(el).cursor;
  return { x: r.x, y: r.y, width: r.width, height: r.height, cursor: editable && css === 'auto' ? 'text' : css };
}

export async function newPage(port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const page = new Page(target.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  return page;
}

// Profile lives in Library/Caches (small, and not on the exFAT drive, which Chrome's locks dislike).
export async function launchChrome({ width = 1440, height = 900, profile = 'cw-video-chrome', extraArgs = [] } = {}) {
  const profileDir = join(homedir(), 'Library/Caches', profile);
  mkdirSync(profileDir, { recursive: true });
  const port = 9600 + Math.floor(Math.random() * 300);
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-features=Translate',
    '--force-color-profile=srgb', `--window-size=${width},${height}`, ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  return { proc, port };
}

// Runs Ruby in the local app (staged backend events, resets). CAPTURED holds request bodies caught by mocks.
export function runRails(repo, code, captured = {}, env = {}) {
  execFileSync('/bin/zsh', ['-lc', 'eval "$(rbenv init -)"; bundle exec rails runner "$CODE"'], {
    cwd: repo, env: { ...process.env, ...env, CODE: code, CAPTURED: JSON.stringify(captured) }, stdio: 'inherit',
  });
}
