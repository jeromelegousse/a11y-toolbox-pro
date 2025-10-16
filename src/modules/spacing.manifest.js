export const manifest = {
  id: 'spacing',
  name: 'Espacement du texte',
  version: '0.1.0',
  description: 'Injecte des variables CSS pour ajuster l’interlignage et l’espacement des lettres.',
  category: 'vision',
  keywords: ['espacement', 'typographie'],
  homepage: 'https://a11y-toolbox.test/modules/spacing',
  bugs: 'https://a11y-toolbox.test/support',
  license: 'MIT',
  authors: [
    { name: 'Équipe Accessibilité', email: 'accessibilite@a11ytoolbox.test' },
    { name: 'Laura Pineau', email: 'l.pineau@a11ytoolbox.test' },
  ],
  permissions: ['style-injection', 'activity-log'],
  compat: {
    browsers: ['chrome >= 88', 'edge >= 88', 'firefox >= 90', 'safari >= 15'],
    features: ['CSS.supports'],
  },
  guides: [
    {
      id: 'vision-personalization',
      title: 'Personnalisation vision & confort de lecture',
      description:
        'Combinez contraste renforcé, espacements personnalisés et vitesse vocale adaptée.',
      category: 'vision',
      order: 40,
      prerequisites: [
        { type: 'module', id: 'contrast' },
        { type: 'module', id: 'spacing' },
        { type: 'module', id: 'tts', optional: true, label: 'Synthèse vocale (optionnel)' },
      ],
      assistance: {
        microcopy:
          'Ajustez progressivement les paramètres et sauvegardez un profil dédié pour le reproduire facilement.',
        examples: [
          {
            id: 'vision-personalization-example-1',
            title: 'Exemple',
            description:
              'Profil Vision basse : interlignage 1,9 · espacement 12 % · vitesse vocale 0,9×.',
          },
        ],
      },
      steps: [
        {
          id: 'contrast-enabled',
          label: 'Activer le thème à fort contraste',
          mode: 'auto',
          detail: ({ snapshot }) =>
            snapshot?.contrast?.enabled
              ? 'Thème haute visibilité actif.'
              : 'Le thème renforcé est désactivé.',
          check: ({ snapshot }) => !!snapshot?.contrast?.enabled,
        },
        {
          id: 'spacing-adjustment',
          label: 'Adapter les espacements du texte',
          mode: 'auto',
          detail: ({ snapshot }) => {
            const lineHeight = Number(snapshot?.spacing?.lineHeight ?? 1.5);
            const letterSpacing = Number(snapshot?.spacing?.letterSpacing ?? 0);
            if (Number.isNaN(lineHeight) || Number.isNaN(letterSpacing))
              return 'Valeurs d’espacement non définies.';
            if (Math.abs(lineHeight - 1.5) < 0.05 && Math.abs(letterSpacing - 0) < 0.01) {
              return 'Espacements par défaut encore appliqués.';
            }
            return `Interlignage ${lineHeight.toFixed(1)} · Espacement ${Math.round(letterSpacing * 100)} %.`;
          },
          check: ({ snapshot }) => {
            const lineHeight = Number(snapshot?.spacing?.lineHeight ?? 1.5);
            const letterSpacing = Number(snapshot?.spacing?.letterSpacing ?? 0);
            if (Number.isNaN(lineHeight) || Number.isNaN(letterSpacing)) return false;
            return Math.abs(lineHeight - 1.5) >= 0.05 || Math.abs(letterSpacing - 0) >= 0.01;
          },
        },
        {
          id: 'tts-adjustment',
          label: 'Ajuster la vitesse de lecture vocale',
          mode: 'auto',
          when: ({ getRuntime }) => !!getRuntime('tts')?.enabled,
          detail: ({ snapshot }) => {
            if (!snapshot?.tts) return 'Synthèse vocale non configurée.';
            const rate = Number(snapshot.tts.rate ?? 1);
            if (Number.isNaN(rate)) return 'Vitesse vocale inconnue.';
            if (Math.abs(rate - 1) < 0.05) return 'Vitesse par défaut (1,0×).';
            return `Vitesse actuelle : ${rate.toFixed(1)}×.`;
          },
          check: ({ snapshot }) => {
            if (!snapshot?.tts) return true;
            const rate = Number(snapshot.tts.rate ?? 1);
            if (Number.isNaN(rate)) return false;
            return Math.abs(rate - 1) >= 0.05;
          },
        },
        {
          id: 'vision-profile-save',
          label: 'Sauvegarder un profil personnalisé',
          mode: 'manual',
          detail: 'Enregistrez ou exportez un profil dédié pour partager ces réglages.',
          toggleLabels: {
            complete: 'Profil sauvegardé',
            reset: 'À revoir',
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
      spacing: { lineHeight: 1.5, letterSpacing: 0 },
    },
  },
  config: {
    group: 'Espacements typographiques',
    description: 'Affinez les espacements pour soulager la lecture (dyslexie, vision basse…).',
    fields: [
      {
        type: 'range',
        path: 'spacing.lineHeight',
        label: 'Interlignage',
        min: 1,
        max: 2.4,
        step: 0.1,
        format: (value) => `${value.toFixed(1)}`,
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Interlignage réglé à ${value.toFixed(1)}`);
        },
      },
      {
        type: 'range',
        path: 'spacing.letterSpacing',
        label: 'Espacement des lettres',
        min: 0,
        max: 0.2,
        step: 0.01,
        format: (value) => `${Math.round(value * 100)} %`,
        onChange: (value) => {
          window.a11ytb?.logActivity?.(
            `Espacement des lettres réglé à ${Math.round(value * 100)} %`
          );
        },
      },
    ],
  },
};

export default manifest;
