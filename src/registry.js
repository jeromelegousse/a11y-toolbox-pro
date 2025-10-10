const _modules = new Map();

export function registerModule(def) {
  if (!def || !def.id) throw new Error('Module definition requires an id');
  _modules.set(def.id, def);
}

export function listModules() {
  return Array.from(_modules.values());
}

export function getModule(id) {
  return _modules.get(id);
}

const _blocks = new Map();
export function registerBlock(block) {
  if (!block || !block.id) throw new Error('Block requires an id');
  _blocks.set(block.id, block);
}
export function listBlocks() { return Array.from(_blocks.values()); }
export function getBlock(id) { return _blocks.get(id); }

export function renderBlock(block, state, root) {
  const el = document.createElement('article');
  el.className = 'a11ytb-module';
  el.dataset.blockId = block.id;
  if (block.category) el.dataset.category = block.category;
  if (block.title) el.dataset.title = block.title;
  const keywords = [block.title, ...(block.keywords || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (keywords) el.dataset.keywords = keywords;

  const header = document.createElement('header');
  header.className = 'a11ytb-module-header';
  header.innerHTML = `
    <div class="a11ytb-module-title">
      ${block.icon ? `<span class="a11ytb-module-icon" aria-hidden="true">${block.icon}</span>` : ''}
      <span class="a11ytb-module-label">${block.title || ''}</span>
    </div>
    <div class="a11ytb-module-controls" role="group" aria-label="Actions du module">
      <button type="button" class="a11ytb-icon-button" data-module-action="toggle-pin" aria-pressed="false" aria-label="Épingler ${block.title || 'le module'}">
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 2l3 3-2.29 2.29 2 2L19 12l-3-1-2-2L6 17l-2-2 8-8-2-2 1-1h4z"/></svg>
      </button>
      <button type="button" class="a11ytb-icon-button" data-module-action="toggle-hide" aria-pressed="false" aria-label="Masquer ${block.title || 'le module'}">
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 5c4.73 0 8.74 3.11 10 7-1.26 3.89-5.27 7-10 7s-8.74-3.11-10-7c1.26-3.89 5.27-7 10-7zm0 2c-3.05 0-6.17 2.09-7.27 5 1.1 2.91 4.22 5 7.27 5s6.17-2.09 7.27-5C18.17 9.09 15.05 7 12 7zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>
      </button>
    </div>
  `;

  const content = document.createElement('div');
  content.className = 'a11ytb-module-content';
  content.innerHTML = block.render(state);

  el.append(header, content);

  if (typeof block.wire === 'function') block.wire({ root: el, state });
  root.appendChild(el);
  return el;
}
