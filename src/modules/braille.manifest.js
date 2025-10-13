export const manifest = {
  id: 'braille',
  name: 'Transcription braille',
  version: '0.1.0',
  description: 'Convertit un texte latin simplifié en caractères braille Unicode.',
  category: 'conversion',
  keywords: ['braille', 'transcription'],
  guides: [
    {
      id: 'braille-setup',
      title: 'Transcription braille prête',
      description: 'Activez le module et validez la génération d’un extrait braille.',
      category: 'conversion',
      order: 60,
      prerequisites: [{ type: 'module', id: 'braille' }],
      assistance: {
        microcopy: 'Gardez un extrait récurrent (formulaire ou bouton) pour tester rapidement la transcription braille.'
      },
      steps: [
        {
          id: 'braille-ready',
          label: 'Vérifier l’activation de la transcription braille',
          mode: 'auto',
          detail: ({ moduleName, runtime }) => {
            const name = moduleName || 'Transcription braille';
            if (!runtime?.enabled) return `${name} est désactivée.`;
            if (runtime?.state === 'error') return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
            if (runtime?.state === 'loading') return `${name} se charge…`;
            if (runtime?.state === 'ready') return `${name} est prête.`;
            return `${name} est en attente d’activation.`;
          },
          check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready'
        },
        {
          id: 'braille-output',
          label: 'Générer un extrait braille',
          mode: 'manual',
          detail: ({ snapshot }) => {
            const output = snapshot?.braille?.output || '';
            if (!output) return 'Aucune transcription générée : testez avec un texte simple (ex. "Formulaire envoyé").';
            return `Dernière sortie : ${output.slice(0, 16)}${output.length > 16 ? '…' : ''}`;
          },
          toggleLabels: {
            complete: 'Transcription validée',
            reset: 'Re-tester'
          }
        }
      ]
    }
  ],
  runtime: {
    preload: 'pointer'
  },
  defaults: {
    state: {
      braille: { output: '' }
    }
  }
};

export default manifest;
