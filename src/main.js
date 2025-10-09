import { createStore } from './store.js';
import { mountUI } from './ui.js';
import { registerBlock } from './registry.js';
import './modules/tts.js';
import './modules/stt.js';
import './modules/braille.js';
import './modules/contrast.js';
import './modules/spacing.js';

const initial = {
  ui: { dock: 'right' },
  tts: { rate: 1, pitch: 1, volume: 1, speaking: false, status: 'idle' },
  stt: { status: 'idle', transcript: '' },
  braille: { output: '' },
  contrast: { enabled: false },
  spacing: { lineHeight: 1.5, letterSpacing: 0 }
};

const moduleIcons = {
  tts: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 9v6h3l4 4V5L7 9H4zm13 3a3 3 0 00-3-3v6a3 3 0 003-3zm-3-6.9v2.07a5 5 0 010 9.66V18a7 7 0 000-13.9z"/></svg>',
  stt: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a1 1 0 012 0 7 7 0 01-6 6.92V21h3v1H8v-1h3v-3.08A7 7 0 015 11a1 1 0 012 0 5 5 0 0010 0z"/></svg>',
  braille: '<svg viewBox="0 0 24 24" focusable="false"><path d="M6 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm12-14a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4z"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 2a10 10 0 100 20V2z"/></svg>',
  spacing: '<svg viewBox="0 0 24 24" focusable="false"><path d="M7 4h10v2H7V4zm-2 5h14v2H5V9zm3 5h8v2H8v-2zm-3 5h14v2H5v-2z"/></svg>'
};

function moduleTitle(key, label) {
  const icon = moduleIcons[key] || '';
  return `
    <h3 class="a11ytb-module-title">
      <span class="a11ytb-module-icon" aria-hidden="true">${icon}</span>
      ${label}
    </h3>
  `;
}

function ttsStatusMessage(status) {
  switch (status) {
    case 'unsupported':
      return 'Synthèse vocale indisponible sur ce navigateur.';
    case 'error':
      return 'Erreur lors de la synthèse vocale. Réessayez.';
    default:
      return '';
  }
}

const state = createStore('a11ytb/v1', initial);
document.documentElement.dataset.dock = state.get('ui.dock') || 'right';
state.on(s => {
  if (s.ui?.dock) document.documentElement.dataset.dock = s.ui.dock;
});

const root = document.getElementById('a11ytb-root');
mountUI({ root, state });

registerBlock({
  id: 'tts-controls',
  render: (state) => {
    const s = state.get();
    const statusMessage = ttsStatusMessage(s.tts.status);
    const statusMarkup = `
      <p class="a11ytb-note" role="status" data-ref="status"${statusMessage ? '' : ' hidden'}>${statusMessage}</p>
    `;
    return `
      ${moduleTitle('tts', 'Lecture vocale (TTS)')}
      <div class="a11ytb-row">
        <button class="a11ytb-button" data-action="speak-selection">Lire la sélection</button>
        <button class="a11ytb-button" data-action="speak-page">Lire la page</button>
        <button class="a11ytb-button" data-action="stop">Stop</button>
      </div>
      ${statusMarkup}
      <label>Vitesse <input type="range" min="0.5" max="2" step="0.1" value="${s.tts.rate}" data-bind="rate"></label>
      <label>Timbre <input type="range" min="0" max="2" step="0.1" value="${s.tts.pitch}" data-bind="pitch"></label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" value="${s.tts.volume}" data-bind="volume"></label>
    `;
  },
  wire: ({ root, state }) => {
    root.querySelector('[data-action="speak-selection"]').addEventListener('click', () => window.speakSelection());
    root.querySelector('[data-action="speak-page"]').addEventListener('click', () => window.speakPage());
    root.querySelector('[data-action="stop"]').addEventListener('click', () => window.stopSpeaking());
    root.querySelectorAll('input[data-bind]').forEach(inp => {
      inp.addEventListener('input', () => {
        state.set(`tts.${inp.dataset.bind}`, inp.valueAsNumber || parseFloat(inp.value));
      });
    });
    const statusNode = root.querySelector('[data-ref="status"]');
    if (statusNode) {
      state.on(s => {
        const message = ttsStatusMessage(s.tts.status);
        statusNode.textContent = message;
        if (message) {
          statusNode.removeAttribute('hidden');
        } else {
          statusNode.setAttribute('hidden', '');
        }
      });
    }
  }
});

registerBlock({
  id: 'stt-controls',
  render: (state) => {
    const s = state.get();
    return `
      ${moduleTitle('stt', 'Reconnaissance vocale (STT)')}
      <div class="a11ytb-row">
        <button class="a11ytb-button" data-action="start">Démarrer</button>
        <button class="a11ytb-button" data-action="stop">Arrêter</button>
        <span>Status&nbsp;: <strong data-ref="status">${s.stt.status}</strong></span>
      </div>
      <textarea rows="3" style="width:100%" placeholder="Transcription..." data-ref="txt">${s.stt.transcript}</textarea>
    `;
  },
  wire: ({ root, state }) => {
    const txt = root.querySelector('[data-ref="txt"]');
    const statusEl = root.querySelector('[data-ref="status"]');
    root.querySelector('[data-action="start"]').addEventListener('click', () => window.a11ytb?.stt?.start?.());
    root.querySelector('[data-action="stop"]').addEventListener('click', () => window.a11ytb?.stt?.stop?.());
    state.on(s => {
      txt.value = s.stt.transcript || '';
      if (statusEl) statusEl.textContent = s.stt.status;
    });
  }
});

registerBlock({
  id: 'braille-controls',
  render: (state) => {
    const s = state.get();
    return `
      ${moduleTitle('braille', 'Braille')}
      <div class="a11ytb-row">
        <button class="a11ytb-button" data-action="sel">Transcrire la sélection</button>
        <button class="a11ytb-button" data-action="clear">Effacer</button>
      </div>
      <div aria-live="polite">Sortie&nbsp;:</div>
      <textarea rows="3" style="width:100%" readonly data-ref="out">${s.braille.output || ''}</textarea>
    `;
  },
  wire: ({ root, state }) => {
    const out = root.querySelector('[data-ref="out"]');
    root.querySelector('[data-action="sel"]').addEventListener('click', () => window.brailleSelection());
    root.querySelector('[data-action="clear"]').addEventListener('click', () => window.clearBraille());
    state.on(s => { out.value = s.braille.output || ''; });
  }
});

registerBlock({
  id: 'contrast-controls',
  render: (state) => {
    const s = state.get();
    return `
      ${moduleTitle('contrast', 'Contraste élevé')}
      <button class="a11ytb-button" data-action="toggle" aria-pressed="${s.contrast.enabled}">${s.contrast.enabled ? 'Désactiver' : 'Activer'}</button>
    `;
  },
  wire: ({ root, state }) => {
    const btn = root.querySelector('[data-action="toggle"]');
    btn.addEventListener('click', () => {
      const enabled = !(state.get('contrast.enabled'));
      state.set('contrast.enabled', enabled);
      document.documentElement.classList.toggle('a11ytb-contrast', enabled);
      btn.textContent = enabled ? 'Désactiver' : 'Activer';
      btn.setAttribute('aria-pressed', String(enabled));
    });
  }
});

registerBlock({
  id: 'spacing-controls',
  render: (state) => {
    const s = state.get();
    return `
      ${moduleTitle('spacing', 'Espacements')}
      <label>Interlignage <input type="range" min="1" max="2.4" step="0.1" value="${s.spacing.lineHeight}" data-bind="lineHeight"></label>
      <label>Espacement des lettres <input type="range" min="0" max="0.2" step="0.01" value="${s.spacing.letterSpacing}" data-bind="letterSpacing"></label>
    `;
  },
  wire: ({ root, state }) => {
    root.querySelectorAll('input[data-bind]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.bind;
        const val = inp.valueAsNumber || parseFloat(inp.value);
        state.set(`spacing.${key}`, val);
        document.documentElement.style.setProperty('--a11ytb-lh', String(state.get('spacing.lineHeight')));
        document.documentElement.style.setProperty('--a11ytb-ls', String(state.get('spacing.letterSpacing')) + 'em');
      });
    });
    document.documentElement.style.setProperty('--a11ytb-lh', String(state.get('spacing.lineHeight')));
    document.documentElement.style.setProperty('--a11ytb-ls', String(state.get('spacing.letterSpacing')) + 'em');
    document.documentElement.classList.add('a11ytb-spacing-ready');
  }
});
