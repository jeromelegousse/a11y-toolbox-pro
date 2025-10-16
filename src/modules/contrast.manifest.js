export const manifest = {
  id: 'contrast',
  name: 'Contraste renforcé',
  version: '0.1.0',
  description: 'Applique un thème sombre à fort contraste pour améliorer la lisibilité.',
  category: 'vision',
  keywords: ['contrast', 'vision'],
  homepage: 'https://a11y-toolbox.test/modules/contrast',
  bugs: 'https://a11y-toolbox.test/support',
  license: 'MIT',
  authors: [
    { name: 'Équipe Accessibilité', email: 'accessibilite@a11ytoolbox.test' },
    { name: 'Mickaël Rousseau', email: 'm.rousseau@a11ytoolbox.test' },
  ],
  permissions: ['style-injection', 'activity-log'],
  compat: {
    browsers: ['chrome >= 88', 'edge >= 88', 'firefox >= 89', 'safari >= 14.1'],
    features: ['CSS.supports'],
  },
  guides: [
    {
      id: 'contrast-fastpass',
      title: 'Thème haute visibilité vérifié',
      description:
        'Activez le thème renforcé, contrôlez la lisibilité et validez la restitution clavier.',
      category: 'vision',
      order: 25,
      prerequisites: [{ type: 'module', id: 'contrast' }],
      assistance: {
        microcopy:
          'Couplez le thème avec un profil Vision basse pour offrir un raccourci à vos testeurs et product owners.',
      },
      steps: [
        {
          id: 'contrast-enabled-check',
          label: 'Activer le thème renforcé',
          mode: 'auto',
          detail: ({ snapshot }) =>
            snapshot?.contrast?.enabled
              ? 'Thème haute visibilité actif.'
              : 'Le thème renforcé est désactivé.',
          check: ({ snapshot }) => !!snapshot?.contrast?.enabled,
        },
        {
          id: 'contrast-ui-review',
          label: 'Revue visuelle rapide',
          mode: 'manual',
          detail:
            'Contrôlez la lisibilité des zones interactives et l’absence d’inversion gênante.',
          toggleLabels: {
            complete: 'Revue terminée',
            reset: 'À revoir',
          },
        },
        {
          id: 'contrast-keyboard',
          label: 'Tester le contraste au clavier',
          mode: 'manual',
          detail: 'Parcourez quelques composants au clavier pour vérifier le focus visible.',
          toggleLabels: {
            complete: 'Focus validé',
            reset: 'Re-tester',
          },
        },
      ],
    },
  ],
  runtime: {
    preload: 'visible',
  },
  defaults: {
    state: {
      contrast: { enabled: false },
    },
  },
  config: {
    group: 'Contraste renforcé',
    description: 'Force un thème sombre à fort contraste inspiré des solutions enterprise.',
    fields: [
      {
        type: 'toggle',
        path: 'contrast.enabled',
        label: 'Activer automatiquement',
        description: 'Force le thème sombre haute visibilité.',
        onChange: (value) => {
          window.a11ytb?.logActivity?.(
            `Contraste élevé ${value ? 'activé' : 'désactivé'} via Options`
          );
        },
      },
    ],
  },
};

export default manifest;
