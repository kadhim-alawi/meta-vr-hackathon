import { SessionMode, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { App } from './app/app.js';
import { GameSystem } from './app/system.js';
import { FoldOneScene } from './scenes/daily.js';
import { FoldLabScene } from './scenes/fold-lab.js';
import { IdleScene } from './scenes/idle.js';
import { MenuScene } from './scenes/menu.js';
import { StoryScene } from './scenes/story.js';
import { ViewerScene } from './scenes/viewer.js';
import { loadFonts } from './ui/text.js';
import { maybeInstallEmulator } from './xr/emulate.js';
import { setupLanding } from './app/landing.js';

async function main(): Promise<void> {
  const emulated = await maybeInstallEmulator();
  await loadFonts();
  const container = document.getElementById('scene-container') as HTMLDivElement;
  const world = await World.create(container, projectOptions);
  const app = new App(world);
  const params = new URLSearchParams(location.search);

  app.sceneFactory = {
    idle: () => new IdleScene(app),
    story: (arg) => new StoryScene(app, arg ? Number(arg) : 0),
    menu: () => new MenuScene(app),
    free: (arg) => new FoldOneScene(app, 'free', arg),
    daily: () => new FoldOneScene(app, 'daily'),
    lab: (arg) => new FoldLabScene(app, arg ?? params.get('model') ?? 'cup'),
    viewer: (arg) => new ViewerScene(app, arg),
  };
  // first-timers go straight into the story; returning players get the hub
  app.firstScene = params.get('scene') ?? (app.save.hasProgress ? 'menu' : 'story');

  world.registerSystem(GameSystem, { priority: 20 });
  world.getSystem(GameSystem)!.app = app;
  (window as unknown as { __app: App }).__app = app;

  const start = (mode: 'ar' | 'vr') => {
    app.audio.unlock();
    world.launchXR({ sessionMode: mode === 'ar' ? SessionMode.ImmersiveAR : SessionMode.ImmersiveVR });
  };
  setupLanding(app, start);
  app.setScene('idle');
  const auto = params.get('autostart');
  if (emulated && (auto === 'ar' || auto === 'vr')) start(auto);
}

void main();
