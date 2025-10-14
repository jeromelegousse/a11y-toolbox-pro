export const manifest = {
  id: 'audio-feedback',
  name: 'Retours sonores',
  version: '0.1.0',
  description: 'Personnalise les retours sonores (earcons) utilisés par l’outil.',
  category: 'audio',
  keywords: ['audio', 'feedback', 'earcon'],
  homepage: 'https://a11y-toolbox.test/modules/audio-feedback',
  bugs: 'https://a11y-toolbox.test/support',
  license: 'MIT',
  authors: [
    { name: 'Équipe Accessibilité', email: 'accessibilite@a11ytoolbox.test' },
    { name: 'Louis Bernard', email: 'l.bernard@a11ytoolbox.test' }
  ],
  permissions: ['audioContext', 'activity-log'],
  compat: {
    features: ['AudioContext'],
    browsers: ['chrome >= 96', 'edge >= 96', 'firefox >= 96', 'safari >= 15.4']
  },
  guides: [
    {
      id: 'audio-feedback-setup',
      title: 'Retours sonores calibrés',
      description: 'Activez les retours audio, ajustez le volume global et vérifiez les signaux critiques.',
      category: 'audio',
      order: 35,
      prerequisites: [{ type: 'module', id: 'audio-feedback' }],
      assistance: {
        microcopy: 'Associez un jeu de sons distinctif à chaque profil pour accélérer l’onboarding des équipes support.',
        examples: [
          {
            id: 'audio-feedback-example-1',
            title: 'Astuce',
            description: 'Définissez un preset « vigilance » pour les profils de supervision et un preset « doux » pour l’accompagnement guidé.'
          }
        ]
      },
      steps: [
        {
          id: 'audio-feedback-ready',
          label: 'Vérifier l’activation du module audio',
          mode: 'auto',
          detail: ({ moduleName, runtime }) => {
            const name = moduleName || 'Retours sonores';
            if (!runtime?.enabled) return `${name} est désactivé.`;
            if (runtime?.state === 'error') return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
            if (runtime?.state === 'loading') return `${name} se charge…`;
            if (runtime?.state === 'ready') return `${name} est prêt.`;
            return `${name} est en attente d’activation.`;
          },
          check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready'
        },
        {
          id: 'audio-feedback-volume',
          label: 'Calibrer le volume global',
          mode: 'auto',
          detail: ({ snapshot }) => {
            const volume = Number(snapshot?.audio?.masterVolume ?? 0.9);
            if (Number.isNaN(volume)) return 'Volume global non défini.';
            return `Volume actuel : ${Math.round(volume * 100)} %.`;
          },
          check: ({ snapshot }) => {
            const volume = Number(snapshot?.audio?.masterVolume ?? 0.9);
            if (Number.isNaN(volume)) return false;
            return Math.abs(volume - 0.9) > 0.05;
          }
        },
        {
          id: 'audio-feedback-alerts',
          label: 'Tester les signaux critiques',
          mode: 'manual',
          detail: 'Déclenchez un earcon d’alerte et confirmez que le volume et le timbre conviennent aux utilisateurs finaux.',
          toggleLabels: {
            complete: 'Signal validé',
            reset: 'Re-tester'
          }
        }
      ]
    }
  ],
  runtime: {
    preload: 'idle'
  },
  defaults: {
    state: {
      audio: {
        masterVolume: 0.9,
        theme: 'classic',
        events: {
          confirm: true,
          alert: true,
          warning: true,
          info: true
        }
      }
    }
  },
  config: {
    group: 'Retours sonores',
    description: 'Réglez le thème, le volume global et les familles d’earcons utilisées pour la signalisation.',
    fields: [
      {
        type: 'select',
        path: 'audio.theme',
        label: 'Thème sonore',
        options: [
          { value: 'classic', label: 'Classique' },
          { value: 'soft', label: 'Doux' },
          { value: 'digital', label: 'Digital' }
        ],
        onChange: (value) => {
          const labels = { classic: 'Classique', soft: 'Doux', digital: 'Digital' };
          const label = labels[value] || 'Classique';
          window.a11ytb?.logActivity?.(`Thème audio sélectionné : ${label}`);
        }
      },
      {
        type: 'range',
        path: 'audio.masterVolume',
        label: 'Volume global',
        min: 0,
        max: 1,
        step: 0.05,
        format: (value) => `${Math.round(value * 100)} %`,
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Volume global des retours audio réglé à ${Math.round(value * 100)} %`);
        }
      },
      {
        type: 'toggle',
        path: 'audio.events.confirm',
        label: 'Confirmations',
        description: 'Joue un earcon positif (confirmations, bascules).'
      },
      {
        type: 'toggle',
        path: 'audio.events.info',
        label: 'Informations',
        description: 'Active les signaux discrets pour les notifications neutres.'
      },
      {
        type: 'toggle',
        path: 'audio.events.warning',
        label: 'Avertissements',
        description: 'Active les signaux de prudence (pré-alarme).'
      },
      {
        type: 'toggle',
        path: 'audio.events.alert',
        label: 'Alertes',
        description: 'Active les signaux critiques (erreurs, blocages).'
      }
    ]
  }
};

export default manifest;
