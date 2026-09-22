import type { Axis } from './types.js';

export interface DragControllerOptions {
  /** Read live so an `update()` that changes `axis` takes effect immediately. */
  getAxis: () => Axis;
  /** Read live so an `update()` that changes `dragThreshold` takes effect immediately. */
  getThreshold: () => number;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/**
 * Mouse/pen click-and-drag-to-scroll support. Touch input is intentionally
 * left to native browser scrolling (native `overflow`/scroll-snap plus a
 * `touch-action` that permits panning on *both* axes — see
 * `css/csp-safe-slider.css` — so the track's own scroll axis is actually
 * reachable by touch, not just the cross axis) since browsers already
 * provide swipe/momentum scrolling for free there — reimplementing it in
 * JS would only add risk without a CSP benefit. This controller only takes
 * over for `pointerType === 'mouse'`, where there is no native
 * drag-to-scroll.
 *
 * Positioning is done exclusively via the `scrollLeft`/`scrollTop`
 * *properties* (not `style`), so it stays within the CSP contract.
 */
export class DragController {
  private dragging = false;
  private moved = false;
  private startClient = 0;
  private startScroll = 0;
  private pointerId: number | null = null;
  private suppressNextClick = false;

  constructor(
    private track: HTMLElement,
    private opts: DragControllerOptions,
  ) {}

  attach(): void {
    this.track.addEventListener('pointerdown', this.onPointerDown);
    this.track.addEventListener('click', this.onClickCapture, true);
  }

  detach(): void {
    this.track.removeEventListener('pointerdown', this.onPointerDown);
    this.track.removeEventListener('click', this.onClickCapture, true);
    this.releasePointer();
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const axis = this.opts.getAxis();
    this.dragging = true;
    this.moved = false;
    this.pointerId = e.pointerId;
    this.startClient = axis === 'horizontal' ? e.clientX : e.clientY;
    this.startScroll = axis === 'horizontal' ? this.track.scrollLeft : this.track.scrollTop;

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const axis = this.opts.getAxis();
    const client = axis === 'horizontal' ? e.clientX : e.clientY;
    const delta = client - this.startClient;

    if (!this.moved && Math.abs(delta) >= this.opts.getThreshold()) {
      this.moved = true;
      this.track.classList.add('csp-slider__track--dragging');
      this.opts.onDragStart();
    }
    if (!this.moved) return;

    e.preventDefault();
    const next = this.startScroll - delta;
    if (axis === 'horizontal') this.track.scrollLeft = next;
    else this.track.scrollTop = next;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.releasePointer();
    this.track.classList.remove('csp-slider__track--dragging');
    this.dragging = false;
    if (this.moved) {
      this.suppressNextClick = true;
      this.opts.onDragEnd();
    }
    this.moved = false;
  };

  private releasePointer(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.pointerId = null;
  }

  private onClickCapture = (e: MouseEvent): void => {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };
}
