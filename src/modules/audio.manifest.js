import { AUDIO_PRESET_OPTIONS, AUDIO_SEVERITIES, createDefaultAudioState, getAudioSeverityLabel } from '../audio-config.js';

export const manifest = {
  id: 'audio-feedback',
  name: 'Alertes sonores',
  version: '0.1.0',
  description: 'Personnalisez les sons associés aux activités de la boîte à outils.',
  category: 'interaction',
  keywords: ['audio', 'feedback', 'son', 'alertes'],
  license: 'MIT',
  authors: [
    {
      name: 'Équipe A11y Toolbox Pro',
      email: 'team@example.com'
    }
  ],
  permissions: ['webAudio', 'user-preferences'],
  compat: {
    features: ['AudioContext', 'OfflineAudioContext'],
    browsers: ['Chrome 120+', 'Firefox 120+', 'Edge 120+']
  },
  defaults: {
    state: {
      audio: createDefaultAudioState()
    }
  },
  guides: [
    {
      id: 'audio-alerts-fastpass',
      title: 'Calibrer les alertes sonores',
      description: 'Vérifiez le rendu des alertes critiques et assurez-vous que les utilisateurs peuvent ajuster le volume.',
      category: 'interaction',
      prerequisites: [
        { type: 'module', id: 'audio-feedback' },
        { type: 'feature', id: 'webAudio' }
      ],
      steps: [
        {
          id: 'audio-volume-check',
          label: 'Régler le volume global',
          mode: 'manual',
          detail: 'Ouvrez Options & Profils → Alertes sonores et ajustez le volume entre 40 % et 60 % dans un environnement calme.'
        },
        {
          id: 'audio-critical-alert',
          label: 'Tester les alertes critiques',
          mode: 'manual',
          detail: 'Déclenchez un événement « Critique » et vérifiez que l’alerte est audible et non intrusive.'
        }
      ],
      assistance: {
        microcopy: 'Conservez une marge de 20 dB entre les alertes critiques et les notifications informatives.',
        resources: [
          {
            id: 'wcag-audio-control',
            href: 'https://www.w3.org/TR/WCAG21/#audio-control',
            label: 'WCAG 2.1 — Audio Control',
            external: true
          },
          {
            id: 'stark-audio',
            href: 'https://www.getstark.co/features',
            label: 'Stark – Audio Guidance',
            external: true
          }
        ]
      },
      tags: ['fastpass', 'audio']
    }
  ],
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
