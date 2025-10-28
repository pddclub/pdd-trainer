import bootstrapTrainer from './trainer/index.js';

function init() {
  bootstrapTrainer({ window, document });
}

if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}
