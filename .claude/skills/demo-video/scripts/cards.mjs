#!/usr/bin/env node
// Render a card template (templates/cards/<name>.html) to an MP4 clip or a still PNG.
// Usage: node cards.mjs <template> --params '<json>' --res 1080|2160 (--out clip.mp4 [--duration s] | --still out.png [--at s])
// The clip runs the template's own timeline; a longer --duration holds the last frame (for narration).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, newPage } from './lib/cdp.mjs';

export const FPS = 30;
const CARDS = resolve(dirname(fileURLToPath(import.meta.url)), '../templates/cards');

export async function renderCard(template, params, { res = 1080, out, still, at, duration } = {}) {
  const scale = res >= 2160 ? 2 : 1;
  // Templates load fonts and avatars from sibling files, which file:// pages may only do with this flag.
  const { proc, port } = await launchChrome({ width: 1920, height: 1080, profile: 'cw-video-cards', extraArgs: ['--allow-file-access-from-files'] });
  const page = await newPage(port);
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: scale, mobile: false });
    const url = `${pathToFileURL(resolve(CARDS, `${template}.html`)).href}#${encodeURIComponent(JSON.stringify(params))}`;
    await page.send('Page.navigate', { url });
    await page.until(() => document.readyState === 'complete' && typeof window.renderAt === 'function', [], 15000, 'card load');
    await page.eval(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
    const natural = await page.eval(() => window.DURATION);
    const shot = async t => {
      await page.eval(`window.renderAt(${t})`);
      return Buffer.from((await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64');
    };

    if (still) {
      writeFileSync(still, await shot(at ?? natural));
      return { natural };
    }
    const total = Math.max(duration || 0, natural);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-vf', `scale=${1920 * scale}:${1080 * scale}:flags=lanczos`, '-c:v', 'libx264', '-crf', res >= 2160 ? '14' : '17', '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, fail) => ff.on('close', code => (code ? fail(new Error(`ffmpeg exited ${code}`)) : ok())));
    const frames = Math.round(total * FPS);
    let last = null;
    for (let i = 0; i < frames; i += 1) {
      const t = i / FPS;
      // Past the template's own timeline the frame no longer changes: reuse it.
      const png = t <= natural + 1 / FPS || !last ? await shot(Math.min(t, natural)) : last;
      last = png;
      if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    return { natural, duration: total };
  } finally {
    page.ws.close();
    proc.kill();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  if (!args[0] || (!flag('--out') && !flag('--still'))) {
    console.error("usage: node cards.mjs <template> --params '<json>' --res 1080|2160 (--out clip.mp4 [--duration s] | --still out.png [--at s])");
    process.exit(1);
  }
  const r = await renderCard(args[0], JSON.parse(flag('--params') || '{}'), {
    res: Number(flag('--res') || 1080), out: flag('--out'), still: flag('--still'),
    at: flag('--at') && Number(flag('--at')), duration: flag('--duration') && Number(flag('--duration')),
  });
  console.log(JSON.stringify(r));
}
