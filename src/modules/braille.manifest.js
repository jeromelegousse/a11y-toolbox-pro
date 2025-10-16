export const manifest = {
  id: 'braille',
  name: 'Transcription braille',
  version: '0.1.0',
  description: 'Convertit un texte latin simplifié en caractères braille Unicode.',
  category: 'conversion',
  keywords: ['braille', 'transcription'],
  homepage: 'https://a11y-toolbox.test/modules/braille',
  bugs: 'https://a11y-toolbox.test/support',
  license: 'MIT',
  authors: [
    { name: 'Équipe Accessibilité', email: 'accessibilite@a11ytoolbox.test' },
    { name: 'Imène Fares', email: 'i.fares@a11ytoolbox.test' },
  ],
  permissions: ['dom-read', 'activity-log'],
  compat: {
    browsers: ['chrome >= 92', 'edge >= 92', 'firefox >= 91', 'safari >= 15'],
    features: ['document.getSelection'],
  },
  guides: [
    {
      id: 'braille-setup',
      title: 'Transcription braille prête',
      description: 'Activez le module et validez la génération d’un extrait braille.',
      category: 'conversion',
      order: 60,
      prerequisites: [{ type: 'module', id: 'braille' }],
      assistance: {
        microcopy:
          'Gardez un extrait récurrent (formulaire ou bouton) pour tester rapidement la transcription braille.',
      },
      steps: [
        {
          id: 'braille-ready',
          label: 'Vérifier l’activation de la transcription braille',
          mode: 'auto',
          detail: ({ moduleName, runtime }) => {
            const name = moduleName || 'Transcription braille';
            if (!runtime?.enabled) return `${name} est désactivée.`;
            if (runtime?.state === 'error')
              return runtime?.error
                ? `Erreur signalée : ${runtime.error}`
                : `${name} est en erreur.`;
            if (runtime?.state === 'loading') return `${name} se charge…`;
            if (runtime?.state === 'ready') return `${name} est prête.`;
            return `${name} est en attente d’activation.`;
          },
          check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready',
        },
        {
          id: 'braille-output',
          label: 'Générer un extrait braille',
          mode: 'manual',
          detail: ({ snapshot }) => {
            const output = snapshot?.braille?.output || '';
            if (!output)
              return 'Aucune transcription générée : testez avec un texte simple (ex. "Formulaire envoyé").';
            return `Dernière sortie : ${output.slice(0, 16)}${output.length > 16 ? '…' : ''}`;
          },
          toggleLabels: {
            complete: 'Transcription validée',
            reset: 'Re-tester',
          },
        },
      ],
    },
  ],
  runtime: {
    preload: 'pointer',
  },
  defaults: {
    state: {
      braille: {
        output: '',
        grade: 'integral',
        exportFormat: 'text',
        keepSpacing: true,
      },
    },
  },
  config: {
    group: 'Transcription braille',
    description: 'Définissez le niveau et le format utilisés pour la conversion des contenus.',
    fields: [
      {
        type: 'select',
        path: 'braille.grade',
        label: 'Niveau de transcription',
        options: [
          { value: 'integral', label: 'Intégral (grade 1)' },
          { value: 'contracted', label: 'Abrégé (grade 2)' },
        ],
        onChange: (value) => {
          const labels = { integral: 'Intégral (grade 1)', contracted: 'Abrégé (grade 2)' };
          const label = labels[value] || value;
          window.a11ytb?.logActivity?.(`Mode braille sélectionné : ${label}`);
        },
      },
      {
        type: 'toggle',
        path: 'braille.keepSpacing',
        label: 'Conserver les espaces',
        description: 'Préserve les séparateurs d’origine lors de la conversion.',
        onChange: (value) => {
          window.a11ytb?.logActivity?.(`Espaces d’origine ${value ? 'conservés' : 'compressés'}`);
        },
      },
      {
        type: 'select',
        path: 'braille.exportFormat',
        label: 'Format d’export',
        options: [
          { value: 'text', label: 'Texte brut' },
          { value: 'unicode', label: 'Unicode (points braille)' },
        ],
        onChange: (value) => {
          const labels = { text: 'Texte brut', unicode: 'Unicode (points braille)' };
          const label = labels[value] || value;
          window.a11ytb?.logActivity?.(`Format braille : ${label}`);
        },
      },
    ],
  },
};

export default manifest;
