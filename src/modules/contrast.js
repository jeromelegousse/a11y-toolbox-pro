import { registerModule } from '../registry.js';

export const manifest = {
  id: 'contrast',
  name: 'Contraste renforcé',
  version: '0.1.0',
  description: 'Applique un thème sombre à fort contraste pour améliorer la lisibilité.',
  category: 'vision',
  keywords: ['contrast', 'vision'],
  defaults: {
    state: {
      contrast: { enabled: false }
    }
  }
};

const contrast = {
  id: manifest.id,
  manifest,
  init() {
    // styles toggled by UI
  }
};

registerModule(contrast);
