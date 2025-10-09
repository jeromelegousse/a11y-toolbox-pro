import { listBlocks, renderBlock } from './registry.js';

export function mountUI({ root, state }) {
  const fab = document.createElement('button');
  fab.className = 'a11ytb-fab';
  fab.setAttribute('aria-label', 'Ouvrir la boîte à outils d’accessibilité');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.94 3a8.94 8.94 0 00-.5-1.47l2.06-1.5-2-3.46-2.44 1a9.09 9.09 0 00-2.02-1.17l-.37-2.6h-4l-.37 2.6A9.09 9.09 0 007.93 4.6l-2.44-1-2 3.46 2.06 1.5A8.94 8.94 0 005.06 11H2v4h3.06c.12.51.29 1 .5 1.47l-2.06 1.5 2 3.46 2.44-1c.62.47 1.3.86 2.02 1.17l.37 2.6h4l.37-2.6c.72-.31 1.4-.7 2.02-1.17l2.44 1 2-3.46-2.06-1.5c.21-.47.38-.96.5-1.47H22v-4h-3.06z"/>
  </svg>`;

  const overlay = document.createElement('div');
  overlay.className = 'a11ytb-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.dataset.open = 'false';

  const panel = document.createElement('section');
  panel.className = 'a11ytb-panel';
  panel.dataset.open = 'false';
  panel.setAttribute('aria-hidden', 'true');
  panel.id = 'a11ytb-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'A11y Toolbox Pro');
  panel.tabIndex = -1;
  fab.setAttribute('aria-controls', panel.id);

  const header = document.createElement('div');
  header.className = 'a11ytb-header';
  header.innerHTML = `
    <div class="a11ytb-title">A11y Toolbox Pro</div>
    <div class="a11ytb-actions" role="toolbar" aria-label="Actions d’interface">
      <button class="a11ytb-button" data-action="dock-left">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm8 1H6v12h6V6zm2 0v12h5V6h-5z"/></svg>
        </span>
        Dock gauche
      </button>
      <button class="a11ytb-button" data-action="dock-right">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M5 4a1 1 0 00-1 1v14a1 1 0 001 1h14a1 1 0 001-1V5a1 1 0 00-1-1H5zm11 2h3v12h-3V6zm-2 0H6v12h8V6z"/></svg>
        </span>
        Dock droite
      </button>
      <button class="a11ytb-button" data-action="dock-bottom">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm1 8v5h14v-5H5zm0-2h14V6H5v5z"/></svg>
        </span>
        Dock bas
      </button>
      <button class="a11ytb-button" data-action="reset">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M12 5a7 7 0 015.917 10.777l1.52 1.318A9 9 0 103 12H1l3.5 3.5L8 12H5a7 7 0 017-7z"/></svg>
        </span>
        Réinitialiser
      </button>
      <button class="a11ytb-button" data-action="close" aria-label="Fermer">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M6.343 5.343L5.343 6.343 10.999 12l-5.656 5.657 1 1L12 13l5.657 5.657 1-1L13.001 12l5.656-5.657-1-1L12 11l-5.657-5.657z"/></svg>
        </span>
        <span class="a11ytb-button-label">Fermer</span>
      </button>
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'a11ytb-body';

  const footer = document.createElement('div');
  footer.className = 'a11ytb-header';
  footer.innerHTML = `<div class="a11ytb-title">Raccourci&nbsp;: Alt+Shift+A</div>`;

  panel.append(header, body, footer);

  listBlocks().forEach(block => renderBlock(block, state, body));

  root.append(overlay, fab, panel);

  let lastFocusedElement = null;

  function getFocusableElements() {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ];
    return Array.from(panel.querySelectorAll(focusableSelectors.join(',')))
      .filter(el => el.offsetParent !== null && !el.hasAttribute('hidden'));
  }

  function toggle(open) {
    const shouldOpen = open ?? panel.dataset.open !== 'true';
    panel.dataset.open = String(shouldOpen);
    panel.setAttribute('aria-hidden', String(!shouldOpen));
    fab.setAttribute('aria-expanded', String(shouldOpen));
    overlay.dataset.open = String(shouldOpen);
    overlay.setAttribute('aria-hidden', String(!shouldOpen));
    document.body.classList.toggle('a11ytb-modal-open', shouldOpen);
    if (shouldOpen) {
      lastFocusedElement = document.activeElement;
      const focusables = getFocusableElements();
      (focusables[0] || panel).focus();
    } else {
      const target = (lastFocusedElement && typeof lastFocusedElement.focus === 'function') ? lastFocusedElement : fab;
      target.focus();
      lastFocusedElement = null;
    }
  }

  fab.addEventListener('click', () => toggle(true));
  header.querySelector('[data-action="close"]').addEventListener('click', () => toggle(false));
  header.querySelector('[data-action="reset"]').addEventListener('click', () => state.reset());
  header.querySelector('[data-action="dock-left"]').addEventListener('click', () => state.set('ui.dock', 'left'));
  header.querySelector('[data-action="dock-right"]').addEventListener('click', () => state.set('ui.dock', 'right'));
  header.querySelector('[data-action="dock-bottom"]').addEventListener('click', () => state.set('ui.dock', 'bottom'));

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      toggle();
    }
  });

  overlay.addEventListener('click', () => toggle(false));

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      toggle(false);
      return;
    }
    if (e.key === 'Tab') {
      const focusables = getFocusableElements();
      if (!focusables.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.addEventListener('focusin', (event) => {
    if (panel.dataset.open === 'true') {
      if (!panel.contains(event.target) && event.target !== fab) {
        const focusables = getFocusableElements();
        (focusables[0] || panel).focus();
      }
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
