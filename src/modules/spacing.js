import { registerModule } from '../registry.js';
import { manifest } from './spacing.manifest.js';

export { manifest };

let styleElement = null;

function ensureStyle() {
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.dataset.module = manifest.id;
    styleElement.textContent = `
      .a11ytb-spacing-ready body,
      .a11ytb-spacing-ready .content {
        line-height: var(--a11ytb-lh, 1.5);
        letter-spacing: var(--a11ytb-ls, 0);
      }
    `;
  }
  if (!styleElement.isConnected) {
    document.head.appendChild(styleElement);
  }
}

const spacing = {
  id: manifest.id,
  manifest,
  init() {
    ensureStyle();
  },
  mount() {
    ensureStyle();
    document.documentElement.classList.add('a11ytb-spacing-ready');
  },
  unmount() {
    document.documentElement.classList.remove('a11ytb-spacing-ready');
    document.documentElement.style.removeProperty('--a11ytb-lh');
    document.documentElement.style.removeProperty('--a11ytb-ls');
    if (styleElement?.isConnected) {
      styleElement.remove();
    }
  }
};

registerModule(spacing);
