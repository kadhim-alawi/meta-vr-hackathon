/** The software-rendered emulator is slow, so adaptive quality must step down (and nothing may break). */
import { launch, sleep } from './harness.mjs';
const { page, logs, close } = await launch('emulate=quest3&autostart=vr&scene=lab&model=cup', { width: 640, height: 480 });
await sleep(25000);
const steps = logs.filter((l) => l.includes('[quality]'));
const errors = logs.filter((l) => /pageerror|\[error\]/.test(l) && !/Failed to load|net::|TUNNEL/.test(l));
console.log(steps.join('\n') || 'no quality steps');
const ok = steps.length > 0 && errors.length === 0;
console.log(ok ? 'ok   quality stepped down, no errors' : `FAIL ${errors.slice(0, 3).join(' | ')}`);
await close();
process.exitCode = ok ? 0 : 1;
