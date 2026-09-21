import { createSlider } from '../../dist/index.js';

createSlider(document.getElementById('testimonials'), {
  mode: 'loop',
  autoplay: { interval: 4000 },
  labels: {
    prev: 'Previous testimonial',
    next: 'Next testimonial',
    goTo: (page) => `Show testimonial ${page + 1}`,
    rotation: {
      play: 'Resume testimonial rotation',
      pause: 'Pause testimonial rotation',
    },
  },
});
