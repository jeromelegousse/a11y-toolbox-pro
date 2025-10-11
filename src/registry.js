import { validateModuleManifest } from './module-manifest.js';

const _modules = new Map();
const _moduleManifests = new Map();

export function registerModuleManifest(manifest, moduleId) {
  const normalized = validateModuleManifest(manifest ?? { id: moduleId }, moduleId);
  const existing = _moduleManifests.get(normalized.id);
  if (existing) return existing;
  _moduleManifests.set(normalized.id, normalized);
  return normalized;
}
const PLACEHOLDER_ICON = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a2 2 0 11-2 2 2 2 0 012-2zm0 4a1 1 0 011 1v8a1 1 0 01-2 0V10a1 1 0 011-1z"/></svg>';
export const DEFAULT_BLOCK_ICON = PLACEHOLDER_ICON;

export function registerModule(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new Error('Module definition must be an object.');
  }
  const id = definition.id;
  if (!id || typeof id !== 'string') {
    throw new Error('Module definition requires an id');
  }
  if (_modules.has(id)) {
    throw new Error(`Module with id "${id}" is already registered.`);
  }

  const manifest = registerModuleManifest(definition.manifest ?? { id }, id);

  const normalized = {
    ...definition,
    id,
    manifest
  };
  Object.freeze(normalized);
  _modules.set(id, normalized);
  return normalized;
}

export function listModules() {
  return Array.from(_modules.values());
}

export function getModule(id) {
  return _modules.get(id);
}

export function listModuleManifests() {
  return Array.from(_moduleManifests.values());
}

export function getModuleManifest(id) {
  return _moduleManifests.get(id);
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
  const iconMarkup = block.icon || PLACEHOLDER_ICON;

  header.innerHTML = `
    <div class="a11ytb-module-title">
      <span class="a11ytb-module-icon" aria-hidden="true">${iconMarkup}</span>
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

  const disabledOverlay = document.createElement('div');
  disabledOverlay.className = 'a11ytb-module-overlay';
  disabledOverlay.innerHTML = `
    <div class="a11ytb-module-overlay-inner">
      <span class="a11ytb-module-overlay-icon" aria-hidden="true">${PLACEHOLDER_ICON}</span>
      <span>Module désactivé</span>
    </div>
  `;
  disabledOverlay.setAttribute('role', 'status');
  disabledOverlay.hidden = true;

  el.append(header, content, disabledOverlay);

  if (typeof block.wire === 'function') block.wire({ root: el, state });
  root.appendChild(el);
  return el;
}

if (!window.a11ytb) window.a11ytb = {};
if (!window.a11ytb.registry) {
  window.a11ytb.registry = {
    listModules,
    getModule,
    listBlocks,
    getBlock,
    listModuleManifests,
    getModuleManifest,
    registerModuleManifest
  };
}
