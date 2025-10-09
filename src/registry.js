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
  const el = document.createElement('div');
  el.className = 'a11ytb-module';
  el.dataset.blockId = block.id;
  el.innerHTML = block.render(state);
  if (typeof block.wire === 'function') block.wire({ root: el, state });
  root.appendChild(el);
  return el;
}
