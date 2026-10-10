/**
 * The 2D landing page shown in the browser before entering the headset
 * experience. Detects what the device supports and explains what to do on
 * desktop.
 */
import type { App } from './app.js';

export function setupLanding(app: App, start: (mode: 'ar' | 'vr') => void): void {
  const ar = document.getElementById('start-ar') as HTMLButtonElement | null;
  const vr = document.getElementById('start-vr') as HTMLButtonElement | null;
  const note = document.getElementById('xr-note');
  const cont = document.getElementById('continue-note');
  ar?.addEventListener('click', () => start('ar'));
  vr?.addEventListener('click', () => start('vr'));

  if (cont && app.save.hasProgress) {
    const n = app.save.data.foldlings.length;
    cont.textContent = app.save.data.storyDone
      ? `Welcome back! ${n} Foldling${n === 1 ? ' is' : 's are'} waiting on your desk.`
      : `Welcome back! Your story continues at chapter ${Math.min(4, app.save.data.chapter + 1)}.`;
    cont.hidden = false;
  }

  const xr = navigator.xr;
  if (!xr) {
    ar && (ar.disabled = true);
    vr && (vr.disabled = true);
    if (note) {
      note.innerHTML =
        'This is a headset experience. Open this page in the <b>Meta Quest Browser</b> on Quest 3, Quest 3S or Meta VR Glasses.';
    }
    document.body.classList.add('ready');
    return;
  }
  void Promise.all([
    xr.isSessionSupported('immersive-ar').catch(() => false),
    xr.isSessionSupported('immersive-vr').catch(() => false),
  ]).then(([hasAr, hasVr]) => {
    if (ar) ar.disabled = !hasAr;
    if (vr) vr.disabled = !hasVr;
    if (!hasAr && ar) ar.title = 'Mixed reality is not available on this device';
    if (note) {
      note.textContent = hasAr
        ? 'Sit at a table if you can. No controllers needed — just your hands.'
        : hasVr
          ? 'Mixed reality isn’t available here, so you’ll fold in a cozy virtual study.'
          : 'Open this page in the Meta Quest Browser to play.';
    }
    document.body.classList.add('ready');
  });
}
