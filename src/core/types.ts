export type Axis = 'horizontal' | 'vertical';
export type Direction = 'ltr' | 'rtl' | 'auto';
export type BoundaryMode = 'finite' | 'rewind' | 'loop';
export type TransitionEffect = 'slide' | 'fade';
export type Alignment = 'start' | 'center' | 'end';

export type ChangeSource =
  'init' | 'api' | 'drag' | 'keyboard' | 'autoplay' | 'control' | 'resize' | 'scroll';

export interface SliderOptions {
  /** Logical index the slider starts at. Default 0. */
  startIndex: number;
  /** Scroll axis. Default 'horizontal'. */
  axis: Axis;
  /**
   * Text direction. 'auto' reads the resolved `dir` from the root element
   * (falling back to the document). Default 'auto'.
   */
  direction: Direction;
  /** Boundary behavior at the first/last slide. Default 'finite'. */
  mode: BoundaryMode;
  /** How many logical slides one prev/next step advances. Default 1. */
  slidesToScroll: number;
  /** Alignment of the active slide within the viewport. Default 'start'. */
  align: Alignment;
  /** Enable pointer/touch dragging. Default true. */
  draggable: boolean;
  /** Enable arrow-key navigation while the slider has focus. Default true. */
  keyboard: boolean;
  /** Autoplay configuration; false disables it. Default false. */
  autoplay: false | AutoplayOptions;
  /** Transition effect. Default 'slide'. */
  effect: TransitionEffect;
  /**
   * @deprecated Validated for backward compatibility only — it has no
   * runtime effect. Neither `slide` nor `fade` timing is JS-configurable:
   * `effect: 'slide'` uses the browser's native `scrollTo({ behavior:
   * 'smooth' })`, whose duration/easing the CSSOM View spec doesn't expose
   * to script at all; `effect: 'fade'` timing is owned entirely by the
   * external CSS `--slider-duration` custom property, independent of this
   * option (setting this option does not update that property — doing so
   * would require a forbidden `element.style` write). Set
   * `--slider-duration` in your own stylesheet instead. Default 400
   * (kept only so existing `{ duration: 400 }` callers don't need to
   * change anything). See docs/API.md#css-custom-property-contract.
   */
  duration: number;
  /** Free-scroll (no snap-to-slide) mode. Default false. */
  freeScroll: boolean;
  /** Minimum pointer travel in px before a drag is registered. Default 6. */
  dragThreshold: number;
  /** Respect prefers-reduced-motion by disabling autoplay/animation. Default true. */
  reducedMotion: boolean;
}

export interface AutoplayOptions {
  /** Interval between advances, in ms. */
  interval: number;
  /** Pause while the pointer hovers the slider. Default true. */
  pauseOnHover: boolean;
  /** Pause when focus enters the slider and require explicit restart. Default true. */
  pauseOnFocus: boolean;
  /** Pause when the document is hidden. Default true. */
  pauseOnHiddenDocument: boolean;
  /** Pause when the slider scrolls out of the viewport. Default true. */
  pauseOnOffscreen: boolean;
}

export type SliderInit = Partial<Omit<SliderOptions, 'autoplay'>> & {
  autoplay?: boolean | Partial<AutoplayOptions>;
};

export interface SliderState {
  readonly index: number;
  readonly previousIndex: number;
  readonly slideCount: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly isDragging: boolean;
  readonly isAutoplaying: boolean;
  readonly isAnimating: boolean;
  readonly axis: Axis;
  readonly direction: 'ltr' | 'rtl';
  readonly mode: BoundaryMode;
  readonly destroyed: boolean;
}

export interface ChangeEvent {
  index: number;
  previousIndex: number;
  source: ChangeSource;
}

export interface SliderEventMap {
  change: ChangeEvent;
  settle: ChangeEvent;
  autoplayPlay: undefined;
  autoplayPause: undefined;
  autoplayStop: undefined;
  dragStart: undefined;
  dragEnd: undefined;
  refresh: undefined;
  destroy: undefined;
}

export type SliderEventName = keyof SliderEventMap;
export type SliderListener<K extends SliderEventName> = (event: SliderEventMap[K]) => void;

export interface GoToOptions {
  animate?: boolean;
  source?: ChangeSource;
}

export interface Slider {
  next(options?: GoToOptions): void;
  prev(options?: GoToOptions): void;
  goTo(index: number, options?: GoToOptions): void;
  refresh(): void;
  update(options: SliderInit): void;
  getState(): SliderState;
  play(): void;
  pause(): void;
  stop(): void;
  on<K extends SliderEventName>(event: K, listener: SliderListener<K>): () => void;
  off<K extends SliderEventName>(event: K, listener: SliderListener<K>): void;
  destroy(): void;
}
