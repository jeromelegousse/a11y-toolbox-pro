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

export default manifest;
