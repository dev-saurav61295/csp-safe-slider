/**
 * DOM helpers. Nothing in this module writes `style`, `style.*`, or
 * `setAttribute('style', ...)`. Positioning is done exclusively through
 * native scroll properties (`scrollLeft`/`scrollTo`) and class/data-attribute
 * toggles whose visual effect is defined entirely in external CSS.
 */

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: { className?: string; text?: string },
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options?.className) el.className = options.className;
  if (options?.text !== undefined) el.textContent = options.text;
  return el;
}

export function setData(el: HTMLElement, key: string, value: string | boolean): void {
  if (value === false) {
    delete el.dataset[key];
  } else {
    el.dataset[key] = value === true ? '' : value;
  }
}

export function resolveDirection(root: HTMLElement): 'ltr' | 'rtl' {
  const resolved = getComputedStyle(root).direction;
  return resolved === 'rtl' ? 'rtl' : 'ltr';
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Subscribes to live `prefers-reduced-motion` changes and returns an
 * unsubscribe function. Falls back to the deprecated `addListener` API for
 * older engines that never shipped `MediaQueryList#addEventListener`.
 */
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const listener = (e: MediaQueryListEvent | MediaQueryList): void => onChange(e.matches);
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }
  // Legacy Safari/older engines.
  type LegacyMql = MediaQueryList & {
    addListener?: (l: (e: MediaQueryListEvent) => void) => void;
    removeListener?: (l: (e: MediaQueryListEvent) => void) => void;
  };
  const legacy = mql as LegacyMql;
  legacy.addListener?.(listener);
  return () => legacy.removeListener?.(listener);
}

export function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

interface PendingClassCleanup {
  raf1: number;
  raf2: number;
}

const pendingClassCleanup = new WeakMap<HTMLElement, Map<string, PendingClassCleanup>>();

/**
 * Applies `className` to `track`, then removes it after two animation
 * frames (long enough to survive a scroll-snap container's own async
 * re-snap attempt — see `LoopEngine.jumpTo()`). A second call for the same
 * (track, className) pair before cleanup runs cancels the first call's
 * pending frames outright, so a superseded or stale operation can never
 * remove a class a newer operation is still relying on.
 */
export function applyTrackClassTemporarily(track: HTMLElement, className: string): void {
  let perTrack = pendingClassCleanup.get(track);
  if (!perTrack) {
    perTrack = new Map();
    pendingClassCleanup.set(track, perTrack);
  }
  const existing = perTrack.get(className);
  if (existing) {
    cancelAnimationFrame(existing.raf1);
    cancelAnimationFrame(existing.raf2);
  }

  track.classList.add(className);
  const entry: PendingClassCleanup = { raf1: 0, raf2: 0 };
  entry.raf1 = requestAnimationFrame(() => {
    entry.raf2 = requestAnimationFrame(() => {
      if (perTrack!.get(className) !== entry) return;
      track.classList.remove(className);
      perTrack!.delete(className);
    });
  });
  perTrack.set(className, entry);
}

/**
 * Cancels any pending cleanup scheduled by `applyTrackClassTemporarily` for
 * (track, className) and removes the class immediately. Used by
 * `destroy()`/`teardown()` so a class this instance applied never survives
 * past its own lifetime, and so no stale animation-frame callback can fire
 * afterward.
 */
export function clearTrackTemporaryClass(track: HTMLElement, className: string): void {
  const entry = pendingClassCleanup.get(track)?.get(className);
  if (entry) {
    cancelAnimationFrame(entry.raf1);
    cancelAnimationFrame(entry.raf2);
    pendingClassCleanup.get(track)!.delete(className);
  }
  track.classList.remove(className);
}

/** Focusable-descendant selector used to neutralize clones for the loop engine. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'audio[controls]',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/**
 * Same set as `FOCUSABLE_SELECTOR` but without the `:not([tabindex="-1"])`
 * exclusion. Used where an element that was previously neutralized
 * (tabindex forced to -1) must still be found again to be restored — the
 * exclusion in `FOCUSABLE_SELECTOR` would otherwise hide it from itself
 * once neutralized, permanently losing track of custom-tabindex elements.
 */
export const FOCUSABLE_SELECTOR_ALL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'audio[controls]',
  'video[controls]',
  '[tabindex]',
  '[contenteditable="true"]',
].join(',');
