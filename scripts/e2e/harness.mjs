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

/** Serve the build; port 0 picks a free port so several runs can share the machine. */
export function serve(dir = 'dist', port = 0) {
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

export async function launch(query, { width = 720, height = 540 } = {}) {
  const server = await serve();
  // E2E_HW=1: real GPU in a visible window (about 60 fps), for recording footage. E2E_VIDEO=dir records it.
  const hw = process.env.E2E_HW === '1';
  const browser = await chromium.launch(
    hw
      ? { headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] }
      : { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
  );
  const video = process.env.E2E_VIDEO;
  const page = await browser.newPage({
    viewport: { width, height },
    ...(video ? { recordVideo: { dir: video, size: { width, height } } } : {}),
  });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  // each run gets its own port, so its own origin and fresh save data
  await page.goto(`http://localhost:${server.address().port}/?${query}`);
  try {
    await page.waitForFunction(() => window.__app && window.__app.scene, null, { timeout: 60000 });
  } catch (e) {
    console.log(logs.join('\n'));
    throw e;
  }
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

/**
 * Pinch so that the *closed* fingertips meet at a world position (the
 * emulated pinch pose moves the fingertip midpoint as the fingers close).
 */
const pinchOffsets = {};

/** Measure (once, away from everything) how far the fingertip midpoint moves when pinching. */
async function pinchOffset(page, side) {
  if (pinchOffsets[side]) return pinchOffsets[side];
  const safe = [side === 'right' ? 0.45 : -0.45, 1.45, 0.25];
  await movePinchTo(page, side, safe);
  const offset = await page.evaluate(async (side) => {
    const h = window.__app.hands[side];
    const dev = window.__xrdevice.hands[side];
    const p0 = h.pinchPoint.clone();
    dev.setPinchValueImmediate(1);
    await new Promise((r) => setTimeout(r, 300));
    const p1 = h.pinchPoint.clone();
    dev.setPinchValueImmediate(0);
    await new Promise((r) => setTimeout(r, 300));
    return [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
  }, side);
  pinchOffsets[side] = offset;
  return offset;
}

/**
 * Pinch so that the *closed* fingertips meet at a world position (the
 * emulated pinch pose moves the fingertip midpoint as the fingers close).
 */
export async function pinchAt(page, side, target) {
  const offset = await pinchOffset(page, side);
  await movePinchTo(page, side, [target[0] - offset[0], target[1] - offset[1] + 0.04, target[2] - offset[2]]);
  await movePinchTo(page, side, [target[0] - offset[0], target[1] - offset[1], target[2] - offset[2]]);
  for (const v of [0.3, 0.6, 1]) {
    await page.evaluate(({ side, v }) => window.__xrdevice.hands[side].updatePinchValue(v), { side, v });
    await frames(page, 2);
  }
  await frames(page, 3);
}

/**
 * A throw performed inside the page across consecutive frames (round-trips
 * from the test runner are too slow to produce a realistic hand velocity).
 */
export async function throwToward(page, side, dir, speed = 1.6, framesN = 5) {
  await page.evaluate(
    async ({ side, dir, speed, framesN }) => {
      const app = window.__app;
      const dev = window.__xrdevice.hands[side];
      const len = Math.hypot(...dir) || 1;
      const u = dir.map((v) => v / len);
      const nextFrame = (n) =>
        new Promise((res) => {
          const target = app.frames + n;
          const poll = () => (app.frames >= target ? res() : setTimeout(poll, 1));
          poll();
        });
      let last = performance.now();
      for (let i = 0; i < framesN; i++) {
        const now = performance.now();
        // real frame time, but never more than a 35 ms step (slow headless frames
        // would otherwise carry the hand past the target before release)
        const dt = Math.min(0.035, Math.max(0.011, (now - last) / 1000));
        last = now;
        dev.position.x += u[0] * speed * dt;
        dev.position.y += u[1] * speed * dt;
        dev.position.z += u[2] * speed * dt;
        await nextFrame(1);
      }
      dev.setPinchValueImmediate(0);
      await nextFrame(2);
    },
    { side, dir, speed, framesN },
  );
}

/**
 * Move the hand's pinch point from its current position to `target` at a
 * steady hand speed, one step per rendered frame (like a real wave, so the
 * velocity is seen along the whole path rather than as one jump).
 */
export async function sweepTo(page, side, target, speed = 0.7) {
  await page.evaluate(
    async ({ side, target, speed }) => {
      const app = window.__app;
      const h = app.hands[side];
      const dev = window.__xrdevice.hands[side];
      const nextFrame = () =>
        new Promise((res) => {
          const t = app.frames + 1;
          const poll = () => (app.frames >= t ? res() : setTimeout(poll, 1));
          poll();
        });
      let last = performance.now();
      for (let i = 0; i < 120; i++) {
        const d = [target[0] - h.pinchPoint.x, target[1] - h.pinchPoint.y, target[2] - h.pinchPoint.z];
        const len = Math.hypot(...d);
        if (len < 0.003) break;
        const now = performance.now();
        const dt = Math.min(0.1, Math.max(0.011, (now - last) / 1000));
        last = now;
        const k = Math.min(1, (speed * dt) / len);
        dev.position.x += d[0] * k;
        dev.position.y += d[1] * k;
        dev.position.z += d[2] * k;
        await nextFrame();
      }
    },
    { side, target, speed },
  );
}
