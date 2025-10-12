import { registerModule } from '../registry.js';
import { manifest } from './stt.manifest.js';

export { manifest };

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let store = null;

function teardownRecognition() {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch (error) {
    // ignore stop errors during teardown
  }
  recognition.onstart = null;
  recognition.onend = null;
  recognition.onerror = null;
  recognition.onresult = null;
  recognition = null;
}

function createRecognition() {
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.lang = document.documentElement.lang || 'fr-FR';
  rec.interimResults = true;
  rec.continuous = true;

  rec.onstart = () => {
    store?.set('stt.status', 'listening');
    window.a11ytb?.feedback?.play('confirm');
    window.a11ytb?.logActivity?.('Reconnaissance vocale démarrée');
  };
  rec.onend = () => {
    store?.set('stt.status', 'idle');
    window.a11ytb?.logActivity?.('Reconnaissance vocale terminée');
  };
  rec.onerror = () => {
    store?.set('stt.status', 'error');
    window.a11ytb?.feedback?.play('alert');
    window.a11ytb?.logActivity?.('Erreur de reconnaissance vocale', { tone: 'alert' });
  };
  rec.onresult = (evt) => {
    let final = '';
    for (let i = evt.resultIndex; i < evt.results.length; ++i) {
      final += evt.results[i][0].transcript;
    }
    store?.set('stt.transcript', final);
  };

  return rec;
}

const stt = {
  id: manifest.id,
  manifest,
  init({ state }) {
    store = state;
    const api = {
      start() {
        if (!recognition) {
          store?.set('stt.status', SpeechRecognition ? 'idle' : 'unsupported');
          if (!SpeechRecognition) {
            console.warn('a11ytb: reconnaissance vocale indisponible sur ce navigateur.');
            window.a11ytb?.logActivity?.('Reconnaissance vocale indisponible', { tone: 'alert' });
          }
          return;
        }
        try {
          recognition.start();
        } catch (error) {
          console.warn('a11ytb: impossible de démarrer la reconnaissance vocale.', error);
          window.a11ytb?.logActivity?.('Échec du démarrage STT', { tone: 'alert' });
        }
      },
      stop() {
        if (!recognition) return;
        try {
          recognition.stop();
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
  },
  mount() {
    recognition = createRecognition();
    if (!recognition && !SpeechRecognition) {
      store?.set('stt.status', 'unsupported');
    }
  },
  unmount() {
    teardownRecognition();
    store?.set('stt.status', 'idle');
  }
};

registerModule(stt);
