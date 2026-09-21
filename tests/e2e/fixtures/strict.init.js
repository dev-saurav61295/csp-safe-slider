import { createSlider } from '/dist/index.js';

const params = new URLSearchParams(location.search);
const root = document.getElementById('slider');

if (params.get('dir')) root.setAttribute('dir', params.get('dir'));
if (params.get('narrow') === 'true') root.classList.add('csp-slider--narrow');

if (params.has('slides')) {
  const n = Number(params.get('slides'));
  const track = root.querySelector('[data-slider-track]');
  const all = Array.from(track.querySelectorAll('[data-slider-slide]'));
  all.forEach((slide, i) => {
    if (i >= n) slide.remove();
  });
}

window.__slider = createSlider(root, {
  mode: params.get('mode') || 'loop',
  axis: params.get('axis') || 'horizontal',
  slidesToScroll: Number(params.get('slidesToScroll')) || 1,
  effect: params.get('effect') || 'slide',
  startIndex: Number(params.get('startIndex')) || 0,
  freeScroll: params.get('freeScroll') === 'true',
  autoplay: params.get('autoplay') === 'true' ? { interval: 200 } : false,
  keyboard: true,
  draggable: true,
});
window.__sliderReady = true;
