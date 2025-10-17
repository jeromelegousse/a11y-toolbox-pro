import { registerModule } from '../registry.js';
import { manifest } from './stt.manifest.js';

export { manifest };

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let store = null;
let removeDeviceChangeListener = null;
let lastInputSourceLabel = null;

async function updateInputSource({ requestPermission = false } = {}) {
  if (!store) return null;
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
    store.set('stt.inputSource', 'Source audio indisponible');
    return null;
  }

  let stream = null;
  try {
    if (requestPermission && typeof mediaDevices.getUserMedia === 'function') {
      stream = await mediaDevices.getUserMedia({ audio: true });
    }

    const devices = await mediaDevices.enumerateDevices();
    const activeDevice =
      devices.find((device) => device.kind === 'audioinput' && device.deviceId === 'default') ||
      devices.find((device) => device.kind === 'audioinput' && device.deviceId === 'communications') ||
      devices.find((device) => device.kind === 'audioinput');

    let label = activeDevice?.label?.trim();
    const hasDevice = Boolean(activeDevice);
    if (!label) {
      label = hasDevice ? 'Micro par défaut' : 'Aucune entrée audio';
    }

    store.set('stt.inputSource', label);
    if (hasDevice) {
      if (label && label !== lastInputSourceLabel) {
        lastInputSourceLabel = label;
        window.a11ytb?.logActivity?.(`Source audio détectée : ${label}`);
      }
    } else if (label !== lastInputSourceLabel) {
      lastInputSourceLabel = label;
      window.a11ytb?.logActivity?.('Aucune entrée audio détectée', { tone: 'alert' });
    }

    return label;
  } catch (error) {
    console.warn('a11ytb: impossible de déterminer la source audio.', error);
    store.set('stt.inputSource', 'Source audio indisponible');
    return null;
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }
}

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
    updateInputSource();
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
      },
      refreshInputSource() {
        window.a11ytb?.logActivity?.('Actualisation de la source audio STT demandée');
        updateInputSource({ requestPermission: true });
      },
    };

    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.stt = api;
  },
  mount() {
    recognition = createRecognition();
    if (!recognition && !SpeechRecognition) {
      store?.set('stt.status', 'unsupported');
    }
    updateInputSource();
    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices) {
      const handler = () => updateInputSource();
      if (typeof mediaDevices.addEventListener === 'function') {
        mediaDevices.addEventListener('devicechange', handler);
        removeDeviceChangeListener = () => {
          mediaDevices.removeEventListener('devicechange', handler);
        };
      } else if ('ondevicechange' in mediaDevices) {
        const previous = mediaDevices.ondevicechange;
        mediaDevices.ondevicechange = handler;
        removeDeviceChangeListener = () => {
          if (mediaDevices.ondevicechange === handler) {
            mediaDevices.ondevicechange = previous || null;
          }
        };
      }
    }
  },
  unmount() {
    teardownRecognition();
    store?.set('stt.status', 'idle');
    if (typeof removeDeviceChangeListener === 'function') {
      removeDeviceChangeListener();
      removeDeviceChangeListener = null;
    }
    lastInputSourceLabel = null;
  },
};

registerModule(stt);
