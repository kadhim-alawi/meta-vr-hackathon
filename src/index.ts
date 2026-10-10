import { SessionMode, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { App } from './app/app.js';
import { GameSystem } from './app/system.js';
import { FoldLabScene } from './scenes/fold-lab.js';
import { loadFonts } from './ui/text.js';
import { maybeInstallEmulator } from './xr/emulate.js';

async function main(): Promise<void> {
  const emulated = await maybeInstallEmulator();
  await loadFonts();
  const container = document.getElementById('scene-container') as HTMLDivElement;
  const world = await World.create(container, projectOptions);
  const app = new App(world);
  const params = new URLSearchParams(location.search);
  app.sceneFactory.lab = () => new FoldLabScene(app, params.get('model') ?? 'cup');

  world.registerSystem(GameSystem, { priority: 20 });
  world.getSystem(GameSystem)!.app = app;
  (window as unknown as { __app: App }).__app = app;

  const start = (mode: 'ar' | 'vr') => {
    app.audio.unlock();
    world.launchXR({ sessionMode: mode === 'ar' ? SessionMode.ImmersiveAR : SessionMode.ImmersiveVR });
  };
  document.getElementById('start-ar')?.addEventListener('click', () => start('ar'));
  document.getElementById('start-vr')?.addEventListener('click', () => start('vr'));

  app.setScene(params.get('scene') ?? 'lab');
  const auto = params.get('autostart');
  if (emulated && (auto === 'ar' || auto === 'vr')) start(auto);
  document.body.classList.add('ready');
}

void main();
