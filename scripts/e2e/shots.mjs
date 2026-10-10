/** Screenshots of key moments: node scripts/e2e/shots.mjs <query> <name> <seconds...> */
import { launch, sleep, shot, frames } from './harness.mjs';
const [query, name, ...times] = process.argv.slice(2);
const { page, logs, close } = await launch(query);
let t0 = Date.now();
for (const t of times.map(Number)) {
  const wait = t * 1000 - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  await page.evaluate(() => {
    const d = window.__xrdevice;
    if (d) { const p = -0.62; d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2)); }
  });
  await frames(page, 2);
  await shot(page, `test-results/${name}-${t}.png`);
  console.log('shot', t);
}
const errors = logs.filter((l) => /\[(error|pageerror)\]/.test(l) && !l.includes('ERR_TUNNEL'));
console.log(errors.length ? errors.join('\n') : 'no errors');
await close();
