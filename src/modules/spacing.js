import { registerModule } from '../registry.js';

const spacing = {
  id: 'spacing',
  init() {
    const style = document.createElement('style');
    style.textContent = `
      .a11ytb-spacing-ready body, .a11ytb-spacing-ready .content {
        line-height: var(--a11ytb-lh, 1.5);
        letter-spacing: var(--a11ytb-ls, 0);
      }
      .a11ytb-contrast body, .a11ytb-contrast .content, .a11ytb-contrast .site-header, .a11ytb-contrast .site-footer {
        background: #000 !important; color: #fff !important;
      }
      .a11ytb-contrast a { color: #0bf; }
    `;
    document.head.appendChild(style);
  }
};

registerModule(spacing);
