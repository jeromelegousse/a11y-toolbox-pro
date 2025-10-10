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

      rec.onstart = () => {
        state.set('stt.status', 'listening');
        window.a11ytb?.feedback?.play('confirm');
        window.a11ytb?.logActivity?.('Reconnaissance vocale démarrée');
      };
      rec.onend = () => {
        state.set('stt.status', 'idle');
        window.a11ytb?.logActivity?.('Reconnaissance vocale terminée');
      };
      rec.onerror = () => {
        state.set('stt.status', 'error');
        window.a11ytb?.feedback?.play('alert');
        window.a11ytb?.logActivity?.('Erreur de reconnaissance vocale', { tone: 'alert' });
      };
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
          window.a11ytb?.logActivity?.('Reconnaissance vocale indisponible', { tone: 'alert' });
          return;
        }
        try {
          rec.start();
        } catch (error) {
          console.warn('a11ytb: impossible de démarrer la reconnaissance vocale.', error);
          window.a11ytb?.logActivity?.('Échec du démarrage STT', { tone: 'alert' });
        }
      },
      stop() {
        if (!rec) return;
        try {
          rec.stop();
          window.a11ytb?.feedback?.play('toggle');
          window.a11ytb?.logActivity?.('Reconnaissance vocale stoppée');
        } catch (error) {
          console.warn('a11ytb: impossible d’arrêter la reconnaissance vocale.', error);
          window.a11ytb?.logActivity?.('Échec de l’arrêt STT', { tone: 'alert' });
        }
      }
    };

    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.stt = api;
  }
};

registerModule(stt);
