export const manifest = {
  id: 'contrast',
  name: 'Contraste renforcé',
  version: '0.1.0',
  description: 'Applique un thème sombre à fort contraste pour améliorer la lisibilité.',
  category: 'vision',
  keywords: ['contrast', 'vision'],
  runtime: {
    preload: 'visible'
  },
  defaults: {
    state: {
      contrast: { enabled: false }
    }
  },
  config: {
    group: 'Contraste renforcé',
    fields: [
      {
        type: 'toggle',
        path: 'contrast.enabled',
        label: 'Activer automatiquement',
        description: 'Force le thème sombre haute visibilité.',
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Contraste élevé ${value ? 'activé' : 'désactivé'} via Options`);
        }
      }
    ]
  }
};

export default manifest;
