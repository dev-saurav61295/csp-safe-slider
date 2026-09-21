import type { SliderEventMap, SliderEventName, SliderListener } from './types.js';

/** Minimal typed pub/sub used internally; no DOM CustomEvent dependency required. */
export class Emitter {
  private listeners = new Map<SliderEventName, Set<(event: unknown) => void>>();

  on<K extends SliderEventName>(event: K, listener: SliderListener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (event: unknown) => void);
    return () => this.off(event, listener);
  }

  off<K extends SliderEventName>(event: K, listener: SliderListener<K>): void {
    this.listeners.get(event)?.delete(listener as (event: unknown) => void);
  }

  emit<K extends SliderEventName>(event: K, payload: SliderEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const listener of [...set]) {
      listener(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
