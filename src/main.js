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
      <h3>Lecture vocale (TTS)</h3>
      <div class="row">
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
      <h3>Reconnaissance vocale (STT)</h3>
      <div class="row">
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
      <h3>Braille</h3>
      <div class="row">
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
      <h3>Contraste élevé</h3>
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
      <h3>Espacements</h3>
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
