// Shared helpers for card templates. Every template sets window.DURATION and window.renderAt(t);
// cards.mjs calls renderAt for each frame, so animation is deterministic (no CSS timers).
window.PARAMS = JSON.parse(decodeURIComponent(location.hash.slice(1) || '%7B%7D'));

const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
// Eased 0..1 progress of an animation that starts at `start` and lasts `dur` seconds.
window.k = (t, start, dur) => ease((t - start) / dur);
window.lerp = (a, b, p) => a + (b - a) * p;

// Pixel-mosaic edge field like chatwoot.com section frames: square cells, denser toward the edges,
// in the accent's tints. Seeded, so every frame and every render draws the same pattern.
window.drawMosaic = (canvas, { cell = 14, band = 0.09, density = 1, seed = 7 } = {}) => {
  const css = getComputedStyle(document.body);
  const colors = ['--soft', '--soft', '--mid', '--wash'].map(v => css.getPropertyValue(v).trim());
  const w = 1920; const h = 1080;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const gap = 3;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const d = Math.min(x / w, (w - x) / w, (y / h) * (h / w), ((h - y) / h) * (h / w)) / band;
      const p = Math.pow(Math.max(0, 1 - d), 1.6) * density;
      if (rand() > p) continue;
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
      ctx.globalAlpha = 0.55 + 0.45 * rand();
      ctx.fillRect(x + gap / 2, y + gap / 2, cell - gap, cell - gap);
    }
  }
  ctx.globalAlpha = 1;
};

// Small line icons (Lucide shapes) for section badges.
window.ICONS = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  sparkles: '<path d="M9.94 14.06 4 20M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  puzzle: '<path d="M19.44 7.85c-.49.49-.49 1.29 0 1.78l1.07 1.07a2 2 0 0 1 0 2.82l-1.57 1.57a1 1 0 0 1-1.7-.7v-.33a1.5 1.5 0 1 0-3 0v.33a1 1 0 0 1-1.7.7l-1.57-1.57a2 2 0 0 1 0-2.82l1.07-1.07c.49-.49.49-1.29 0-1.78L10.97 6.8a2 2 0 0 1 0-2.82l1.57-1.57a2 2 0 0 1 2.82 0l1.07 1.07c.49.49 1.29.49 1.78 0l1.07-1.07"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
};
window.icon = name => `<svg viewBox="0 0 24 24">${window.ICONS[name] || window.ICONS.message}</svg>`;
