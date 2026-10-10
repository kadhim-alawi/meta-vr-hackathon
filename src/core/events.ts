/** Tiny typed event emitter. */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as (payload: never) => void);
    return () => set!.delete(fn as (payload: never) => void);
  }

  once<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as (p: Events[K]) => void)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
