import type { Axis } from './types.js';

export interface KeyboardCallbacks {
  prev: () => void;
  next: () => void;
  first: () => void;
  last: () => void;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  return target.isContentEditable;
}

/**
 * Arrow-key navigation scoped to the slider's own focusable surface (the
 * scroll track and its controls). Text editing and unrelated page shortcuts
 * are left untouched by bailing out on editable targets.
 */
export class KeyboardController {
  constructor(
    private root: HTMLElement,
    private axis: Axis,
    private getDirection: () => 'ltr' | 'rtl',
    private callbacks: KeyboardCallbacks,
  ) {}

  attach(): void {
    this.root.addEventListener('keydown', this.onKeyDown);
  }

  detach(): void {
    this.root.removeEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isEditableTarget(e.target)) return;

    const rtl = this.getDirection() === 'rtl';
    const prevKey = this.axis === 'horizontal' ? (rtl ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp';
    const nextKey = this.axis === 'horizontal' ? (rtl ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown';

    switch (e.key) {
      case prevKey:
        e.preventDefault();
        this.callbacks.prev();
        break;
      case nextKey:
        e.preventDefault();
        this.callbacks.next();
        break;
      case 'Home':
        e.preventDefault();
        this.callbacks.first();
        break;
      case 'End':
        e.preventDefault();
        this.callbacks.last();
        break;
    }
  };
}
