export const manifest = {
  id: 'braille',
  name: 'Transcription braille',
  version: '0.1.0',
  description: 'Convertit un texte latin simplifié en caractères braille Unicode.',
  category: 'conversion',
  keywords: ['braille', 'transcription'],
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
