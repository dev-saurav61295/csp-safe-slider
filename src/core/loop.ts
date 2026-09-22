import { FOCUSABLE_SELECTOR } from './dom.js';
import { currentScrollPos } from './geometry.js';
import type { Axis } from './types.js';

/**
 * Seamless loop via DOM clones. Real slides keep their identity, ids, and
 * state; only the clone copies are ever removed. Clones are neutralized so
 * they cannot receive focus, get announced, or duplicate form submissions.
 *
 * The whole real-slide set is cloned once before and once after itself:
 *   [clones of all slides] [real slides] [clones of all slides]
 * This guarantees correct wrap-around for any viewport size relative to
 * content size, and works for variable-width slides because boundary
 * correction is computed from measured layout, not assumed slide width.
 */
export class LoopEngine {
  private headClones: HTMLElement[] = [];
  private tailClones: HTMLElement[] = [];
  private realBlockSize = 0;
  private realSlides: HTMLElement[] = [];
  private axis: Axis;

  constructor(
    private track: HTMLElement,
    axis: Axis,
  ) {
    this.axis = axis;
  }

  get isActive(): boolean {
    return this.headClones.length > 0 || this.tailClones.length > 0;
  }

  /** Clones appended after the real slides, 1:1 index-aligned with realSlides. */
  get headSlides(): readonly HTMLElement[] {
    return this.headClones;
  }

  /** Clones prepended before the real slides, 1:1 index-aligned with realSlides. */
  get tailSlides(): readonly HTMLElement[] {
    return this.tailClones;
  }

  /**
   * (Re)builds the clone set from the current real slides and axis. Must be
   * called with the live slide list every time it changes — the engine
   * never queries the DOM for slides itself, since the caller (slider.ts)
   * already owns slide discovery.
   */
  build(realSlides: HTMLElement[], axis: Axis): void {
    this.teardown();
    this.realSlides = realSlides;
    this.axis = axis;
    if (this.realSlides.length < 2) return;

    const first = this.realSlides[0];
    if (!first?.parentElement) return;
    const parent = first.parentElement;

    this.tailClones = this.realSlides.map((slide) => this.cloneNeutralized(slide));
    this.headClones = this.realSlides.map((slide) => this.cloneNeutralized(slide));

    // Insert tail-derived clones *before* the first real slide (these
    // visually precede the loop start), and head-derived clones *after*
    // the last real slide.
    //
    // Tail clones: each `insertBefore(clone, first)` inserts immediately
    // before the fixed, never-moving `first` anchor, so clones accumulate
    // in ascending order (tailClones[0..N-1], then the real block) — a
    // single stable anchor is enough here.
    for (const clone of this.tailClones) {
      parent.insertBefore(clone, first);
    }
    // Head clones: there is no fixed anchor *after* the real block the way
    // there is before it, so re-deriving `last.nextSibling` on every
    // iteration would target a position that shifts with each insert,
    // silently reversing the order. Insert the whole ascending-order block
    // in one call instead, at a position captured once, before any clone
    // exists to shift it.
    const last = this.realSlides[this.realSlides.length - 1];
    const headAnchor = last?.nextSibling ?? null;
    const headFragment = document.createDocumentFragment();
    for (const clone of this.headClones) {
      headFragment.append(clone);
    }
    parent.insertBefore(headFragment, headAnchor);

    this.realBlockSize = this.measureRealBlockSize();
  }

  private cloneNeutralized(slide: HTMLElement): HTMLElement {
    const clone = slide.cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-slider-clone', '');
    clone.removeAttribute('id');
    // `inert` is an IDL property, not a style write; it removes clones from
    // focus order, hit testing for a11y tree, and find-in-page.
    (clone as HTMLElement & { inert: boolean }).inert = true;
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.querySelectorAll(FOCUSABLE_SELECTOR).forEach((node) => {
      node.setAttribute('tabindex', '-1');
    });
    return clone;
  }

  private measureRealBlockSize(): number {
    const first = this.realSlides[0];
    const firstAfterClone = this.headClones[0];
    if (!first || !firstAfterClone) return 0;
    const a = this.axis === 'horizontal' ? first.offsetLeft : first.offsetTop;
    const b = this.axis === 'horizontal' ? firstAfterClone.offsetLeft : firstAfterClone.offsetTop;
    return b - a;
  }

  /**
   * Call after a scroll settles. If the viewport has drifted into a clone
   * region, jumps (instant, no animation) back to the equivalent position
   * in the real block — imperceptible because clones are visually
   * identical to what they stand in for.
   */
  correctBoundary(): void {
    if (!this.isActive || this.realBlockSize <= 0) return;
    const first = this.realSlides[0];
    const last = this.realSlides[this.realSlides.length - 1];
    if (!first || !last) return;

    let pos = currentScrollPos(this.track, this.axis);

    // No RTL-specific handling needed: `offsetLeft` (used for `realStart`)
    // and `scrollLeft`/`scrollTop` (used for `pos`) are already in the same
    // coordinate space regardless of direction — see the note on
    // `targetScrollFor()` in geometry.ts for why an earlier version's extra
    // RTL shift here was wrong.
    const realStart = this.axis === 'horizontal' ? first.offsetLeft : first.offsetTop;
    // By construction `realEnd` is exactly `headSlides[0]`'s start edge —
    // i.e. the position a seamless single-step forward wrap actually lands
    // on. The boundary check below must therefore treat `pos === realEnd`
    // as *already in clone territory* (an exclusive `>` here would only
    // catch overshoot past that exact pixel, which some browsers'
    // scroll-snap landed on by sub-pixel rounding and others — observed in
    // WebKit — do not, silently skipping correction and leaving the index
    // tracker to read the wrong nearest *real* slide instead).
    const realEnd = realStart + this.realBlockSize;

    if (pos <= realStart - 1) {
      pos += this.realBlockSize;
      this.jumpTo(pos);
    } else if (pos >= realEnd - 1) {
      pos -= this.realBlockSize;
      this.jumpTo(pos);
    }
  }

  private jumpTo(pos: number): void {
    // A mandatory `scroll-snap-type` container can, in some engines
    // (observed in WebKit), asynchronously re-assert its own idea of the
    // "current" snap target after a direct `scrollLeft`/`scrollTop`
    // write, overriding this correction back toward the clone position it
    // had just settled on — even though the corrected position is itself
    // a valid, equally snap-aligned real slide. Suspending snapping for
    // one paint around the write (same class the drag controller uses)
    // avoids that race without needing any inline style.
    this.track.classList.add('csp-slider__track--correcting');
    if (this.axis === 'horizontal') {
      this.track.scrollLeft = pos;
    } else {
      this.track.scrollTop = pos;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.track.classList.remove('csp-slider__track--correcting');
      });
    });
  }

  teardown(): void {
    for (const clone of [...this.headClones, ...this.tailClones]) {
      clone.remove();
    }
    this.headClones = [];
    this.tailClones = [];
    this.realBlockSize = 0;
  }
}
