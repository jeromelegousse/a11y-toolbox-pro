import { registerModule } from '../registry.js';
import { manifest } from './contrast.manifest.js';

export { manifest };

let styleElement = null;

function ensureStyle() {
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.dataset.module = manifest.id;
    styleElement.textContent = `
      .a11ytb-contrast body,
      .a11ytb-contrast .content,
      .a11ytb-contrast .site-header,
      .a11ytb-contrast .site-footer {
        background-color: #000 !important;
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
  }
  if (!styleElement.isConnected) {
    document.head.appendChild(styleElement);
  }
}

const contrast = {
  id: manifest.id,
  manifest,
  init() {
    ensureStyle();
  },
  mount() {
    ensureStyle();
  },
  unmount() {
    document.documentElement.classList.remove('a11ytb-contrast');
    if (styleElement?.isConnected) {
      styleElement.remove();
    }
  },
};

registerModule(contrast);
