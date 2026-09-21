# Framework integration

These are **illustrative code snippets**, not tested/shipped adapters. The
core package has zero framework dependencies by design (Section 3 of the
implementation brief); a dedicated `@csp-safe-slider/react` etc. package is
future scope. The pattern below is the same in every framework: create the
instance after the DOM ref mounts, destroy it on unmount, and never let the
framework's own rendering touch the DOM nodes `createSlider` owns (its
track, its slides' `data-state`/`aria-*`, its generated controls).

## React

```tsx
import { useEffect, useRef } from 'react';
import { createSlider, type Slider } from 'csp-safe-slider';
import 'csp-safe-slider/styles.css';

export function Gallery({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<Slider | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    sliderRef.current = createSlider(rootRef.current, { mode: 'rewind' });
    return () => sliderRef.current?.destroy();
  }, []);

  return (
    <div ref={rootRef} className="csp-slider" aria-label="Gallery">
      <div className="csp-slider__track" data-slider-track>
        {children}
      </div>
    </div>
  );
}
```

React never re-renders inside `data-slider-track` after mount in this
pattern (children are set once via JSX, then `createSlider` owns DOM
mutations within it). If your slide _content_ changes, update the children
normally and call `sliderRef.current?.refresh()` in a follow-up effect —
don't let React reconcile the controls `createSlider` appended after the
track, since it doesn't know about them.

## Vue (Composition API)

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createSlider, type Slider } from 'csp-safe-slider';
import 'csp-safe-slider/styles.css';

const root = ref<HTMLElement | null>(null);
let slider: Slider | null = null;

onMounted(() => {
  if (root.value) slider = createSlider(root.value, { mode: 'loop' });
});
onBeforeUnmount(() => slider?.destroy());
</script>

<template>
  <div ref="root" class="csp-slider" aria-label="Gallery">
    <div class="csp-slider__track" data-slider-track>
      <slot />
    </div>
  </div>
</template>
```

## Angular

```ts
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { createSlider, Slider } from 'csp-safe-slider';

@Component({
  selector: 'app-gallery',
  template: `
    <div #root class="csp-slider" aria-label="Gallery">
      <div class="csp-slider__track" data-slider-track>
        <ng-content></ng-content>
      </div>
    </div>
  `,
})
export class GalleryComponent implements AfterViewInit, OnDestroy {
  @ViewChild('root') rootRef!: ElementRef<HTMLElement>;
  private slider?: Slider;

  ngAfterViewInit(): void {
    this.slider = createSlider(this.rootRef.nativeElement, { mode: 'finite' });
  }

  ngOnDestroy(): void {
    this.slider?.destroy();
  }
}
```

Import `csp-safe-slider/styles.css` globally (e.g. in `angular.json`'s
`styles` array) since Angular component `styleUrls` are view-encapsulated
and would otherwise scope the slider's structural CSS unpredictably.

## What's _not_ covered here

No React/Vue/Angular project in this repository actually builds or tests
these snippets against real framework tooling/versions — that's explicitly
deferred to a possible future `@csp-safe-slider/*` adapter package. Treat
them as a starting point, not a support commitment.
