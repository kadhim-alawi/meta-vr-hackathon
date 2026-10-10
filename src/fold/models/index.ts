import { ModelDef } from '../model.js';
import { boat } from './boat.js';
import { cup } from './cup.js';
import { fan } from './fan.js';
import { heart } from './heart.js';
import { plane } from './plane.js';

export const MODELS: ModelDef[] = [plane, boat, cup, fan, heart];

export const MODEL_BY_ID: Record<string, ModelDef> = Object.fromEntries(MODELS.map((m) => [m.id, m]));
