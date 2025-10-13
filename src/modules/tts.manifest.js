export const manifest = {
  id: 'tts',
  name: 'Synthèse vocale',
  version: '0.1.0',
  description: 'Lit le contenu sélectionné ou la page complète via l’API SpeechSynthesis.',
  category: 'lecture',
  keywords: ['tts', 'lecture', 'audio', 'speech'],
  homepage: 'https://a11y-toolbox.test/modules/tts',
  bugs: 'https://a11y-toolbox.test/support',
  license: 'MIT',
  authors: [
    { name: 'Équipe Accessibilité', email: 'accessibilite@a11ytoolbox.test' },
    { name: 'Nora Belaïd', email: 'n.belaid@a11ytoolbox.test' }
  ],
  guides: [
    {
      id: 'tts-onboarding',
      title: 'Lecture vocale opérationnelle',
      description: 'Activez la synthèse vocale, vérifiez les voix disponibles et testez la lecture.',
      category: 'services',
      order: 30,
      prerequisites: [{ type: 'module', id: 'tts' }],
      assistance: {
        microcopy: 'Proposez un test de lecture lors de l’onboarding et ajustez vitesse/timbre selon le profil utilisateur.',
        examples: [
          {
            id: 'tts-onboarding-example-1',
            title: 'Astuce',
            description: 'Conservez une voix de secours (navigateur) si la voix personnalisée disparaît après une mise à jour.'
          }
        ]
      },
      steps: [
        {
          id: 'tts-module-ready',
          label: 'Vérifier que la synthèse vocale est activée',
          mode: 'auto',
          detail: ({ moduleName, runtime }) => {
            const name = moduleName || 'Synthèse vocale';
            if (!runtime?.enabled) return `${name} est désactivée dans la vue Organisation.`;
            if (runtime?.state === 'error') return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
            if (runtime?.state === 'loading') return `${name} se charge…`;
            if (runtime?.state === 'ready') return `${name} est prête.`;
            return `${name} est en attente d’activation.`;
          },
          check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready'
        },
        {
          id: 'tts-voices',
          label: 'Recenser les voix disponibles',
          mode: 'auto',
          detail: ({ snapshot }) => {
            const voices = snapshot?.tts?.availableVoices ?? [];
            if (!voices.length) return 'Aucune voix détectée pour le moment.';
            const selectedId = snapshot?.tts?.voice || '';
            const selected = voices.find((voice) => voice.voiceURI === selectedId);
            if (selected) {
              return `${voices.length} voix détectées · ${selected.name} (${selected.lang}) sélectionnée.`;
            }
            return `${voices.length} voix détectées. Sélectionnez la plus claire pour l’utilisateur.`;
          },
          check: ({ snapshot }) => (snapshot?.tts?.availableVoices ?? []).length > 0
        },
        {
          id: 'tts-default-voice',
          label: 'Définir la voix par défaut',
          mode: 'auto',
          detail: ({ snapshot }) => {
            const voices = snapshot?.tts?.availableVoices ?? [];
            const selectedId = snapshot?.tts?.voice;
            if (!voices.length) return 'En attente de voix détectées.';
            if (!selectedId) return 'Aucune voix sélectionnée : choisissez une option adaptée.';
            const selected = voices.find((voice) => voice.voiceURI === selectedId);
            if (selected) {
              return `Voix active : ${selected.name} (${selected.lang}).`;
            }
            return 'Voix personnalisée sélectionnée.';
          },
          check: ({ snapshot }) => {
            const voices = snapshot?.tts?.availableVoices ?? [];
            const selected = snapshot?.tts?.voice;
            if (!voices.length) return false;
            return !!selected;
          }
        },
        {
          id: 'tts-test',
          label: 'Tester la lecture d’un extrait',
          mode: 'manual',
          detail: 'Lancez la lecture d’un paragraphe représentatif et vérifiez le confort d’écoute.',
          toggleLabels: {
            complete: 'Test effectué',
            reset: 'Tester à nouveau'
          }
        }
      ]
    }
  ],
  runtime: {
    preload: 'idle'
  },
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
