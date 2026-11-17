/**
 * Records the game's own generative music (no assets, so no licence worries) to a file,
 * cycling its moods in real time. Used for the submission video's soundtrack.
 *   npm run build && node scripts/e2e/record-music.mjs [out.webm]
 */
import fs from 'node:fs';
import { launch, sleep } from './harness.mjs';

const out = process.argv[2] ?? 'test-results/music.webm';
// [mood, seconds]: calm intro, playful river and garden, night hill, finale letter, calm menu
const plan = [['calm', 35], ['playful', 50], ['night', 30], ['finale', 25], ['calm', 25]];
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=menu', { width: 320, height: 240 });
await sleep(1500);
await page.evaluate(() => {
  const a = window.__app.audio;
  a.unlock();
  a.music.stop();
  const dest = a.ctx.createMediaStreamDestination();
  a.master.connect(dest); // tee the final mix
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  window.__chunks = [];
  rec.ondataavailable = (e) => window.__chunks.push(e.data);
  rec.start(1000);
  window.__rec = rec;
});
for (const [mood, secs] of plan) {
  console.log(`${mood} ${secs}s`);
  await page.evaluate((m) => window.__app.audio.music.setMood(m), mood);
  await sleep(secs * 1000);
}
const b64 = await page.evaluate(async () => {
  const rec = window.__rec;
  const done = new Promise((r) => (rec.onstop = r));
  rec.stop();
  await done;
  const buf = await new Blob(window.__chunks).arrayBuffer();
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
});
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
await close();
