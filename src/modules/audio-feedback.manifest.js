export const manifest = {
  id: 'audio-feedback',
  name: 'Retours sonores',
  version: '0.1.0',
  description: 'Personnalise les retours sonores (earcons) utilisés par l’outil.',
  category: 'audio',
  keywords: ['audio', 'feedback', 'earcon'],
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
