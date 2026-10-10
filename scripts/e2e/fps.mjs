import { launch, sleep } from './harness.mjs';
const { page, close } = await launch('emulate=quest3&autostart=vr&scene=lab&model=cup', { width: 640, height: 480 });
await sleep(2000);
const f0 = await page.evaluate(() => window.__app.frames);
await sleep(3000);
const f1 = await page.evaluate(() => window.__app.frames);
console.log('fps', (f1 - f0) / 3);
await close();
