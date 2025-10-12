import { registerModule } from '../registry.js';
import { manifest } from './tts.manifest.js';

export { manifest };

let abortedByStop = false;
let store = null;
let voicesListener = null;
let voicesInterval = null;
let voicesIntervalTimeout = null;

function clearVoicesWatchers() {
  if (voicesListener && 'speechSynthesis' in window && typeof window.speechSynthesis.removeEventListener === 'function') {
    window.speechSynthesis.removeEventListener('voiceschanged', voicesListener);
  }
  voicesListener = null;
  if (voicesInterval) {
    clearInterval(voicesInterval);
    voicesInterval = null;
  }
  if (voicesIntervalTimeout) {
    clearTimeout(voicesIntervalTimeout);
    voicesIntervalTimeout = null;
  }
}

function getSelectionText() {
  const sel = window.getSelection?.();
  return sel && sel.toString().trim().length ? sel.toString() : '';
}

function resolveVoice(state) {
  if (!state) return null;
  const voiceId = typeof state.get === 'function'
    ? state.get('tts.voice')
    : state.tts?.voice;
  if (!voiceId || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return voices.find((voice) => voice.voiceURI === voiceId) || null;
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
  const voice = resolveVoice(state);
  if (voice) utter.voice = voice;
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

function voicesEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return entry?.voiceURI === other?.voiceURI
      && entry?.lang === other?.lang
      && entry?.name === other?.name
      && !!entry?.default === !!other?.default;
  });
}

function updateVoices() {
  if (!store || !('speechSynthesis' in window)) return;
  const list = window.speechSynthesis.getVoices?.() ?? [];
  const mapped = list.map((voice) => ({
    name: voice.name,
    lang: voice.lang,
    voiceURI: voice.voiceURI,
    default: voice.default
  }));
  const current = store.get('tts.availableVoices') || [];
  if (!voicesEqual(current, mapped)) {
    store.set('tts.availableVoices', mapped);
  }
  const selected = store.get('tts.voice');
  if (!selected || !mapped.some((voice) => voice.voiceURI === selected)) {
    const docLang = (document.documentElement.lang || '').toLowerCase();
    const langPrefix = docLang.split('-')[0];
    const preferredByLang = mapped.find((voice) => voice.lang?.toLowerCase().startsWith(docLang))
      || mapped.find((voice) => voice.lang?.toLowerCase().startsWith(langPrefix));
    const fallback = mapped.find((voice) => voice.default) || mapped[0];
    const nextVoice = preferredByLang || fallback;
    if (nextVoice) {
      store.set('tts.voice', nextVoice.voiceURI);
    }
  }
}

function attachVoiceListeners() {
  if (!('speechSynthesis' in window)) return;
  clearVoicesWatchers();
  if (typeof window.speechSynthesis.addEventListener === 'function') {
    voicesListener = () => updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', voicesListener);
  } else {
    voicesInterval = setInterval(() => {
      const voices = window.speechSynthesis?.getVoices?.() ?? [];
      if (voices.length) {
        updateVoices();
        clearVoicesWatchers();
      }
    }, 250);
    voicesIntervalTimeout = setTimeout(() => clearVoicesWatchers(), 4000);
  }
}

const tts = {
  id: manifest.id,
  manifest,
  init({ state }) {
    store = state;
    const api = {
      speakSelection() {
        const t = getSelectionText() || document.activeElement?.value || '';
        const text = t || document.body.innerText.slice(0, 2000);
        const ok = speak(text, store?.get('tts'), store);
        if (ok) {
          window.a11ytb?.logActivity?.('Lecture de la sélection lancée');
        }
      },
      speakPage() {
        const ok = speak(document.body.innerText.slice(0, 4000), store?.get('tts'), store);
        if (ok) {
          window.a11ytb?.logActivity?.('Lecture de la page lancée');
        }
      },
      stop() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        abortedByStop = true;
        store?.set('tts.speaking', false);
        store?.set('tts.status', 'idle');
        store?.set('tts.progress', 0);
        window.a11ytb?.feedback?.play('toggle');
        window.a11ytb?.logActivity?.('Lecture interrompue');
      }
    };
    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.tts = api;
  },
  mount() {
    updateVoices();
    attachVoiceListeners();
  },
  unmount() {
    clearVoicesWatchers();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    store?.set('tts.speaking', false);
    store?.set('tts.status', 'idle');
    store?.set('tts.progress', 0);
  }
};

registerModule(tts);
