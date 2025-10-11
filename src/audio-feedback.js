import { AUDIO_SEVERITIES, DEFAULT_AUDIO_VOLUME, normalizeAudioEvents } from './audio-config.js';

function clampVolume(value, fallback = DEFAULT_AUDIO_VOLUME) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

export function setupAudioFeedback({ state, feedback }) {
  if (!state || typeof state.get !== 'function' || !feedback || typeof feedback.configure !== 'function') {
    return () => {};
  }

  let lastPayload = null;

  function buildConfig(snapshot) {
    const audio = snapshot?.audio || {};
    const eventsConfig = normalizeAudioEvents(audio.events);
    const payload = {
      volume: clampVolume(audio.volume, DEFAULT_AUDIO_VOLUME),
      events: {}
    };
    AUDIO_SEVERITIES.forEach((severity) => {
      const entry = eventsConfig[severity];
      if (!entry) return;
      payload.events[severity] = {
        enabled: entry.enabled !== false,
        preset: entry.sound
      };
    });
    return payload;
  }

  function applyConfig(snapshot) {
    const payload = buildConfig(snapshot);
    const signature = JSON.stringify(payload);
    if (signature === lastPayload) return;
    lastPayload = signature;
    feedback.configure(payload);
  }

  applyConfig(state.get());
  const unsubscribe = state.on(applyConfig);
  return unsubscribe;
}
