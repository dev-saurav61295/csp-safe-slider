import { FOCUSABLE_SELECTOR } from './dom.js';
import { contentSize, currentScrollPos, viewportSize } from './geometry.js';
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

  constructor(
    private track: HTMLElement,
    private realSlides: HTMLElement[],
    private axis: Axis,
  ) {}

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

  build(): void {
    this.teardown();
    if (this.realSlides.length < 2) return;

    const first = this.realSlides[0];
    if (!first?.parentElement) return;
    const parent = first.parentElement;

    this.tailClones = this.realSlides.map((slide) => this.cloneNeutralized(slide));
    this.headClones = this.realSlides.map((slide) => this.cloneNeutralized(slide));

    // Insert tail-derived clones *before* the first real slide (these
    // visually precede the loop start), and head-derived clones *after*
    // the last real slide.
    for (const clone of this.tailClones) {
      parent.insertBefore(clone, first);
    }
    const last = this.realSlides[this.realSlides.length - 1];
    for (const clone of this.headClones) {
      parent.insertBefore(clone, last?.nextSibling ?? null);
    }

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

    const viewport = viewportSize(this.track, this.axis);
    const max = Math.max(0, contentSize(this.track, this.axis) - viewport);
    let pos = currentScrollPos(this.track, this.axis);

    const realStart = this.axis === 'horizontal' ? first.offsetLeft : first.offsetTop;
    const realEnd = realStart + this.realBlockSize;

    // Normalize RTL horizontal negative scrollLeft into the same
    // coordinate space as offsetLeft before comparing.
    const rtl = this.axis === 'horizontal' && getComputedStyle(this.track).direction === 'rtl';
    const normalizedPos = rtl ? pos + max : pos;

    if (normalizedPos < realStart - 1) {
      pos += this.realBlockSize;
      this.jumpTo(pos);
    } else if (normalizedPos > realEnd + 1) {
      pos -= this.realBlockSize;
      this.jumpTo(pos);
    }
  }

  private jumpTo(pos: number): void {
    if (this.axis === 'horizontal') {
      this.track.scrollLeft = pos;
    } else {
      this.track.scrollTop = pos;
    }
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
