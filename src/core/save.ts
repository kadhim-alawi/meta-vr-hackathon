/**
 * Local save data (progress, the Foldlings you've made, daily streak,
 * settings). Storage can be unavailable (private mode); everything degrades
 * to an in-memory save.
 */
import { dayNumber } from './util.js';

export interface SavedFoldling {
  id: string;
  model: string;
  /** front paper colour (players can choose colours in free fold) */
  color?: string;
  name: string;
  madeOn: number;
  crisp?: number;
}

export interface Settings {
  music: number;
  sfx: number;
  voice: number;
  captions: boolean;
  reducedMotion: boolean;
  /** larger text and handles */
  bigUI: boolean;
}

export interface SaveData {
  version: 1;
  /** highest story chapter completed (0 = none) */
  chapter: number;
  storyDone: boolean;
  foldlings: SavedFoldling[];
  daily: { lastDay: number; streak: number; best: number };
  settings: Settings;
  /** total folds made, for fun stats */
  folds: number;
  crisp: number;
}

const KEY = 'foldlings.save.v1';

export const defaultSettings: Settings = {
  music: 0.55,
  sfx: 1,
  voice: 0.9,
  captions: true,
  reducedMotion: false,
  bigUI: false,
};

function fresh(): SaveData {
  return {
    version: 1,
    chapter: 0,
    storyDone: false,
    foldlings: [],
    daily: { lastDay: -1, streak: 0, best: 0 },
    settings: { ...defaultSettings },
    folds: 0,
    crisp: 0,
  };
}

export class Save {
  data: SaveData;

  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        if (parsed && parsed.version === 1) {
          this.data = { ...fresh(), ...parsed, settings: { ...defaultSettings, ...parsed.settings } };
        }
      }
    } catch {
      /* corrupt or unavailable: start fresh */
    }
  }

  write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable */
    }
  }

  get hasProgress(): boolean {
    return this.data.chapter > 0 || this.data.foldlings.length > 0;
  }

  addFoldling(model: string, name: string, color?: string, crisp = 0): SavedFoldling {
    const f: SavedFoldling = {
      id: `${model}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      model,
      name,
      color,
      madeOn: dayNumber(),
      crisp,
    };
    this.data.foldlings.push(f);
    // keep the shelf manageable
    if (this.data.foldlings.length > 24) this.data.foldlings.shift();
    this.write();
    return f;
  }

  /** Record today's daily fold; returns the new streak. */
  completeDaily(): number {
    const today = dayNumber();
    const d = this.data.daily;
    if (d.lastDay === today) return d.streak;
    d.streak = d.lastDay === today - 1 ? d.streak + 1 : 1;
    d.best = Math.max(d.best, d.streak);
    d.lastDay = today;
    this.write();
    return d.streak;
  }

  get dailyDoneToday(): boolean {
    return this.data.daily.lastDay === dayNumber();
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    this.write();
  }
}
