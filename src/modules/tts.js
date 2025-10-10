import { registerModule } from '../registry.js';

export const manifest = {
  id: 'tts',
  name: 'Synthèse vocale',
  version: '0.1.0',
  description: 'Lit le contenu sélectionné ou la page complète via l’API SpeechSynthesis.',
  category: 'lecture',
  keywords: ['tts', 'lecture', 'audio', 'speech'],
  permissions: ['speechSynthesis'],
  compat: {
    browsers: ['chrome >= 100', 'edge >= 100', 'safari >= 16']
  },
  defaults: {
    state: {
      tts: {
        rate: 1,
        pitch: 1,
        volume: 1,
        voice: '',
        availableVoices: [],
        speaking: false,
        status: 'idle',
        progress: 0
      }
    }
  },
  config: {
    group: 'Synthèse vocale',
    description: 'Réglez la voix et les paramètres audio utilisés par défaut pour la lecture.',
    fields: [
      {
        type: 'select',
        path: 'tts.voice',
        label: 'Voix par défaut',
        description: 'Sélectionnez la voix privilégiée pour les lectures automatiques.',
        emptyLabel: 'Aucune voix détectée',
        getOptions: (state) => {
          const voices = state.tts?.availableVoices ?? [];
          return voices.map((voice) => ({
            value: voice.voiceURI,
            label: `${voice.name} — ${voice.lang}${voice.default ? ' · Navigateur' : ''}`
          }));
        },
        onChange: (value, { state }) => {
          const voices = state.tts?.availableVoices ?? [];
          const selected = voices.find((voice) => voice.voiceURI === value);
          const label = selected ? `${selected.name} (${selected.lang})` : 'Voix navigateur';
          window.a11ytb?.logActivity?.(`Voix TTS sélectionnée : ${label}`);
        }
      },
      {
        type: 'range',
        path: 'tts.rate',
        label: 'Vitesse de lecture',
        min: 0.5,
        max: 2,
        step: 0.1,
        format: (value) => `${value.toFixed(1)}×`,
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Vitesse TTS réglée à ${value.toFixed(1)}×`);
        }
      },
      {
        type: 'range',
        path: 'tts.pitch',
        label: 'Timbre',
        min: 0,
        max: 2,
        step: 0.1,
        format: (value) => value.toFixed(1),
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Timbre TTS réglé à ${value.toFixed(1)}`);
        }
      },
      {
        type: 'range',
        path: 'tts.volume',
        label: 'Volume',
        min: 0,
        max: 1,
        step: 0.05,
        format: (value) => `${Math.round(value * 100)} %`,
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Volume TTS réglé à ${Math.round(value * 100)} %`);
        }
      }
    ]
  }
};

let abortedByStop = false;

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

const tts = {
  id: manifest.id,
  manifest,
  init({ state }) {
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
      if (!('speechSynthesis' in window)) return;
      const list = window.speechSynthesis.getVoices?.() ?? [];
      const mapped = list.map((voice) => ({
        name: voice.name,
        lang: voice.lang,
        voiceURI: voice.voiceURI,
        default: voice.default
      }));
      const current = state.get('tts.availableVoices') || [];
      if (!voicesEqual(current, mapped)) {
        state.set('tts.availableVoices', mapped);
      }
      const selected = state.get('tts.voice');
      if (!selected || !mapped.some((voice) => voice.voiceURI === selected)) {
        const docLang = (document.documentElement.lang || '').toLowerCase();
        const langPrefix = docLang.split('-')[0];
        const preferredByLang = mapped.find((voice) => voice.lang?.toLowerCase().startsWith(docLang))
          || mapped.find((voice) => voice.lang?.toLowerCase().startsWith(langPrefix));
        const fallback = mapped.find((voice) => voice.default) || mapped[0];
        const nextVoice = preferredByLang || fallback;
        if (nextVoice) {
          state.set('tts.voice', nextVoice.voiceURI);
        }
      }
    }

    updateVoices();
    if ('speechSynthesis' in window) {
      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
      } else {
        const interval = setInterval(() => {
          const voices = window.speechSynthesis?.getVoices?.() ?? [];
          if (voices.length) {
            updateVoices();
            clearInterval(interval);
          }
        }, 250);
        setTimeout(() => clearInterval(interval), 4000);
      }
    }

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
