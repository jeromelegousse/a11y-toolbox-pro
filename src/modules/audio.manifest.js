import { AUDIO_PRESET_OPTIONS, AUDIO_SEVERITIES, createDefaultAudioState, getAudioSeverityLabel } from '../audio-config.js';

export const manifest = {
  id: 'audio-feedback',
  name: 'Alertes sonores',
  version: '0.1.0',
  description: 'Personnalisez les sons associés aux activités de la boîte à outils.',
  category: 'interaction',
  keywords: ['audio', 'feedback', 'son', 'alertes'],
  defaults: {
    state: {
      audio: createDefaultAudioState()
    }
  },
  config: {
    group: 'Alertes sonores',
    description: 'Définissez le volume global et les sons joués selon la sévérité des événements.',
    fields: [
      {
        type: 'range',
        path: 'audio.volume',
        label: 'Volume des retours audio',
        min: 0,
        max: 1,
        step: 0.05,
        format: (value) => `${Math.round(value * 100)} %`,
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Volume audio réglé à ${Math.round(value * 100)} %`, { tone: 'info', tags: ['audio'] });
        }
      },
      ...AUDIO_SEVERITIES.flatMap((severity) => {
        const label = getAudioSeverityLabel(severity);
        return [
          {
            type: 'toggle',
            path: `audio.events.${severity}.enabled`,
            label: `${label} audibles`,
            onChange: (enabled) => {
              const status = enabled ? 'activées' : 'désactivées';
              window.a11ytb?.logActivity?.(`${label} ${status}`, { tone: enabled ? 'confirm' : 'toggle', tags: ['audio', 'preferences'] });
            }
          },
          {
            type: 'select',
            path: `audio.events.${severity}.sound`,
            label: `Son pour ${label.toLowerCase()}`,
            options: AUDIO_PRESET_OPTIONS,
            onChange: (value) => {
              const option = AUDIO_PRESET_OPTIONS.find((entry) => entry.value === value);
              const selectedLabel = option ? option.label : value;
              window.a11ytb?.logActivity?.(`Son ${label.toLowerCase()} réglé sur ${selectedLabel}`, { tone: 'info', tags: ['audio', 'preferences'] });
            }
          }
        ];
      })
    ]
  }
};

export default manifest;
