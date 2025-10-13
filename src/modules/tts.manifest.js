export const manifest = {
  id: 'tts',
  name: 'Synthèse vocale',
  version: '0.1.0',
  description: 'Lit le contenu sélectionné ou la page complète via l’API SpeechSynthesis.',
  category: 'lecture',
  keywords: ['tts', 'lecture', 'audio', 'speech'],
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
        preferredLang: '',
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
        path: 'tts.preferredLang',
        label: 'Langue préférée',
        description: 'Sélectionnez la langue à privilégier pour la voix de lecture.',
        emptyLabel: 'Détection automatique',
        getOptions: (state) => {
          const voices = state.tts?.availableVoices ?? [];
          const codes = [];
          const seen = new Set();
          const register = (code) => {
            const normalized = (code || '').toLowerCase();
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            codes.push(code);
          };
          voices.forEach((voice) => {
            if (!voice?.lang) return;
            register(voice.lang);
            const prefix = voice.lang.split('-')[0];
            if (prefix && prefix !== voice.lang) register(prefix);
          });
          const docLang = (document.documentElement.lang || '').toLowerCase();
          const docPrefix = docLang.split('-')[0];
          register(docLang);
          if (docPrefix && docPrefix !== docLang) register(docPrefix);
          const baseLocale = document.documentElement.lang || navigator.language || 'fr';
          let displayNames;
          if (typeof Intl?.DisplayNames === 'function') {
            try {
              displayNames = new Intl.DisplayNames([baseLocale], { type: 'language' });
            } catch (error) {
              displayNames = null;
            }
          }
          return codes
            .map((code) => {
              if (!code) {
                return { value: '', label: 'Détection automatique' };
              }
              const normalized = code.toLowerCase();
              let label = code;
              if (displayNames) {
                try {
                  const name = displayNames.of(normalized);
                  if (name) label = `${name} — ${code}`;
                } catch (error) {
                  label = code;
                }
              }
              return { value: code, label };
            })
            .sort((a, b) => a.label.localeCompare(b.label, baseLocale));
        },
        onChange: (value, { state }) => {
          const lang = value ? value : 'détection automatique';
          window.a11ytb?.logActivity?.(`Langue préférée TTS réglée sur ${lang}`, {
            tone: 'info',
            tags: ['tts', 'preferences']
          });
          if (!value) return;
          const voices = state.tts?.availableVoices ?? [];
          const normalized = value.toLowerCase();
          const match = voices.find((voice) => voice.lang?.toLowerCase().startsWith(normalized));
          if (match) {
            window.a11ytb?.logActivity?.(`Voix alignée sur ${match.name} (${match.lang})`, {
              tone: 'confirm',
              tags: ['tts', 'preferences']
            });
          }
        }
      },
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
