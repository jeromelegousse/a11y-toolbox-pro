import { registerModule } from '../registry.js';
import {
  AUDIO_SEVERITIES,
  DEFAULT_AUDIO_VOLUME,
  createDefaultAudioState,
  normalizeAudioEvents,
} from '../audio-config.js';
import { manifest } from './audio.manifest.js';

export { manifest };

const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

function clampVolume(value, fallback = DEFAULT_AUDIO_VOLUME) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

const DEFAULT_AUDIO_SOURCE = manifest.defaults?.state?.audio ?? createDefaultAudioState();
const DEFAULT_AUDIO = {
  volume: clampVolume(DEFAULT_AUDIO_SOURCE.volume, DEFAULT_AUDIO_VOLUME),
  events: normalizeAudioEvents(DEFAULT_AUDIO_SOURCE.events),
};

function sanitizeEventEntry(entry) {
  if (entry && typeof entry === 'object') {
    return { ...entry };
  }
  if (typeof entry === 'boolean') {
    return { enabled: entry };
  }
  if (typeof entry === 'string' && entry.trim()) {
    return { enabled: true, sound: entry.trim() };
  }
  return null;
}

function migrateEvents(rawEvents) {
  const sanitized = {};
  if (rawEvents && typeof rawEvents === 'object') {
    AUDIO_SEVERITIES.forEach((severity) => {
      const entry = sanitizeEventEntry(rawEvents[severity]);
      if (entry) {
        sanitized[severity] = entry;
      }
    });
    if (
      sanitized.success === undefined &&
      Object.prototype.hasOwnProperty.call(rawEvents, 'confirm')
    ) {
      const legacyConfirm = sanitizeEventEntry(rawEvents.confirm);
      if (legacyConfirm) {
        sanitized.success = legacyConfirm;
      }
    }
  }
  return normalizeAudioEvents(sanitized);
}

function migrateAudioState(raw) {
  const next = clone(DEFAULT_AUDIO);
  if (!raw || typeof raw !== 'object') {
    return next;
  }
  next.volume = clampVolume(raw.volume ?? raw.masterVolume, next.volume);
  next.events = migrateEvents(raw.events ?? {});
  return next;
}

function normalizeConfig(snapshot = {}) {
  const audioState = snapshot.audio ?? snapshot;
  return migrateAudioState(audioState);
}

let feedbackInstance = null;
let unsubscribe = null;
let applyConfig = null;
let lastSignature = '';

function buildSilentSnapshot() {
  const defaults = migrateEvents(DEFAULT_AUDIO.events);
  const events = {};
  AUDIO_SEVERITIES.forEach((severity) => {
    const entry = defaults[severity] || { enabled: true, sound: null };
    events[severity] = { ...entry, enabled: false };
  });
  return { audio: { volume: 0, events } };
}

const audioFeedback = {
  id: manifest.id,
  manifest,
  init({ state }) {
    feedbackInstance = window.a11ytb?.feedback;
    if (!feedbackInstance || typeof feedbackInstance.configure !== 'function') {
      console.warn('a11ytb: feedback audio indisponible, module non initialisé.');
      feedbackInstance = null;
      return;
    }

    const current = state.get('audio');
    const migrated = migrateAudioState(current);
    if (!current) {
      state.set('audio', clone(migrated));
    } else {
      const previousSignature = JSON.stringify(current);
      const nextSignature = JSON.stringify(migrated);
      if (previousSignature !== nextSignature) {
        state.set('audio', clone(migrated));
      }
    }

    applyConfig = (snapshot) => {
      if (!feedbackInstance) return;
      const config = normalizeConfig(snapshot);
      const payload = {
        volume: config.volume,
        events: {},
      };
      AUDIO_SEVERITIES.forEach((severity) => {
        const entry = config.events?.[severity];
        if (!entry) return;
        payload.events[severity] = {
          enabled: entry.enabled !== false,
          sound: entry.sound,
        };
      });
      const signature = JSON.stringify(payload);
      if (signature === lastSignature) return;
      lastSignature = signature;
      feedbackInstance.configure(payload);
    };
  },
  mount({ state }) {
    if (!feedbackInstance || !applyConfig) return;
    lastSignature = '';
    applyConfig({ audio: state.get('audio') });
    if (unsubscribe) unsubscribe();
    unsubscribe = state.on((s) => applyConfig({ audio: s.audio }));
  },
  unmount() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    lastSignature = '';
    if (feedbackInstance?.configure) {
      const fallback = normalizeConfig(buildSilentSnapshot());
      feedbackInstance.configure(fallback);
    }
  },
};

registerModule(audioFeedback);
