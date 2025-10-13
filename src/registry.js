import { validateModuleManifest } from './module-manifest.js';
import { compareSemver } from './utils/semver.js';

const _modules = new Map();
const _moduleManifests = new Map();
const _moduleManifestHistory = new Map();

function ensureHistoryBucket(manifestId) {
  if (!_moduleManifestHistory.has(manifestId)) {
    _moduleManifestHistory.set(manifestId, []);
  }
  return _moduleManifestHistory.get(manifestId);
}

function serializeManifest(manifest) {
  try {
    return JSON.stringify(manifest, (key, value) => {
      if (typeof value === 'function') {
        return `[function:${value.name || 'anonymous'}]`;
      }
      return value;
    });
  } catch (error) {
    console.warn('a11ytb: impossible de sérialiser le manifest pour comparaison.', error);
    return '';
  }
}

function createHistoryEntry(manifest, { status, reason }) {
  const entry = {
    version: manifest.version,
    versionInfo: manifest.versionInfo,
    metadataQuality: manifest.metadataQuality,
    status,
    reason,
    timestamp: Date.now()
  };
  if (manifest.name) {
    entry.name = manifest.name;
  }
  if (manifest.description) {
    entry.description = manifest.description;
  }
  return Object.freeze(entry);
}

export function registerModuleManifest(manifest, moduleId) {
  const normalized = validateModuleManifest(manifest ?? { id: moduleId }, moduleId);
  const existing = _moduleManifests.get(normalized.id);
  if (!existing) {
    _moduleManifests.set(normalized.id, normalized);
    const bucket = ensureHistoryBucket(normalized.id);
    bucket.push(createHistoryEntry(normalized, { status: 'accepted', reason: 'initial' }));
    return normalized;
  }

  const comparison = compareSemver(normalized.version, existing.version);
  const bucket = ensureHistoryBucket(normalized.id);

  if (comparison < 0) {
    console.warn(
      `a11ytb: manifest "${normalized.id}" ignoré car version ${normalized.version} < ${existing.version}.`
    );
    bucket.push(createHistoryEntry(normalized, { status: 'rejected', reason: 'downgrade' }));
    return existing;
  }

  if (comparison === 0) {
    const existingSignature = serializeManifest(existing);
    const nextSignature = serializeManifest(normalized);
    if (existingSignature !== nextSignature) {
      console.warn(
        `a11ytb: manifest "${normalized.id}" mis à jour sans changement de version (${normalized.version}).`
      );
      _moduleManifests.set(normalized.id, normalized);
      bucket.push(createHistoryEntry(normalized, { status: 'accepted', reason: 'refresh' }));
      return normalized;
    }
    return existing;
  }

  _moduleManifests.set(normalized.id, normalized);
  bucket.push(createHistoryEntry(normalized, { status: 'accepted', reason: 'upgrade' }));
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

export function getModuleManifestHistory(id) {
  const history = _moduleManifestHistory.get(id);
  return history ? history.slice() : [];
}

export function listModuleManifestHistory() {
  return Array.from(_moduleManifestHistory.entries()).map(([id, entries]) => ({
    id,
    history: entries.slice()
  }));
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
    <div class="a11ytb-module-actions">
      <span class="a11ytb-module-priority" data-ref="priority-badge" hidden></span>
      <div class="a11ytb-module-controls" role="group" aria-label="Actions du module">
        <button type="button" class="a11ytb-icon-button" data-module-action="toggle-pin" aria-pressed="false" aria-label="Épingler ${block.title || 'le module'}">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 2l3 3-2.29 2.29 2 2L19 12l-3-1-2-2L6 17l-2-2 8-8-2-2 1-1h4z"/></svg>
        </button>
        <button type="button" class="a11ytb-icon-button" data-module-action="toggle-hide" aria-pressed="false" aria-label="Masquer ${block.title || 'le module'}">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 5c4.73 0 8.74 3.11 10 7-1.26 3.89-5.27 7-10 7s-8.74-3.11-10-7c1.26-3.89 5.27-7 10-7zm0 2c-3.05 0-6.17 2.09-7.27 5 1.1 2.91 4.22 5 7.27 5s6.17-2.09 7.27-5C18.17 9.09 15.05 7 12 7zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>
        </button>
      </div>
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
  if (window.a11ytb?.runtime?.registerBlockElement) {
    try {
      window.a11ytb.runtime.registerBlockElement(block.id, el);
    } catch (error) {
      console.error(`a11ytb: impossible d’enregistrer le bloc ${block.id} auprès du runtime.`, error);
    }
  }
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
    registerModuleManifest,
    getModuleManifestHistory,
    listModuleManifestHistory
  };
}
