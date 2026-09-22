import { applyTrackClassTemporarily, clearTrackTemporaryClass, FOCUSABLE_SELECTOR } from './dom.js';
import { currentScrollPos } from './geometry.js';
import type { Axis } from './types.js';

export const CORRECTING_CLASS = 'csp-slider__track--correcting';

/** Native form controls whose presence in a clone could duplicate a submission. */
const FORM_CONTROL_SELECTOR = 'input, select, textarea, button';

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
    // The slide root itself can be the focusable element (an `<a>` or
    // `<button>` used directly as `[data-slider-slide]`, or a root with an
    // author-set `tabindex`) — `querySelectorAll` above only ever finds
    // *descendants*, so it never neutralizes this case on its own.
    if (clone.matches(FOCUSABLE_SELECTOR)) {
      clone.setAttribute('tabindex', '-1');
    }

    this.neutralizeFormControls(clone);
    return clone;
  }

  /**
   * `inert` removes a clone from the accessibility tree and focus order,
   * but it has no effect on HTML form submission: an `inert` control with a
   * `name` is still a "successful control" per the forms spec, so an
   * uncorrected loop clone would submit duplicate values alongside the real
   * slide it was cloned from. Stripping `name` (so it isn't a successful
   * control at all) and disabling every native form control (belt-and-
   * braces, and it also drops the clone from the tab order without relying
   * solely on `inert`) closes that gap without ever touching `style` or
   * form-submission APIs directly.
   */
  private neutralizeFormControls(clone: HTMLElement): void {
    if (clone.hasAttribute('name')) clone.removeAttribute('name');
    clone.querySelectorAll('[name]').forEach((node) => node.removeAttribute('name'));

    const disable = (el: Element): void => {
      if ('disabled' in el) (el as HTMLInputElement).disabled = true;
    };
    if (clone.matches(FORM_CONTROL_SELECTOR)) disable(clone);
    clone.querySelectorAll(FORM_CONTROL_SELECTOR).forEach(disable);
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
    if (!this.isActive || this.realBlockSize === 0) return;
    const first = this.realSlides[0];
    const last = this.realSlides[this.realSlides.length - 1];
    if (!first || !last) return;

    const pos = currentScrollPos(this.track, this.axis);

    // `offsetLeft` (used for `realStart`) and `scrollLeft`/`scrollTop`
    // (used for `pos`) are in the same coordinate space regardless of
    // direction — see the note on `targetScrollFor()` in geometry.ts.
    // What *does* depend on direction is which way is "forward" through
    // that space: in a `direction: ltr` flex container, DOM order and
    // offset both increase together, so `headSlides[0]` (last in DOM) sits
    // at a *larger* offset than the real block and `realBlockSize` is
    // positive; in `rtl`, DOM order and offset move in *opposite*
    // directions (per the same geometry.ts note), so `headSlides[0]` sits
    // at a *smaller* (more negative) offset and `realBlockSize` is
    // negative. An earlier version of this method compared `pos` against
    // `realStart`/`realEnd` assuming `realEnd > realStart`, which only
    // holds for the positive (ltr) case — in rtl it silently never
    // corrected at all (`realBlockSize <= 0` even bailed out above before
    // reaching the comparison). Scaling every comparison by
    // `Math.sign(realBlockSize)` keeps both checks correct in either
    // direction instead of only ltr.
    const realStart = this.axis === 'horizontal' ? first.offsetLeft : first.offsetTop;
    const realEnd = realStart + this.realBlockSize;
    const forward = Math.sign(this.realBlockSize);

    // > 0 once `pos` has drifted forward-of-start into tail-clone
    // territory; by construction `pos === realStart` is still real
    // territory, so the threshold is exclusive there.
    const beforeStart = (realStart - pos) * forward;
    // By construction `realEnd` is exactly `headSlides[0]`'s start edge —
    // i.e. the position a seamless single-step forward wrap actually lands
    // on. `pos === realEnd` must therefore already count as clone
    // territory (an exclusive strict-inequality-only threshold here would
    // only catch overshoot past that exact pixel, which some browsers'
    // scroll-snap lands on by sub-pixel rounding and others — observed in
    // WebKit — do not, silently skipping correction and leaving the index
    // tracker to read the wrong nearest *real* slide instead).
    const pastEnd = (pos - realEnd) * forward;

    if (beforeStart >= 1) {
      this.jumpTo(pos + this.realBlockSize);
    } else if (pastEnd >= -1) {
      this.jumpTo(pos - this.realBlockSize);
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
    // avoids that race without needing any inline style. The class is
    // applied/cleaned up through a shared helper (also used for immediate
    // `goTo(..., { animate: false })` scrolls) that cancels any previous
    // pending cleanup on this track first, so a stale callback from an
    // earlier or destroyed correction can never remove a class a newer one
    // still depends on.
    applyTrackClassTemporarily(this.track, CORRECTING_CLASS);
    if (this.axis === 'horizontal') {
      this.track.scrollLeft = pos;
    } else {
      this.track.scrollTop = pos;
    }
  }

  teardown(): void {
    clearTrackTemporaryClass(this.track, CORRECTING_CLASS);
    for (const clone of [...this.headClones, ...this.tailClones]) {
      clone.remove();
    }
    this.headClones = [];
    this.tailClones = [];
    this.realBlockSize = 0;
  }
}
