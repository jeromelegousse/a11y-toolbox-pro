import { registerModule } from '../registry.js';

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
    return false;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate; utter.pitch = pitch; utter.volume = volume;
  if (state) {
    utter.onend = () => {
      state.set('tts.speaking', false);
      state.set('tts.status', 'idle');
    };
    utter.onerror = () => {
      state.set('tts.speaking', false);
      state.set('tts.status', 'error');
    };
  }
  window.speechSynthesis.speak(utter);
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
          state.set('tts.speaking', true);
          state.set('tts.status', 'speaking');
        }
      },
      speakPage() {
        const ok = speak(document.body.innerText.slice(0, 4000), state.get('tts'), state);
        if (ok) {
          state.set('tts.speaking', true);
          state.set('tts.status', 'speaking');
        }
      },
      stop() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        state.set('tts.speaking', false);
        state.set('tts.status', 'idle');
      }
    };
    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.tts = api;
  }
};

registerModule(tts);
