import { registerModule } from '../registry.js';
import { manifest } from './tts.manifest.js';

export { manifest };

let abortedByStop = false;
let store = null;
let voicesListener = null;
let voicesInterval = null;
let voicesIntervalTimeout = null;
let preferredLangUnsubscribe = null;
let lastPreferredLang = '';
let activeUtterance = null;
let readerText = '';
let readerWords = [];
let readerTotalChars = 0;

function clearVoicesWatchers() {
  if (
    voicesListener &&
    'speechSynthesis' in window &&
    typeof window.speechSynthesis.removeEventListener === 'function'
  ) {
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

function detachPreferredLangWatcher() {
  if (typeof preferredLangUnsubscribe === 'function') {
    preferredLangUnsubscribe();
  }
  preferredLangUnsubscribe = null;
}

function attachPreferredLangWatcher() {
  if (!store || typeof store.on !== 'function') return;
  detachPreferredLangWatcher();
  lastPreferredLang = store.get('tts.preferredLang') || '';
  preferredLangUnsubscribe = store.on((snapshot) => {
    const nextPreferred = snapshot?.tts?.preferredLang ?? '';
    if (nextPreferred !== lastPreferredLang) {
      lastPreferredLang = nextPreferred;
      updateVoices();
    }
  });
}

function getSelectionText() {
  const sel = window.getSelection?.();
  return sel && sel.toString().trim().length ? sel.toString() : '';
}

function cancelCurrentUtterance() {
  if (!('speechSynthesis' in window)) {
    activeUtterance = null;
    return;
  }
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    activeUtterance = null;
    window.speechSynthesis.cancel();
  } else {
    activeUtterance = null;
  }
}

function resolveVoice(state) {
  if (!state) return null;
  const voiceId = typeof state.get === 'function' ? state.get('tts.voice') : state.tts?.voice;
  if (!voiceId || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return voices.find((voice) => voice.voiceURI === voiceId) || null;
}

function computeWordBoundaries(text) {
  if (!text) return [];
  const words = [];
  const regex = /\S+/g;
  let match = regex.exec(text);
  while (match) {
    words.push({ start: match.index, end: match.index + match[0].length });
    match = regex.exec(text);
  }
  return words;
}

function findWordIndex(words, charIndex) {
  if (!words.length || typeof charIndex !== 'number' || Number.isNaN(charIndex)) {
    return -1;
  }
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (charIndex < word.start) {
      return i === 0 ? 0 : i - 1;
    }
    if (charIndex < word.end) {
      return i;
    }
  }
  return words.length - 1;
}

function updateReaderState(charIndex, total = readerTotalChars) {
  if (!store) return;
  const limitedTotal = Math.max(0, total || 0);
  const clampedIndex = Math.min(Math.max(0, Math.floor(charIndex ?? 0)), limitedTotal);
  store.set('tts.reader.charIndex', clampedIndex);
  if (limitedTotal > 0) {
    store.set('tts.progress', Math.min(1, clampedIndex / limitedTotal));
  } else {
    store.set('tts.progress', 0);
  }
  if (limitedTotal > 0 && clampedIndex >= limitedTotal) {
    store.set('tts.reader.activeWord', -1);
    return;
  }
  const wordIndex = findWordIndex(readerWords, clampedIndex);
  store.set('tts.reader.activeWord', wordIndex);
}

function prepareReaderText(text) {
  readerText = text || '';
  readerTotalChars = readerText.length;
  readerWords = computeWordBoundaries(readerText);
  if (!store) return;
  store.set('tts.reader.text', readerText);
  store.set('tts.reader.totalChars', readerTotalChars);
  store.set('tts.reader.words', readerWords);
  store.set('tts.reader.charIndex', 0);
  store.set('tts.reader.activeWord', -1);
}

function speak(text, { rate = 1, pitch = 1, volume = 1 } = {}, state, context = {}) {
  if (!('speechSynthesis' in window)) {
    console.warn('a11ytb: synthèse vocale indisponible sur ce navigateur.');
    if (state) {
      state.set('tts.status', 'unsupported');
      state.set('tts.speaking', false);
    }
    window.a11ytb?.logActivity?.('Synthèse vocale indisponible', { tone: 'alert' });
    return false;
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;
  utter.pitch = pitch;
  utter.volume = volume;
  const voice = resolveVoice(state);
  if (voice) utter.voice = voice;
  const { offset = 0, total = Math.max(text.length, 1) } = context;
  const totalChars = Math.max(total, 1);
  const baseOffset = Math.max(0, offset);
  abortedByStop = false;
  if (state) {
    state.set('tts.speaking', true);
    state.set('tts.status', 'speaking');
    updateReaderState(baseOffset, totalChars);
    utter.onboundary = (event) => {
      if (activeUtterance !== utter) return;
      const idx = baseOffset + (event.charIndex || 0);
      updateReaderState(idx, totalChars);
    };
    utter.onend = () => {
      if (activeUtterance !== utter) return;
      activeUtterance = null;
      state.set('tts.progress', 1);
      state.set('tts.speaking', false);
      state.set('tts.status', 'idle');
      store?.set('tts.reader.activeWord', -1);
      store?.set('tts.reader.charIndex', totalChars);
      if (abortedByStop) {
        abortedByStop = false;
      } else {
        window.a11ytb?.logActivity?.('Lecture terminée');
      }
    };
    utter.onerror = () => {
      if (activeUtterance !== utter) return;
      activeUtterance = null;
      state.set('tts.speaking', false);
      state.set('tts.status', 'error');
      state.set('tts.progress', 0);
      store?.set('tts.reader.activeWord', -1);
      abortedByStop = false;
      window.a11ytb?.logActivity?.('Erreur de synthèse vocale', { tone: 'alert' });
    };
  }
  activeUtterance = utter;
  window.speechSynthesis.speak(utter);
  window.a11ytb?.feedback?.play('confirm');
  return true;
}

function startReaderFrom(offset = 0) {
  if (!store) return false;
  if (!readerText) {
    readerText = store.get('tts.reader.text') || '';
    readerTotalChars = readerText.length;
    readerWords = Array.isArray(store.get('tts.reader.words')) ? store.get('tts.reader.words') : [];
  }
  if (!readerText) return false;
  const total = readerTotalChars || readerText.length;
  const safeTotal = Math.max(0, total);
  const maxIndex = safeTotal;
  const clampedOffset = Math.min(Math.max(0, Math.floor(offset)), maxIndex);
  cancelCurrentUtterance();
  const chunk = readerText.slice(clampedOffset);
  if (!chunk.trim().length) {
    updateReaderState(safeTotal, safeTotal);
    store?.set('tts.speaking', false);
    store?.set('tts.status', 'idle');
    return false;
  }
  const ok = speak(chunk, store.get('tts'), store, { offset: clampedOffset, total: safeTotal });
  if (!ok) {
    updateReaderState(clampedOffset, safeTotal);
    return false;
  }
  updateReaderState(clampedOffset, safeTotal);
  return true;
}

function voicesEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return (
      entry?.voiceURI === other?.voiceURI &&
      entry?.lang === other?.lang &&
      entry?.name === other?.name &&
      !!entry?.default === !!other?.default
    );
  });
}

function updateVoices() {
  if (!store || !('speechSynthesis' in window)) return;
  const list = window.speechSynthesis.getVoices?.() ?? [];
  const mapped = list.map((voice) => ({
    name: voice.name,
    lang: voice.lang,
    voiceURI: voice.voiceURI,
    default: voice.default,
  }));
  const current = store.get('tts.availableVoices') || [];
  if (!voicesEqual(current, mapped)) {
    store.set('tts.availableVoices', mapped);
  }
  const selectedId = store.get('tts.voice');
  const preferredLang = (store.get('tts.preferredLang') || '').toLowerCase();
  const selectedVoice = mapped.find((voice) => voice.voiceURI === selectedId) || null;
  const docLang = (document.documentElement.lang || '').toLowerCase();
  const docLangPrefix = docLang.split('-')[0];
  const navigatorLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
  const navigatorLangPrefix = navigatorLang.split('-')[0];
  const preferences = [];
  const addPreference = (value) => {
    const normalized = (value || '').toLowerCase();
    if (!normalized) return;
    if (!preferences.includes(normalized)) preferences.push(normalized);
  };
  addPreference(preferredLang);
  addPreference(docLang);
  addPreference(docLangPrefix);
  addPreference(navigatorLang);
  addPreference(navigatorLangPrefix);
  const matchPreference = () => {
    for (const pref of preferences) {
      const match = mapped.find((voice) => voice.lang?.toLowerCase().startsWith(pref));
      if (match) return match;
    }
    return null;
  };
  const fallback = mapped.find((voice) => voice.default) || mapped[0] || null;
  let nextVoice = null;
  if (!selectedVoice) {
    nextVoice = matchPreference() || fallback;
  } else if (preferredLang && !selectedVoice.lang?.toLowerCase().startsWith(preferredLang)) {
    nextVoice = matchPreference() || selectedVoice;
  }
  if (!nextVoice && selectedVoice) {
    nextVoice = selectedVoice;
  }
  if (!nextVoice) {
    nextVoice = fallback;
  }
  if (nextVoice && nextVoice.voiceURI !== selectedId) {
    store.set('tts.voice', nextVoice.voiceURI);
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
    attachPreferredLangWatcher();
    const api = {
      speakSelection() {
        const candidate = getSelectionText() || document.activeElement?.value || '';
        const fallback = document.body?.innerText?.slice(0, 2000) || '';
        const text = candidate && candidate.trim().length ? candidate : fallback;
        if (!text || !text.trim().length) {
          return;
        }
        prepareReaderText(text);
        const ok = startReaderFrom(0);
        if (ok) {
          window.a11ytb?.logActivity?.('Lecture de la sélection lancée');
        }
      },
      speakPage() {
        const text = document.body?.innerText?.slice(0, 4000) || '';
        if (!text || !text.trim().length) {
          return;
        }
        prepareReaderText(text);
        const ok = startReaderFrom(0);
        if (ok) {
          window.a11ytb?.logActivity?.('Lecture de la page lancée');
        }
      },
      stop() {
        abortedByStop = true;
        cancelCurrentUtterance();
        abortedByStop = false;
        store?.set('tts.speaking', false);
        store?.set('tts.status', 'idle');
        store?.set('tts.progress', 0);
        store?.set('tts.reader.charIndex', 0);
        store?.set('tts.reader.activeWord', -1);
        window.a11ytb?.feedback?.play('toggle');
        window.a11ytb?.logActivity?.('Lecture interrompue');
      },
      seekTo(progress) {
        const numeric = Number(progress);
        if (!Number.isFinite(numeric)) return;
        const clamped = Math.min(Math.max(numeric, 0), 1);
        if (!readerText) {
          readerText = store.get('tts.reader.text') || '';
          readerTotalChars = readerText.length;
          readerWords = Array.isArray(store.get('tts.reader.words'))
            ? store.get('tts.reader.words')
            : [];
        }
        if (!readerText) return;
        const total = readerTotalChars || readerText.length;
        if (total <= 0) return;
        const target = Math.round(clamped * total);
        const previous = store.get('tts.reader.charIndex') ?? 0;
        if (target === previous && store.get('tts.status') !== 'speaking') {
          return;
        }
        const ok = startReaderFrom(target);
        if (!ok) {
          updateReaderState(target, total);
        }
        window.a11ytb?.logActivity?.(`Lecture repositionnée à ${Math.round(clamped * 100)} %`, {
          module: 'tts',
          tags: ['tts', 'scrub'],
        });
      },
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
    detachPreferredLangWatcher();
    cancelCurrentUtterance();
    activeUtterance = null;
    readerText = '';
    readerWords = [];
    readerTotalChars = 0;
    store?.set('tts.speaking', false);
    store?.set('tts.status', 'idle');
    store?.set('tts.progress', 0);
    store?.set('tts.reader.open', false);
    store?.set('tts.reader.text', '');
    store?.set('tts.reader.words', []);
    store?.set('tts.reader.totalChars', 0);
    store?.set('tts.reader.charIndex', 0);
    store?.set('tts.reader.activeWord', -1);
  },
};

registerModule(tts);
