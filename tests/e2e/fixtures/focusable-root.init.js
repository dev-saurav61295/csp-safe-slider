import { createSlider } from '/dist/index.js';

const params = new URLSearchParams(location.search);
const root = document.getElementById('slider');

window.__slider = createSlider(root, {
  mode: params.get('mode') || 'finite',
  effect: params.get('effect') || 'fade',
  startIndex: Number(params.get('startIndex')) || 0,
  autoplay: false,
});
window.__sliderReady = true;
