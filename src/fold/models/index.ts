import { ModelDef } from '../model.js';
import { boat } from './boat.js';
import { cup } from './cup.js';
import { cat, dog, fox } from './faces.js';
import { fan } from './fan.js';
import { heart } from './heart.js';
import { plane } from './plane.js';
import { tulip, whale } from './sea-garden.js';

/** Story models first, then the extras for free fold and the daily fold. */
export const STORY_MODELS: ModelDef[] = [plane, boat, cup, fan, heart];
export const EXTRA_MODELS: ModelDef[] = [dog, cat, fox, whale, tulip];
export const MODELS: ModelDef[] = [...STORY_MODELS, ...EXTRA_MODELS];

export const MODEL_BY_ID: Record<string, ModelDef> = Object.fromEntries(MODELS.map((m) => [m.id, m]));
