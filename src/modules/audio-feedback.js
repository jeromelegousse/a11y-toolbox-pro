import { registerModule } from '../registry.js';
import { manifest } from './audio-feedback.manifest.js';

export { manifest };

const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const FALLBACK_AUDIO = {
  masterVolume: 0.9,
  theme: 'classic',
  events: {
    confirm: true,
    alert: true,
    warning: true,
    info: true
  }
};

const DEFAULT_AUDIO = manifest.defaults?.state?.audio
  ? clone(manifest.defaults.state.audio)
  : clone(FALLBACK_AUDIO);

function normalizeConfig(snapshot = {}) {
  const audioState = snapshot.audio ?? snapshot;
  const baseEvents = DEFAULT_AUDIO.events ?? {};
  const events = { ...baseEvents };
  const providedEvents = audioState.events ?? {};
  Object.keys(baseEvents).forEach((key) => {
    if (key in providedEvents) {
      events[key] = !!providedEvents[key];
    }
  });
  const masterVolume = typeof audioState.masterVolume === 'number'
    ? Math.min(1, Math.max(0, audioState.masterVolume))
    : DEFAULT_AUDIO.masterVolume ?? 1;
  const theme = typeof audioState.theme === 'string' && audioState.theme.trim()
    ? audioState.theme.trim()
    : DEFAULT_AUDIO.theme ?? 'classic';
  return { theme, masterVolume, events };
}

const audioFeedback = {
  id: manifest.id,
  manifest,
  init({ state }) {
    const feedback = window.a11ytb?.feedback;
    if (!feedback || typeof feedback.configure !== 'function') {
      console.warn('a11ytb: feedback audio indisponible, module non initialisé.');
      return;
    }

    const ensureDefaults = clone(DEFAULT_AUDIO);
    const current = state.get('audio');
    if (!current) {
      state.set('audio', clone(ensureDefaults));
    } else {
      const merged = { ...ensureDefaults, ...current };
      merged.events = { ...ensureDefaults.events, ...(current.events || {}) };
      const previousSignature = JSON.stringify(current);
      const nextSignature = JSON.stringify(merged);
      if (previousSignature !== nextSignature) {
        state.set('audio', merged);
      }
    }

    let lastSignature = '';
    function apply(snapshot) {
      const config = normalizeConfig(snapshot);
      const signature = JSON.stringify(config);
      if (signature === lastSignature) return;
      lastSignature = signature;
      feedback.configure(config);
    }

    apply({ audio: state.get('audio') });
    state.on((s) => apply({ audio: s.audio }));
  }
};

registerModule(audioFeedback);
