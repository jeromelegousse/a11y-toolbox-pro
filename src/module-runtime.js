import { getModule, listBlocks } from './registry.js';

export function setupModuleRuntime({ state, catalog }) {
  const loaders = new Map(catalog.map((entry) => [entry.id, entry.loader]));
  const moduleToBlocks = new Map();
  listBlocks().forEach((block) => {
    if (!block || !block.moduleId) return;
    if (!moduleToBlocks.has(block.moduleId)) {
      moduleToBlocks.set(block.moduleId, []);
    }
    moduleToBlocks.get(block.moduleId).push(block.id);
  });

  const initialized = new Set();
  const loading = new Map();

  function loadModule(moduleId) {
    if (initialized.has(moduleId)) {
      return Promise.resolve(getModule(moduleId));
    }
    if (loading.has(moduleId)) {
      return loading.get(moduleId);
    }
    const loader = loaders.get(moduleId);
    if (!loader) {
      return Promise.reject(new Error(`Module loader missing for "${moduleId}".`));
    }
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
              throw error;
            }
          }
          initialized.add(moduleId);
        }
        return mod;
      })
      .catch((error) => {
        console.error(`a11ytb: impossible de charger le module ${moduleId}.`, error);
        throw error;
      })
      .finally(() => {
        loading.delete(moduleId);
      });
    loading.set(moduleId, promise);
    return promise;
  }

  function isModuleEnabled(blockIds, disabledSet) {
    return blockIds.some((blockId) => !disabledSet.has(blockId));
  }

  let lastDisabled = new Set(state.get('ui.disabled') ?? []);
  moduleToBlocks.forEach((blockIds, moduleId) => {
    if (isModuleEnabled(blockIds, lastDisabled)) {
      loadModule(moduleId).catch(() => {});
    }
  });

  state.on((snapshot) => {
    const nextDisabled = new Set(snapshot?.ui?.disabled ?? []);
    moduleToBlocks.forEach((blockIds, moduleId) => {
      const wasEnabled = isModuleEnabled(blockIds, lastDisabled);
      const isEnabled = isModuleEnabled(blockIds, nextDisabled);
      if (isEnabled && !wasEnabled) {
        loadModule(moduleId).catch(() => {});
      }
    });
    lastDisabled = nextDisabled;
  });

  if (!window.a11ytb) window.a11ytb = {};
  if (!window.a11ytb.runtime) window.a11ytb.runtime = {};
  window.a11ytb.runtime.loadModule = loadModule;
  window.a11ytb.runtime.moduleStatus = (id) => ({
    loaded: initialized.has(id),
    blockIds: moduleToBlocks.get(id) ?? []
  });
  if (window.a11ytb.registry) {
    window.a11ytb.registry.loadModule = loadModule;
  }

  return {
    loadModule,
    isModuleLoaded: (id) => initialized.has(id)
  };
}
