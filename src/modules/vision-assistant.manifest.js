export const manifest = {
  id: 'vision-assistant',
  name: 'Assistant visuel IA',
  version: '0.1.0',
  description:
    "Analyse des images et synthèse des éléments clés pour documenter l'accessibilité visuelle.",
  category: 'vision',
  keywords: ['vision', 'assistant', 'image', 'ia'],
  homepage: 'https://a11y-toolbox.test/modules/vision-assistant',
  bugs: 'https://a11y-toolbox.test/support',
  license: 'MIT',
  authors: [
    { name: 'Équipe Accessibilité', email: 'accessibilite@a11ytoolbox.test' },
    { name: 'Camille Durand', email: 'c.durand@a11ytoolbox.test' },
  ],
  permissions: ['network', 'activity-log'],
  compat: {
    browsers: ['chrome >= 100', 'edge >= 100', 'firefox >= 102', 'safari >= 15.4'],
  },
  runtime: {
    preload: 'idle',
  },
  defaults: {
    state: {
      visionAssistant: {
        prompt:
          "Décris le visuel en soulignant la hiérarchie, les textes affichés et tout élément important pour un rapport d'accessibilité.",
        lastResponse: '',
        status: 'idle',
        engine: 'llava',
        error: null,
        lastUrl: '',
      },
    },
  },
  config: {
    group: 'Assistant visuel IA',
    description:
      "Choisissez le moteur vision-language utilisé par défaut lorsqu'une analyse est déclenchée depuis la boîte à outils.",
    fields: [
      {
        type: 'select',
        path: 'visionAssistant.engine',
        label: 'Moteur IA',
        description:
          'Sélectionnez le moteur utilisé pour analyser les images envoyées à WordPress.',
        emptyLabel: 'Défini côté serveur',
        options: [
          { value: 'llava', label: 'LLaVA local (serveur HTTP)' },
          { value: 'openai-gpt4o', label: 'OpenAI GPT-4o' },
          { value: 'google-gemini', label: 'Google Gemini Pro Vision' },
          { value: 'moondream', label: 'Moondream (CPU local)' },
        ],
        onChange: (value) => {
          const label = value || 'défaut serveur';
          window.a11ytb?.logActivity?.(`Moteur assistant visuel réglé sur ${label}`, {
            module: 'vision-assistant',
            tone: 'info',
            tags: ['vision', 'assistant', 'engine'],
          });
        },
      },
    ],
  },
};

export default manifest;
