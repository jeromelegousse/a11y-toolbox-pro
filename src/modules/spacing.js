import { registerModule } from '../registry.js';
import { manifest } from './spacing.manifest.js';

export { manifest };

const spacing = {
  id: manifest.id,
  manifest,
  init() {
    const style = document.createElement('style');
    style.dataset.module = manifest.id;
    style.textContent = `
      .a11ytb-spacing-ready body,
      .a11ytb-spacing-ready .content {
        line-height: var(--a11ytb-lh, 1.5);
        letter-spacing: var(--a11ytb-ls, 0);
      }
    `;
    document.head.appendChild(style);
  }
};

registerModule(spacing);
