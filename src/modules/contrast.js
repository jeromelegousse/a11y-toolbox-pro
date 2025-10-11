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

const contrast = {
  id: manifest.id,
  manifest,
  init() {
    const style = document.createElement('style');
    style.dataset.module = manifest.id;
    style.textContent = `
      .a11ytb-contrast body,
      .a11ytb-contrast .content,
      .a11ytb-contrast .site-header,
      .a11ytb-contrast .site-footer {
        background: #000 !important;
        color: #fff !important;
      }
      .a11ytb-contrast .a11ytb-panel,
      .a11ytb-contrast .a11ytb-fab {
        background-color: #0b0b0b !important;
        color: #fff !important;
      }
      .a11ytb-contrast a,
      .a11ytb-contrast .a11ytb-link {
        color: #4cc3ff !important;
      }
      .a11ytb-contrast a:hover,
      .a11ytb-contrast a:focus-visible,
      .a11ytb-contrast .a11ytb-button:focus-visible,
      .a11ytb-contrast .a11ytb-icon-button:focus-visible {
        outline: 3px solid #ffe066 !important;
        outline-offset: 2px;
      }
      .a11ytb-contrast button,
      .a11ytb-contrast input,
      .a11ytb-contrast select,
      .a11ytb-contrast textarea {
        background-color: #111 !important;
        color: #fff !important;
        border-color: #4cc3ff !important;
      }
      .a11ytb-contrast .a11ytb-button,
      .a11ytb-contrast .a11ytb-icon-button {
        border-color: #4cc3ff !important;
      }
      .a11ytb-contrast .a11ytb-chip,
      .a11ytb-contrast .a11ytb-module,
      .a11ytb-contrast .a11ytb-card {
        background-color: #050505 !important;
        border-color: #1f1f1f !important;
        color: #fff !important;
      }
      .a11ytb-contrast .a11ytb-chip[aria-pressed="true"],
      .a11ytb-contrast .a11ytb-chip.is-active {
        background-color: #4cc3ff !important;
        color: #000 !important;
      }
    `;
    document.head.appendChild(style);
  }
};

registerModule(contrast);
