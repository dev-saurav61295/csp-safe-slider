// Bundler consumers: import { createSlider } from 'csp-safe-slider';
import { createSlider } from '../../dist/index.js';

const slider = createSlider(document.getElementById('gallery'), {
  mode: 'rewind',
  align: 'center',
});

slider.on('change', (event) => {
  console.log(`slide ${event.index + 1} (was ${event.previousIndex + 1}), via ${event.source}`);
});
