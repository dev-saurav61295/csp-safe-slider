# csp-safe-slider

A customizable, accessible content slider/carousel for images, cards,
testimonials, and mixed HTML content, built for **strict Content Security
Policy** environments — it never writes a `style` attribute, never assigns
`element.style`, never injects a `<style>` or inline `<script>`, and never
uses an inline event handler. Positioning is done with native scroll
(`scrollLeft`/`scrollTo`) and CSS class/data-attribute toggles whose visual
effect lives entirely in an external stylesheet you control.

- No runtime dependencies, framework-independent core
- TypeScript, strict mode, ships `.d.ts`
- ESM + CJS, tree-shakeable, ~5.7 KB gzipped core JS
- Verified against a real enforcing CSP header in Chromium, Firefox, and
  WebKit — see [docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md)

## What "CSP-safe" guarantees here

`style-src-attr 'none'` blocks the `style` HTML attribute, but it does
**not** block a script from writing `element.style.left = ...` at runtime —
that's a different, subtler CSP hole most "CSP-friendly" carousels fall
into because they position slides with JS-computed inline styles. This
package's core contract is stricter than CSP requires: it avoids _any_
generated inline styling, not just the specific attribute CSP's `style-src`
directives police. The contract covers this package's own generated
markup only — your host page, custom render callbacks, and any embedded
third-party content have their own CSP obligations. See
[docs/CSP.md](docs/CSP.md) for the full contract, what it does and doesn't
cover, and how it's tested against a real enforcing header (not
report-only).

## Install

```sh
npm install csp-safe-slider
```

## Quick start (external `<link>` + ESM)

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

## Bundler / TypeScript usage

```ts
import { createSlider, type Slider, type SliderOptions } from 'csp-safe-slider';
import 'csp-safe-slider/styles.css';
// Optional default theme:
import 'csp-safe-slider/theme.css';

const options: Partial<SliderOptions> = { mode: 'loop', axis: 'horizontal' };
const slider: Slider = createSlider(document.querySelector('#gallery')!, options);
```

`csp-safe-slider/styles.css` and `csp-safe-slider/theme.css` are the exact
subpaths declared in `package.json`'s `exports`. Make sure your bundler
_extracts_ imported CSS to a real file for production — dev-mode style
injection (common in Vite/webpack dev servers) is itself non-compliant
with a strict `style-src-elem` policy, so audit your production build
output, not your dev server.

## Restrictive CSP example

Serve your page with a real enforcing header like this (adjust `self` to
wherever you actually host the package's JS/CSS — your host page must
permit the external JS, CSS, images, fonts, or media it actually uses;
this package doesn't police that for you):

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self'; media-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
```

This disallows inline `style` attributes and inline `on*` handlers
entirely — this package never needs either. The actual fixture this policy
is tested against is [tests/e2e/fixtures/strict.html](tests/e2e/fixtures/strict.html)
plus its external init script, served with this exact header by
[tests/e2e/fixtures/server.mjs](tests/e2e/fixtures/server.mjs). See
[docs/CSP.md](docs/CSP.md) for the fallback policy it's also tested
against and the negative-control fixture that proves enforcement is real.

## Documentation

- [docs/API.md](docs/API.md) — full JS API, options, events, markup contract, CSS custom-property contract
- [docs/CSP.md](docs/CSP.md) — the CSP contract, why it's stricter than the spec, how it's tested
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — WAI carousel pattern conformance, manual test checklist
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — key design decisions and why
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — feature combination matrix, known limitations
- [docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md) — what was actually run, on what versions, with what results
- [docs/RELEASE.md](docs/RELEASE.md) — maintainer publish checklist
- [examples/](examples/) — runnable strict-CSP example pages

## Examples

| Example                                                          | Demonstrates                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [examples/basic-gallery](examples/basic-gallery)                 | External `<link>` CSS, default theme, `rewind` mode, `change` event                          |
| [examples/custom-controls-theme](examples/custom-controls-theme) | Autoplay, accessible rotation control, custom labels, custom theme CSS                       |
| [examples/rtl-vertical-loop](examples/rtl-vertical-loop)         | RTL, vertical axis, seamless loop, three independent instances on one page                   |
| [examples/framework-integration](examples/framework-integration) | React/Vue/Angular lifecycle-managed integration snippets (illustrative, not tested adapters) |
| [tests/e2e/fixtures/strict.html](tests/e2e/fixtures/strict.html) | The actual fixture served under the enforcing CSP header used by the automated test suite    |

Open any example after building (`npm run build`) with any static file
server from the repo root, e.g. `npx http-server .`, then visit
`/examples/basic-gallery/index.html`.

## Browser and runtime support

Tested this way only — not a broader compatibility claim:

| Engine   | Version tested                   | How                                                           |
| -------- | -------------------------------- | ------------------------------------------------------------- |
| Chromium | Chrome for Testing 153.0.8010.12 | Playwright, full suite                                        |
| Firefox  | 155.0                            | Playwright, full suite                                        |
| WebKit   | 26.6                             | Playwright, full suite                                        |
| Node.js  | v20.12.2                         | Build, unit tests, SSR-import and packed-tarball verification |

`engines.node` in `package.json` declares `>=18` based on the language/API
features actually used (native ESM, standard `fs/promises`, no
Node-version-specific APIs) — only v20.12.2 was actually executed against.
No real-device Safari/iOS or older/non-evergreen browser versions were
tested; see [docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md) for the
full, honest breakdown of what ran versus what's marked `NOT RUN`.

## Development

```sh
npm install
npm run build        # tsup -> dist/, plus CSS copy
npm run clean         # rm -rf dist
npm run typecheck
npm run lint
npm test              # vitest unit tests (pure state/option logic)
npm run test:browser  # Playwright: CSP compliance, navigation, a11y, features (alias: test:e2e)
npm run test:csp      # Playwright, scoped to CSP compliance only
npm run test:ssr      # verifies the dist entry imports with no window/document
npm run test:pack     # packs the real npm tarball and installs it into a clean fixture
```

## What's implemented vs. deferred

The CSP contract, core navigation/lifecycle engine, finite/rewind/loop
boundary modes, slide/fade transitions, autoplay, drag/keyboard/touch
input, RTL/vertical/multi-slide/variable-width layout, accessibility
fundamentals, and packaging are implemented and covered by 119 automated
tests across three real browsers plus Node, all passing with zero skips.
Virtualization, grid/multi-row layouts, parallax/zoom, deep-linking, and
tested framework adapter packages are explicitly out of scope for this
release — see [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the full
reconciliation of what's implemented, tested, constrained, or deferred,
and why. Real assistive-technology (screen reader/device) manual testing
is tracked as pending in
[docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md#manual-verification-checklist)
rather than assumed complete — automated `axe-core` scans pass, but don't
by themselves establish full conformance.

## Support and security reports

This is an independent open-source project, not affiliated with any
company or npm organization. Report bugs, feature requests, and security
concerns via [GitHub Issues](https://github.com/dev-saurav61295/csp-safe-slider/issues).
For a suspected security issue specifically, please avoid filing a public
issue with exploit details before a fix is available — open an issue
asking for a private contact instead.

## License

MIT — see [LICENSE](LICENSE). See [docs/RELEASE.md](docs/RELEASE.md) for
the maintainer's pre-publish checklist.
