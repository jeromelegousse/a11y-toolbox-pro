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
        if (!rec) { alert('Reconnaissance vocale non disponible.'); return; }
        try { rec.start(); } catch {}
      },
      stop() { if (rec) try { rec.stop(); } catch {} }
    };

    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.stt = api;
  }
};

registerModule(stt);
