import { createSlider } from '/dist/index.js';

const root = document.getElementById('slider');
window.__slider = createSlider(root, { mode: 'loop', controls: true, autoplay: false });
window.__sliderReady = true;
