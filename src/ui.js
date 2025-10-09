import { listBlocks, renderBlock } from './registry.js';

export function mountUI({ root, state }) {
  const fab = document.createElement('button');
  fab.className = 'a11ytb-fab';
  fab.setAttribute('aria-label', 'Ouvrir la boîte à outils d’accessibilité');
  fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.94 3a8.94 8.94 0 00-.5-1.47l2.06-1.5-2-3.46-2.44 1a9.09 9.09 0 00-2.02-1.17l-.37-2.6h-4l-.37 2.6A9.09 9.09 0 007.93 4.6l-2.44-1-2 3.46 2.06 1.5A8.94 8.94 0 005.06 11H2v4h3.06c.12.51.29 1 .5 1.47l-2.06 1.5 2 3.46 2.44-1c.62.47 1.3.86 2.02 1.17l.37 2.6h4l.37-2.6c.72-.31 1.4-.7 2.02-1.17l2.44 1 2-3.46-2.06-1.5c.21-.47.38-.96.5-1.47H22v-4h-3.06z"/>
  </svg>`;

  const panel = document.createElement('section');
  panel.className = 'a11ytb-panel';
  panel.dataset.open = 'false';

  const header = document.createElement('div');
  header.className = 'a11ytb-header';
  header.innerHTML = `
    <div class="a11ytb-title">A11y Toolbox Pro</div>
    <div class="a11ytb-actions">
      <button class="a11ytb-button" data-action="dock-left">Dock gauche</button>
      <button class="a11ytb-button" data-action="dock-right">Dock droite</button>
      <button class="a11ytb-button" data-action="dock-bottom">Dock bas</button>
      <button class="a11ytb-button" data-action="reset">Réinitialiser</button>
      <button class="a11ytb-button" data-action="close" aria-label="Fermer">Fermer</button>
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'a11ytb-body';

  const footer = document.createElement('div');
  footer.className = 'a11ytb-header';
  footer.innerHTML = `<div class="a11ytb-title">Raccourci : Alt+Shift+A</div>`;

  panel.append(header, body, footer);

  listBlocks().forEach(block => renderBlock(block, state, body));

  root.append(fab, panel);

  function toggle(open) {
    panel.dataset.open = String(open ?? panel.dataset.open !== 'true');
    if (panel.dataset.open === 'true') panel.focus();
  }

  fab.addEventListener('click', () => toggle(true));
  header.querySelector('[data-action="close"]').addEventListener('click', () => toggle(false));
  header.querySelector('[data-action="reset"]').addEventListener('click', () => state.reset());
  header.querySelector('[data-action="dock-left"]').addEventListener('click', () => document.documentElement.dataset.dock = 'left');
  header.querySelector('[data-action="dock-right"]').addEventListener('click', () => document.documentElement.dataset.dock = 'right');
  header.querySelector('[data-action="dock-bottom"]').addEventListener('click', () => document.documentElement.dataset.dock = 'bottom');

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      toggle();
    }
  });

  window.resetAll = () => state.reset();
  window.stopSpeaking = () => window.a11ytb?.tts?.stop?.();
  window.speakPage = () => window.a11ytb?.tts?.speakPage?.();
  window.speakSelection = () => window.a11ytb?.tts?.speakSelection?.();
  window.brailleSelection = () => window.a11ytb?.braille?.transcribeSelection?.();
  window.clearBraille = () => window.a11ytb?.braille?.clear?.();

  Object.defineProperty(window, 'sttStatus', { get() { return state.get('stt.status'); } });
  Object.defineProperty(window, 'brailleOut', { get() { return state.get('braille.output'); } });
}
