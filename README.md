# csp-safe-slider

A content slider/carousel for images, cards, testimonials, and mixed HTML
content that works under a **strict Content Security Policy** — it never
writes a `style` attribute, never assigns `element.style`, never injects a
`<style>` or inline `<script>`, and never uses an inline event handler.
Positioning is done with native scroll (`scrollLeft`/`scrollTo`) and
CSS class/data-attribute toggles whose visual effect lives entirely in an
external stylesheet you control.

- No runtime dependencies, framework-independent core
- TypeScript, strict mode, ships `.d.ts`
- ESM + CJS, tree-shakeable, ~5.7 KB gzipped core JS
- Verified against a real enforcing CSP header in Chromium, Firefox, and
  WebKit (see [docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md))

## Why this exists

`style-src-attr 'none'` blocks the `style` HTML attribute, but it does
**not** block a script from writing `element.style.left = ...` at runtime —
that's a different, subtler CSP hole most "CSP-friendly" carousels fall
into because they position slides with JS-computed inline styles. This
package's core contract is stricter than CSP requires: it avoids *any*
generated inline styling, not just the specific attribute CSP's `style-src`
directives police. See [docs/CSP.md](docs/CSP.md) for the full contract and
why passing CSP alone isn't sufficient proof.

## Install

```sh
npm install csp-safe-slider
```

## Quick start

```html
<link rel="stylesheet" href="node_modules/csp-safe-slider/dist/csp-safe-slider.css" />

<div id="gallery" class="csp-slider" aria-label="Featured products">
  <div class="csp-slider__track" data-slider-track>
    <div class="csp-slider__slide" data-slider-slide>Slide 1</div>
    <div class="csp-slider__slide" data-slider-slide>Slide 2</div>
    <div class="csp-slider__slide" data-slider-slide>Slide 3</div>
  </div>
</div>

<script type="module">
  import { createSlider } from 'csp-safe-slider';
  createSlider(document.getElementById('gallery'), { mode: 'rewind' });
</script>
```

The `[data-slider-track]` wrapper and `[data-slider-slide]` children are a
required markup contract — see [docs/API.md](docs/API.md#markup-contract).

## Documentation

- [docs/API.md](docs/API.md) — full JS API, options, events, markup contract
- [docs/CSP.md](docs/CSP.md) — the CSP contract, why it's stricter than the spec, how it's tested
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — WAI carousel pattern conformance, manual test checklist
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — feature combination matrix, known limitations
- [docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md) — what was actually run, on what versions, with what results
- [docs/RELEASE.md](docs/RELEASE.md) — maintainer publish checklist
- [examples/](examples/) — runnable strict-CSP example pages

## Examples

| Example | Demonstrates |
| --- | --- |
| [examples/basic-gallery](examples/basic-gallery) | External `<link>` CSS, default theme, `rewind` mode, `change` event |
| [examples/custom-controls-theme](examples/custom-controls-theme) | Autoplay, accessible rotation control, custom labels, custom theme CSS |
| [examples/rtl-vertical-loop](examples/rtl-vertical-loop) | RTL, vertical axis, seamless loop, three independent instances on one page |
| [examples/framework-integration](examples/framework-integration) | React/Vue/Angular lifecycle-managed integration snippets (illustrative, not tested adapters) |
| [tests/e2e/fixtures/strict.html](tests/e2e/fixtures/strict.html) | The actual fixture served under the enforcing CSP header used by the automated test suite |

Open any example after building (`npm run build`) with any static file
server from the repo root, e.g. `npx http-server .`, then visit
`/examples/basic-gallery/index.html`.

## Development

```sh
npm install
npm run build       # tsup -> dist/, plus CSS copy
npm run typecheck
npm run lint
npm test            # vitest unit tests (pure state/option logic)
npm run test:e2e     # Playwright: CSP compliance, navigation, a11y, features
npm run test:ssr     # verifies the dist entry imports with no window/document
npm run test:pack    # packs the real npm tarball and installs it into a clean fixture
```

## What's implemented vs. deferred

This is a from-scratch implementation built in one working session against
an extensive spec. The CSP contract, core navigation/lifecycle engine,
finite/rewind/loop boundary modes, slide/fade transitions, autoplay,
drag/keyboard/touch input, RTL/vertical/multi-slide/variable-width layout,
accessibility fundamentals, and packaging are implemented and covered by
115 automated tests across three real browsers plus Node. Virtualization,
grid/multi-row layouts, parallax/zoom, deep-linking, and tested framework
adapter packages are explicitly out of scope for this release — see
[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the full reconciliation
of what's implemented, tested, constrained, or deferred, and why.

## License

MIT — see [LICENSE](LICENSE). See [docs/RELEASE.md](docs/RELEASE.md) for
package-name and ownership confirmation still needed before publishing.
