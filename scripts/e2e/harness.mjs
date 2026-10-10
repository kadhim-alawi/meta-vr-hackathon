/**
 * Headless end-to-end harness: serves dist/, opens it in Chromium with the
 * IWER-emulated headset (?emulate=quest3) and exposes helpers to drive hands.
 *
 *   npm run build && node scripts/e2e/<test>.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

export function serve(dir = 'dist', port = 4173) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(root, url === '/' ? 'index.html' : url);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

export async function launch(query, { width = 1280, height = 900 } = {}) {
  const server = await serve();
  const browser = await chromium.launch({
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(`http://localhost:4173/?${query}`);
  await page.waitForFunction(() => window.__app && window.__app.scene, null, { timeout: 60000 });
  const close = async () => {
    await browser.close();
    server.close();
  };
  return { page, browser, logs, close };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until the app has rendered n more frames. */
export async function frames(page, n = 2) {
  const start = await page.evaluate(() => window.__app.frames);
  await page.waitForFunction((s) => window.__app.frames >= s, start + n, { timeout: 30000 });
}

/** Move an emulated hand so that its pinch point lands on a world position. */
export async function movePinchTo(page, side, target) {
  for (let i = 0; i < 3; i++) {
    const delta = await page.evaluate(
      ({ side, target }) => {
        const h = window.__app.hands[side];
        const dev = window.__xrdevice.hands[side];
        if (!h.tracked) return null;
        const d = [target[0] - h.pinchPoint.x, target[1] - h.pinchPoint.y, target[2] - h.pinchPoint.z];
        dev.position.x += d[0];
        dev.position.y += d[1];
        dev.position.z += d[2];
        return Math.hypot(...d);
      },
      { side, target },
    );
    await frames(page, 2);
    if (delta !== null && delta < 0.002) break;
  }
}

export async function setPinch(page, side, value) {
  await page.evaluate(({ side, value }) => window.__xrdevice.hands[side].updatePinchValue(value), { side, value });
  await frames(page, 3);
}

export async function shot(page, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
}
