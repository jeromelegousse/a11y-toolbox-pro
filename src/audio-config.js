export const AUDIO_SEVERITIES = Object.freeze(['alert', 'warning', 'success', 'info']);

const BASE_EVENT_DEFAULTS = {
  alert: { enabled: true, sound: 'alert' },
  warning: { enabled: true, sound: 'warning' },
  success: { enabled: true, sound: 'success' },
  info: { enabled: true, sound: 'toggle' },
};

export const DEFAULT_AUDIO_VOLUME = 1;
export const DEFAULT_AUDIO_THEME = 'classic';

export function createDefaultAudioEvents() {
  return AUDIO_SEVERITIES.reduce((acc, severity) => {
    const defaults = BASE_EVENT_DEFAULTS[severity] || { enabled: true, sound: 'confirm' };
    acc[severity] = { ...defaults };
    return acc;
  }, {});
}

export function createDefaultAudioState() {
  return {
    volume: DEFAULT_AUDIO_VOLUME,
    theme: DEFAULT_AUDIO_THEME,
    events: createDefaultAudioEvents(),
  };
}

export function normalizeAudioEvents(events) {
  const normalized = {};
  AUDIO_SEVERITIES.forEach((severity) => {
    const defaults = BASE_EVENT_DEFAULTS[severity] || { enabled: true, sound: 'confirm' };
    const source = events && typeof events === 'object' ? events[severity] : undefined;
    const enabled = typeof source?.enabled === 'boolean' ? source.enabled : defaults.enabled;
    const sound =
      typeof source?.sound === 'string' && source.sound.trim()
        ? source.sound.trim()
        : typeof source?.preset === 'string' && source.preset.trim()
          ? source.preset.trim()
          : defaults.sound;
    normalized[severity] = { enabled, sound };
  });
  return normalized;
}

export const AUDIO_PRESET_OPTIONS = [
  { value: 'alert', label: 'Alerte' },
  { value: 'warning', label: 'Avertissement' },
  { value: 'success', label: 'Succès' },
  { value: 'confirm', label: 'Confirmation' },
  { value: 'toggle', label: 'Bascule' },
  { value: 'info', label: 'Information' },
];

export function getAudioSeverityLabel(severity) {
  switch (severity) {
    case 'alert':
      return 'Alertes';
    case 'warning':
      return 'Avertissements';
    case 'success':
      return 'Succès';
    case 'info':
      return 'Informations';
    default:
      return severity;
  }
}
