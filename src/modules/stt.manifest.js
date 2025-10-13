export const manifest = {
  id: 'stt',
  name: 'Reconnaissance vocale',
  version: '0.1.0',
  description: 'Transcrit la voix de l’utilisateur en texte grâce à l’API Web Speech.',
  category: 'interaction',
  keywords: ['stt', 'dictée', 'micro'],
  homepage: 'https://a11y-toolbox.test/modules/stt',
  bugs: 'https://a11y-toolbox.test/support',
  license: 'MIT',
  authors: [
    { name: 'Équipe Accessibilité', email: 'accessibilite@a11ytoolbox.test' },
    { name: 'Julien Meyer', email: 'j.meyer@a11ytoolbox.test' }
  ],
  guides: [
    {
      id: 'stt-onboarding',
      title: 'Configurer la dictée vocale',
      description: 'Activez la reconnaissance vocale, vérifiez la compatibilité et réalisez un test de dictée.',
      category: 'interaction',
      order: 50,
      prerequisites: [{ type: 'module', id: 'stt' }],
      assistance: {
        microcopy: 'Informez l’utilisateur de la collecte audio et invitez-le à autoriser le micro avant la première dictée.'
      },
      steps: [
        {
          id: 'stt-module-ready',
          label: 'Vérifier que la dictée est activée',
          mode: 'auto',
          detail: ({ moduleName, runtime }) => {
            const name = moduleName || 'Reconnaissance vocale';
            if (!runtime?.enabled) return `${name} est désactivée.`;
            if (runtime?.state === 'error') return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
            if (runtime?.state === 'loading') return `${name} se charge…`;
            if (runtime?.state === 'ready') return `${name} est prête.`;
            return `${name} est en attente d’activation.`;
          },
          check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready'
        },
        {
          id: 'stt-compatibility',
          label: 'Contrôler la compatibilité navigateur',
          mode: 'auto',
          detail: ({ runtime }) => {
            const compat = runtime?.metrics?.compat;
            if (!compat) return 'Compatibilité non évaluée.';
            if (compat.status === 'partial') {
              const missing = compat.missing?.features?.[0] || 'Fonctionnalité manquante';
              return `Compatibilité partielle (${missing}).`;
            }
            if (compat.status === 'full') return 'Compatibilité confirmée.';
            if (compat.status === 'unknown') return 'Compatibilité à vérifier manuellement.';
            return 'Compatibilité non déterminée.';
          },
          check: ({ runtime }) => {
            const compat = runtime?.metrics?.compat;
            if (!compat) return false;
            return compat.status === 'full' || compat.status === 'unknown';
          }
        },
        {
          id: 'stt-test',
          label: 'Effectuer un test de dictée',
          mode: 'manual',
          detail: ({ snapshot }) => {
            const transcript = snapshot?.stt?.transcript || '';
            if (!transcript) return 'Aucun texte dicté pour le moment. Lancez une courte phrase test.';
            return `Dernière dictée : « ${transcript.slice(0, 60)}${transcript.length > 60 ? '…' : ''} ».`;
          },
          toggleLabels: {
            complete: 'Dictée validée',
            reset: 'Retester'
          }
        }
      ]
    }
  ],
  runtime: {
    preload: 'pointer'
  },
  permissions: ['speechRecognition'],
  compat: {
    browsers: ['chrome >= 110', 'edge >= 110'],
    features: ['SpeechRecognition']
  },
  defaults: {
    state: {
      stt: {
        status: 'idle',
        transcript: '',
        language: 'auto',
        autoPunctuation: true
      }
    }
  },
  config: {
    group: 'Reconnaissance vocale',
    description: 'Affinez les paramètres de dictée pour coller aux besoins des utilisateurs.',
    fields: [
      {
        type: 'select',
        path: 'stt.language',
        label: 'Langue privilégiée',
        description: 'Force une langue spécifique si le document ne renseigne pas `lang`.',
        options: [
          { value: 'auto', label: 'Détection automatique' },
          { value: 'fr-FR', label: 'Français (France)' },
          { value: 'fr-CA', label: 'Français (Canada)' },
          { value: 'en-US', label: 'English (US)' }
        ],
        onChange: (value) => {
          const labels = {
            auto: 'Détection automatique',
            'fr-FR': 'Français (France)',
            'fr-CA': 'Français (Canada)',
            'en-US': 'Anglais (États-Unis)'
          };
          const label = labels[value] || value;
          window.a11ytb?.logActivity?.(`Langue STT sélectionnée : ${label}`);
        }
      },
      {
        type: 'toggle',
        path: 'stt.autoPunctuation',
        label: 'Ponctuation automatique',
        description: 'Ajoute automatiquement des points et des virgules dans les transcriptions.',
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Ponctuation automatique ${value ? 'activée' : 'désactivée'}`);
        }
      }
    ]
  }
};

export default manifest;
