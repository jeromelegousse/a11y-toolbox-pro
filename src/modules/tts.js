import { registerModule } from '../registry.js';

function getSelectionText() {
  const sel = window.getSelection?.();
  return sel && sel.toString().trim().length ? sel.toString() : '';
}

function speak(text, { rate=1, pitch=1, volume=1 } = {}) {
  if (!('speechSynthesis' in window)) {
    alert('La synthèse vocale n’est pas disponible sur ce navigateur.');
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate; utter.pitch = pitch; utter.volume = volume;
  window.speechSynthesis.speak(utter);
}

const tts = {
  id: 'tts',
  init({ state }) {
    const api = {
      speakSelection() {
        const t = getSelectionText() || document.activeElement?.value || '';
        const text = t || document.body.innerText.slice(0, 2000);
        speak(text, state.get('tts'));
        state.set('tts.speaking', true);
      },
      speakPage() {
        speak(document.body.innerText.slice(0, 4000), state.get('tts'));
        state.set('tts.speaking', true);
      },
      stop() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        state.set('tts.speaking', false);
      }
    };
    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.tts = api;
  }
};

registerModule(tts);
