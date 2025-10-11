export const manifest = {
  id: 'stt',
  name: 'Reconnaissance vocale',
  version: '0.1.0',
  description: 'Transcrit la voix de l’utilisateur en texte grâce à l’API Web Speech.',
  category: 'interaction',
  keywords: ['stt', 'dictée', 'micro'],
  permissions: ['speechRecognition'],
  compat: {
    browsers: ['chrome >= 110', 'edge >= 110'],
    features: ['SpeechRecognition']
  },
  defaults: {
    state: {
      stt: { status: 'idle', transcript: '' }
    }
  }
};

export default manifest;
