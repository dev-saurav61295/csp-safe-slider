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

export function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
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
