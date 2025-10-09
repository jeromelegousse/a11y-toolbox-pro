import { registerModule } from '../registry.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const stt = {
  id: 'stt',
  init({ state }) {
    let rec = null;
    if (SpeechRecognition) {
      rec = new SpeechRecognition();
      rec.lang = document.documentElement.lang || 'fr-FR';
      rec.interimResults = true;
      rec.continuous = true;

      rec.onstart = () => state.set('stt.status', 'listening');
      rec.onend = () => state.set('stt.status', 'idle');
      rec.onerror = () => state.set('stt.status', 'error');
      rec.onresult = (evt) => {
        let final = '';
        for (let i = evt.resultIndex; i < evt.results.length; ++i) {
          final += evt.results[i][0].transcript;
        }
        state.set('stt.transcript', final);
      };
    }

    const api = {
      start() {
        if (!rec) {
          state.set('stt.status', 'unsupported');
          console.warn('a11ytb: reconnaissance vocale indisponible sur ce navigateur.');
          return;
        }
        try {
          rec.start();
        } catch (error) {
          console.warn('a11ytb: impossible de démarrer la reconnaissance vocale.', error);
        }
      },
      stop() {
        if (!rec) return;
        try {
          rec.stop();
        } catch (error) {
          console.warn('a11ytb: impossible d’arrêter la reconnaissance vocale.', error);
        }
      }
    };

    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.stt = api;
  }
};

registerModule(stt);
