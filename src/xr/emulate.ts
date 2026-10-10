/**
 * Optional headset emulation (Meta's IWER) for development and automated
 * tests: open the page with `?emulate=quest3` or `?emulate=glasses`.
 * Loaded on demand, so it never ships to players who don't ask for it.
 */
export type EmulatedDevice = 'quest3' | 'glasses';

export async function maybeInstallEmulator(): Promise<EmulatedDevice | null> {
  const params = new URLSearchParams(location.search);
  const want = params.get('emulate') as EmulatedDevice | null;
  if (!want) return null;
  const iwer = await import('iwer');
  const config = want === 'glasses' ? iwer.metaVRGlasses : iwer.metaQuest3;
  const device = new iwer.XRDevice(config);
  device.installRuntime({ forceInstall: true });
  device.primaryInputMode = params.get('input') === 'controller' ? 'controller' : 'hand';
  device.stereoEnabled = params.get('stereo') === '1';
  // seated eye height
  device.position.set(0, 1.2, 0);
  (window as unknown as { __xrdevice: unknown }).__xrdevice = device;
  (window as unknown as { __iwer: unknown }).__iwer = iwer;
  return want;
}
