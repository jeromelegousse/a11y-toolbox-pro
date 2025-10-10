import { registerModule } from '../registry.js';

let abortedByStop = false;

function getSelectionText() {
  const sel = window.getSelection?.();
  return sel && sel.toString().trim().length ? sel.toString() : '';
}

function speak(text, { rate = 1, pitch = 1, volume = 1 } = {}, state) {
  if (!('speechSynthesis' in window)) {
    console.warn('a11ytb: synthèse vocale indisponible sur ce navigateur.');
    if (state) {
      state.set('tts.status', 'unsupported');
      state.set('tts.speaking', false);
    }
    window.a11ytb?.logActivity?.('Synthèse vocale indisponible', { tone: 'alert' });
    return false;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate; utter.pitch = pitch; utter.volume = volume;
  abortedByStop = false;
  if (state) {
    state.set('tts.speaking', true);
    state.set('tts.status', 'speaking');
    state.set('tts.progress', 0);
    const total = Math.max(1, text.length);
    utter.onboundary = (event) => {
      const idx = (event.charIndex || 0) + (event.charLength || 0);
      const progress = Math.min(1, idx / total);
      state.set('tts.progress', progress);
    };
    utter.onend = () => {
      state.set('tts.progress', 1);
      state.set('tts.speaking', false);
      state.set('tts.status', 'idle');
      if (abortedByStop) {
        abortedByStop = false;
      } else {
        window.a11ytb?.logActivity?.('Lecture terminée');
      }
    };
    utter.onerror = () => {
      state.set('tts.speaking', false);
      state.set('tts.status', 'error');
      state.set('tts.progress', 0);
      abortedByStop = false;
      window.a11ytb?.logActivity?.('Erreur de synthèse vocale', { tone: 'alert' });
    };
  }
  window.speechSynthesis.speak(utter);
  window.a11ytb?.feedback?.play('confirm');
  return true;
}

const tts = {
  id: 'tts',
  init({ state }) {
    const api = {
      speakSelection() {
        const t = getSelectionText() || document.activeElement?.value || '';
        const text = t || document.body.innerText.slice(0, 2000);
        const ok = speak(text, state.get('tts'), state);
        if (ok) {
          window.a11ytb?.logActivity?.('Lecture de la sélection lancée');
        }
      },
      speakPage() {
        const ok = speak(document.body.innerText.slice(0, 4000), state.get('tts'), state);
        if (ok) {
          window.a11ytb?.logActivity?.('Lecture de la page lancée');
        }
      },
      stop() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        abortedByStop = true;
        state.set('tts.speaking', false);
        state.set('tts.status', 'idle');
        state.set('tts.progress', 0);
        window.a11ytb?.feedback?.play('toggle');
        window.a11ytb?.logActivity?.('Lecture interrompue');
      }
    };
    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.tts = api;
  }
};

registerModule(tts);
