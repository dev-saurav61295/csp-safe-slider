import { createSlider } from '../../dist/index.js';

// Each instance is fully independent — separate state, separate listeners,
// separate destroy(). Direction is read from the element's own `dir`
// attribute via `direction: 'auto'` (the default), so no JS option is
// needed for the RTL instance beyond the markup's `dir="rtl"`.
createSlider(document.getElementById('rtl-slider'), { mode: 'finite' });

createSlider(document.getElementById('vertical-slider'), { axis: 'vertical', mode: 'finite' });

createSlider(document.getElementById('loop-slider'), { mode: 'loop' });
