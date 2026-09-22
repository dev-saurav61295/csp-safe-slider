import { createEl } from './dom.js';

export interface ControlsLabels {
  prev: string;
  next: string;
  goTo: (page: number) => string;
  rotation: { play: string; pause: string };
}

export const DEFAULT_LABELS: ControlsLabels = {
  prev: 'Previous slide',
  next: 'Next slide',
  goTo: (page) => `Go to slide ${page + 1}`,
  rotation: { play: 'Start automatic slide rotation', pause: 'Pause automatic slide rotation' },
};

export interface ControlsCallbacks {
  onPrev: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
  onToggleAutoplay: () => void;
}

/**
 * Builds prev/next buttons, page dots, a fraction readout, and a progress
 * element as real, focusable DOM nodes with `textContent`/attributes only.
 * Nothing here writes `style`.
 */
export class Controls {
  readonly root: HTMLElement;
  readonly prevButton: HTMLButtonElement;
  readonly nextButton: HTMLButtonElement;
  readonly rotationButton: HTMLButtonElement;
  readonly dotsContainer: HTMLElement;
  readonly fraction: HTMLElement;
  readonly progress: HTMLProgressElement;

  private dots: HTMLButtonElement[] = [];
  private labels: ControlsLabels;

  constructor(
    private callbacks: ControlsCallbacks,
    labels: Partial<ControlsLabels> = {},
    private hasAutoplay: boolean,
  ) {
    this.labels = { ...DEFAULT_LABELS, ...labels };

    this.root = createEl('div', { className: 'csp-slider__controls' });

    this.prevButton = createEl('button', {
      className: 'csp-slider__arrow csp-slider__arrow--prev',
    });
    this.prevButton.type = 'button';
    this.prevButton.setAttribute('aria-label', this.labels.prev);
    this.prevButton.addEventListener('click', () => this.callbacks.onPrev());

    this.nextButton = createEl('button', {
      className: 'csp-slider__arrow csp-slider__arrow--next',
    });
    this.nextButton.type = 'button';
    this.nextButton.setAttribute('aria-label', this.labels.next);
    this.nextButton.addEventListener('click', () => this.callbacks.onNext());

    this.rotationButton = createEl('button', { className: 'csp-slider__rotation' });
    this.rotationButton.type = 'button';
    this.rotationButton.hidden = !hasAutoplay;
    this.rotationButton.addEventListener('click', () => this.callbacks.onToggleAutoplay());

    // Plain button-group semantics (each dot is a labeled `<button>` with
    // `aria-current` on the active one) rather than a `tablist`/`tab`
    // pattern — a `tablist` requires roving tabindex plus moving DOM focus
    // to the newly active tab on every arrow-key-driven change, which
    // this carousel's global (not per-control) arrow-key handling doesn't
    // do; a simple button group needs none of that. See docs/ACCESSIBILITY.md.
    this.dotsContainer = createEl('div', { className: 'csp-slider__dots' });

    this.fraction = createEl('div', { className: 'csp-slider__fraction' });
    this.fraction.setAttribute('aria-hidden', 'true');

    this.progress = document.createElement('progress');
    this.progress.className = 'csp-slider__progress';
    this.progress.setAttribute('aria-hidden', 'true');

    this.root.append(
      this.prevButton,
      this.dotsContainer,
      this.nextButton,
      this.rotationButton,
      this.fraction,
      this.progress,
    );
  }

  buildDots(pageCount: number): void {
    this.dotsContainer.replaceChildren();
    this.dots = [];
    for (let i = 0; i < pageCount; i++) {
      const dot = createEl('button', { className: 'csp-slider__dot' });
      dot.type = 'button';
      dot.setAttribute('aria-label', this.labels.goTo(i));
      dot.addEventListener('click', () => this.callbacks.onGoToPage(i));
      this.dots.push(dot);
      this.dotsContainer.append(dot);
    }
  }

  update(activePage: number, pageCount: number, canPrev: boolean, canNext: boolean): void {
    this.prevButton.disabled = !canPrev;
    this.nextButton.disabled = !canNext;

    this.dots.forEach((dot, i) => {
      const active = i === activePage;
      dot.classList.toggle('csp-slider__dot--active', active);
      if (active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });

    this.fraction.textContent = `${activePage + 1} / ${pageCount}`;
    this.progress.max = pageCount;
    this.progress.value = activePage + 1;
  }

  setAutoplayState(playing: boolean): void {
    if (!this.hasAutoplay) return;
    this.rotationButton.textContent = playing ? '❚❚' : '►';
    this.rotationButton.setAttribute(
      'aria-label',
      playing ? this.labels.rotation.pause : this.labels.rotation.play,
    );
    this.rotationButton.setAttribute('aria-pressed', String(playing));
  }

  /** Reflects whether autoplay is currently configured — used by `slider.update()`
   *  when autoplay is enabled/disabled after creation. */
  setAutoplayAvailable(has: boolean): void {
    this.hasAutoplay = has;
    this.rotationButton.hidden = !has;
    if (!has) {
      this.rotationButton.removeAttribute('aria-pressed');
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
