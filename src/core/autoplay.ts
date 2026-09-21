import type { AutoplayOptions } from './types.js';
import { isDocumentHidden } from './dom.js';

export interface AutoplayCallbacks {
  advance: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}

/**
 * Autoplay state machine.
 *
 * `running` is the *user's intent* (set by play()/pause()/stop()).
 * `suspended` tracks transient reasons the timer must not tick even though
 * intent is still "running" (hover, hidden document, offscreen). These
 * auto-clear and resume the timer. Focus is different: entering focus
 * stops rotation and clears `running` outright, per WAI carousel guidance,
 * so it requires an explicit play() call (e.g. via a visible control) to
 * resume — it does not resume merely on blur.
 */
export class AutoplayController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private suspendedByHover = false;
  private suspendedByHidden = false;
  private suspendedByOffscreen = false;
  private io: IntersectionObserver | null = null;
  private attached = false;

  constructor(
    private root: HTMLElement,
    private opts: AutoplayOptions,
    private callbacks: AutoplayCallbacks,
  ) {}

  attach(): void {
    this.attached = true;
    this.attachListeners();
  }

  detach(): void {
    this.clearTimer();
    this.detachListeners();
    this.attached = false;
  }

  private attachListeners(): void {
    if (this.opts.pauseOnHover) {
      this.root.addEventListener('mouseenter', this.onMouseEnter);
      this.root.addEventListener('mouseleave', this.onMouseLeave);
    }
    if (this.opts.pauseOnFocus) {
      this.root.addEventListener('focusin', this.onFocusIn);
    }
    if (this.opts.pauseOnHiddenDocument && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.suspendedByHidden = isDocumentHidden();
    }
    if (this.opts.pauseOnOffscreen && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        ([entry]) => {
          this.suspendedByOffscreen = !(entry?.isIntersecting ?? true);
          this.reconcile();
        },
        { threshold: 0.1 },
      );
      this.io.observe(this.root);
    }
  }

  private detachListeners(): void {
    this.root.removeEventListener('mouseenter', this.onMouseEnter);
    this.root.removeEventListener('mouseleave', this.onMouseLeave);
    this.root.removeEventListener('focusin', this.onFocusIn);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.io?.disconnect();
    this.io = null;
  }

  /**
   * Applies a new `AutoplayOptions` (e.g. from `slider.update()`) without
   * changing play/pause intent: interval/pause-rule changes take effect
   * immediately (by re-establishing listeners for the new rule set and
   * restarting the countdown if currently playing), but a prior explicit
   * `pause()` stays paused — only the caller decides whether *enabling*
   * autoplay from `false` should also start playing.
   */
  updateOptions(next: AutoplayOptions): void {
    if (this.attached) this.detachListeners();
    this.opts = next;
    if (!this.opts.pauseOnHover) this.suspendedByHover = false;
    if (!this.opts.pauseOnHiddenDocument) this.suspendedByHidden = false;
    if (!this.opts.pauseOnOffscreen) this.suspendedByOffscreen = false;
    if (this.attached) this.attachListeners();
    this.reconcile();
  }

  play(): void {
    this.running = true;
    this.callbacks.onPlay();
    this.reconcile();
  }

  pause(): void {
    this.running = false;
    this.clearTimer();
    this.callbacks.onPause();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    this.callbacks.onStop();
  }

  /** Restarts the countdown without changing play/pause intent — used on manual interaction. */
  notifyInteraction(): void {
    if (this.running && !this.isSuspended) this.startTimer();
  }

  get isPlaying(): boolean {
    return this.running && !this.isSuspended;
  }

  private get isSuspended(): boolean {
    return this.suspendedByHover || this.suspendedByHidden || this.suspendedByOffscreen;
  }

  private reconcile(): void {
    if (this.running && !this.isSuspended) this.startTimer();
    else this.clearTimer();
  }

  private startTimer(): void {
    this.clearTimer();
    this.timer = setInterval(() => this.callbacks.advance(), this.opts.interval);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private onMouseEnter = (): void => {
    this.suspendedByHover = true;
    this.reconcile();
  };

  private onMouseLeave = (): void => {
    this.suspendedByHover = false;
    this.reconcile();
  };

  private onFocusIn = (): void => {
    if (this.running) this.pause();
  };

  private onVisibilityChange = (): void => {
    this.suspendedByHidden = isDocumentHidden();
    this.reconcile();
  };
}
