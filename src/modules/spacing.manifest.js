export const manifest = {
  id: 'spacing',
  name: 'Espacement du texte',
  version: '0.1.0',
  description: 'Injecte des variables CSS pour ajuster l’interlignage et l’espacement des lettres.',
  category: 'vision',
  keywords: ['espacement', 'typographie'],
  runtime: {
    preload: 'visible'
  },
  defaults: {
    state: {
      spacing: { lineHeight: 1.5, letterSpacing: 0 }
    }
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
        }
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
          window.a11ytb?.logActivity?.(`Espacement des lettres réglé à ${Math.round(value * 100)} %`);
        }
      }
    ]
  }
};

export default manifest;
