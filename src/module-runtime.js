import { getModule, listBlocks } from './registry.js';

export function setupModuleRuntime({ state, catalog, collections = [] }) {
  const loaders = new Map(catalog.map((entry) => [entry.id, entry.loader]));
  const moduleToBlocks = new Map();
  const moduleToCollections = new Map();

  collections.forEach((collection) => {
    if (!collection || typeof collection !== 'object') return;
    const { id, modules } = collection;
    if (!id) return;
    const members = Array.isArray(modules) ? modules.filter(Boolean) : [];
    members.forEach((moduleId) => {
      if (!moduleToCollections.has(moduleId)) {
        moduleToCollections.set(moduleId, new Set());
      }
      moduleToCollections.get(moduleId).add(id);
    });
  });
  listBlocks().forEach((block) => {
    if (!block || !block.moduleId) return;
    if (!moduleToBlocks.has(block.moduleId)) {
      moduleToBlocks.set(block.moduleId, []);
    }
    moduleToBlocks.get(block.moduleId).push(block.id);
  });

  function getCollectionsForModule(moduleId) {
    const memberships = moduleToCollections.get(moduleId);
    if (!memberships) return [];
    return Array.from(memberships);
  }

  function isModuleCollectionEnabled(moduleId, disabledCollections) {
    const memberships = moduleToCollections.get(moduleId);
    if (!memberships || memberships.size === 0) return true;
    for (const collectionId of memberships) {
      if (disabledCollections.has(collectionId)) {
        return false;
      }
    }
    return true;
  }

  const initialized = new Set();
  const loading = new Map();

  function updateModuleRuntime(moduleId, patch) {
    const current = state.get(`runtime.modules.${moduleId}`) || {};
    state.set(`runtime.modules.${moduleId}`, { ...current, ...patch });
  }

  function loadModule(moduleId) {
    if (initialized.has(moduleId)) {
      updateModuleRuntime(moduleId, { state: 'ready', error: null });
      return Promise.resolve(getModule(moduleId));
    }
    if (loading.has(moduleId)) {
      return loading.get(moduleId);
    }
    const loader = loaders.get(moduleId);
    if (!loader) {
      return Promise.reject(new Error(`Module loader missing for "${moduleId}".`));
    }
    updateModuleRuntime(moduleId, { state: 'loading', error: null });
    const promise = loader()
      .then(() => {
        const mod = getModule(moduleId);
        if (!mod) {
          throw new Error(`Module "${moduleId}" did not register itself.`);
        }
        if (!initialized.has(moduleId)) {
          if (typeof mod.init === 'function') {
            try {
              mod.init({ state });
            } catch (error) {
              console.error(`a11ytb: échec de l’initialisation du module ${moduleId}.`, error);
              updateModuleRuntime(moduleId, { state: 'error', error: error?.message || 'Échec d\'initialisation' });
              throw error;
            }
          }
          initialized.add(moduleId);
        }
        updateModuleRuntime(moduleId, { state: 'ready', error: null });
        return mod;
      })
      .catch((error) => {
        console.error(`a11ytb: impossible de charger le module ${moduleId}.`, error);
        updateModuleRuntime(moduleId, { state: 'error', error: error?.message || 'Échec de chargement' });
        throw error;
      })
      .finally(() => {
        loading.delete(moduleId);
      });
    loading.set(moduleId, promise);
    return promise;
  }

  function isModuleEnabled(blockIds, disabledSet, disabledCollections, moduleId) {
    const enabledByBlocks = blockIds.some((blockId) => !disabledSet.has(blockId));
    if (!enabledByBlocks) return false;
    return isModuleCollectionEnabled(moduleId, disabledCollections);
  }

  let lastDisabled = new Set(state.get('ui.disabled') ?? []);
  const initialCollections = state.get('ui.collections.disabled');
  let lastDisabledCollections = new Set(Array.isArray(initialCollections) ? initialCollections : []);

  moduleToBlocks.forEach((blockIds, moduleId) => {
    const enabled = isModuleEnabled(blockIds, lastDisabled, lastDisabledCollections, moduleId);
    updateModuleRuntime(moduleId, { blockIds, collections: getCollectionsForModule(moduleId), enabled });
    if (enabled) {
      loadModule(moduleId).catch(() => {});
    }
  });

  const modulesWithoutBlocks = catalog
    .map((entry) => entry.id)
    .filter((id) => !moduleToBlocks.has(id));

  modulesWithoutBlocks.forEach((moduleId) => {
    const enabled = isModuleCollectionEnabled(moduleId, lastDisabledCollections);
    updateModuleRuntime(moduleId, { blockIds: [], collections: getCollectionsForModule(moduleId), enabled });
    if (enabled) {
      loadModule(moduleId).catch(() => {});
    }
  });

  state.on((snapshot) => {
    const nextDisabled = new Set(snapshot?.ui?.disabled ?? []);
    const nextCollectionList = snapshot?.ui?.collections?.disabled;
    const nextDisabledCollections = new Set(Array.isArray(nextCollectionList) ? nextCollectionList : []);
    moduleToBlocks.forEach((blockIds, moduleId) => {
      const wasEnabled = isModuleEnabled(blockIds, lastDisabled, lastDisabledCollections, moduleId);
      const isEnabled = isModuleEnabled(blockIds, nextDisabled, nextDisabledCollections, moduleId);
      if (wasEnabled !== isEnabled) {
        updateModuleRuntime(moduleId, { enabled: isEnabled });
      }
      if (isEnabled && !wasEnabled) {
        loadModule(moduleId).catch(() => {});
      }
    });
    modulesWithoutBlocks.forEach((moduleId) => {
      const wasEnabled = isModuleCollectionEnabled(moduleId, lastDisabledCollections);
      const isEnabled = isModuleCollectionEnabled(moduleId, nextDisabledCollections);
      if (wasEnabled !== isEnabled) {
        updateModuleRuntime(moduleId, { enabled: isEnabled });
      }
      if (isEnabled && !loading.has(moduleId) && !initialized.has(moduleId)) {
        loadModule(moduleId).catch(() => {});
      }
    });
    lastDisabled = nextDisabled;
    lastDisabledCollections = nextDisabledCollections;
  });

  if (!window.a11ytb) window.a11ytb = {};
  if (!window.a11ytb.runtime) window.a11ytb.runtime = {};
  window.a11ytb.runtime.loadModule = loadModule;
  window.a11ytb.runtime.moduleStatus = (id) => ({
    loaded: initialized.has(id),
    blockIds: moduleToBlocks.get(id) ?? [],
    ...(state.get(`runtime.modules.${id}`) || {})
  });
  if (window.a11ytb.registry) {
    window.a11ytb.registry.loadModule = loadModule;
  }

  return {
    loadModule,
    isModuleLoaded: (id) => initialized.has(id)
  };
}
