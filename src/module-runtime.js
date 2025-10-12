import { getModule, listBlocks } from './registry.js';

export function setupModuleRuntime({ state, catalog, collections = [] }) {
  const loaders = new Map(catalog.map((entry) => [entry.id, entry.loader]));
  const manifests = new Map(catalog.map((entry) => [entry.id, entry.manifest]));
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
  const metricsCache = new Map();

  function buildDependencyMetadata(moduleId) {
    const manifest = manifests.get(moduleId);
    if (!manifest) return [];
    const moduleName = manifest.name || moduleId;
    const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
    if (!dependencies.length) return [];

    return dependencies.map((dep) => {
      const depId = dep.id;
      const requiredVersion = typeof dep.version === 'string' && dep.version.trim() ? dep.version.trim() : null;
      const targetManifest = manifests.get(depId);
      const dependencyName = targetManifest?.name || depId;
      const currentVersion = targetManifest?.version || null;
      let status = 'missing';
      if (targetManifest) {
        status = requiredVersion && currentVersion
          ? (compareSemver(currentVersion, requiredVersion) >= 0 ? 'ok' : 'incompatible')
          : 'ok';
      }

      let message = '';
      if (status === 'missing') {
        message = 'Module requis introuvable.';
      } else if (status === 'incompatible') {
        const detected = currentVersion || 'inconnue';
        message = `Version détectée ${detected} (minimum ${requiredVersion}).`;
      } else if (requiredVersion && currentVersion) {
        message = `Version détectée ${currentVersion} (minimum ${requiredVersion}).`;
      } else {
        message = 'Module disponible.';
      }

      let aria = '';
      if (status === 'missing') {
        aria = `Dépendance ${dependencyName} manquante pour ${moduleName}.`;
      } else if (status === 'incompatible') {
        const detected = currentVersion || 'inconnue';
        aria = `Dépendance ${dependencyName} incompatible pour ${moduleName} : version ${detected}, minimum ${requiredVersion}.`;
      } else {
        aria = `Dépendance ${dependencyName} disponible pour ${moduleName}.`;
      }

      return {
        id: depId,
        label: dependencyName,
        status,
        statusLabel: DEPENDENCY_STATUS_LABELS[status] || status,
        requiredVersion,
        currentVersion,
        message,
        aria
      };
    });
  }

  function logVersionChange(moduleId, previousVersion, nextVersion, moduleName) {
    if (!previousVersion || previousVersion === nextVersion) return;
    window.a11ytb?.logActivity?.(
      `Version du module ${moduleName} mise à jour : ${previousVersion} → ${nextVersion}`,
      {
        tone: 'info',
        module: moduleId,
        tags: ['modules', 'versions']
      }
    );
  }

  function logDependencyChanges(moduleId, moduleName, previous = [], next = []) {
    const prevMap = new Map(previous.map((entry) => [entry.id, entry]));
    next.forEach((entry) => {
      const prev = prevMap.get(entry.id);
      const prevStatus = prev?.status ?? null;
      if (entry.status === prevStatus) return;
      if (entry.status === 'ok') {
        if (prevStatus && prevStatus !== 'ok') {
          window.a11ytb?.logActivity?.(
            `Conflit résolu pour ${moduleName} : ${entry.label}`,
            {
              tone: 'confirm',
              module: moduleId,
              tags: ['modules', 'dependencies', `dependency:${entry.id}`]
            }
          );
        }
        return;
      }
      const tone = DEPENDENCY_STATUS_TONE[entry.status] || 'alert';
      window.a11ytb?.logActivity?.(entry.aria, {
        tone,
        module: moduleId,
        tags: ['modules', 'dependencies', `dependency:${entry.id}`]
      });
    });
  }

  function applyModuleMetadata(moduleId) {
    const manifest = manifests.get(moduleId);
    if (!manifest) return;
    const moduleName = manifest.name || moduleId;
    const dependencies = buildDependencyMetadata(moduleId);
    const manifestVersion = manifest.version || '0.0.0';
    const previous = state.get(`runtime.modules.${moduleId}`) || {};
    updateModuleRuntime(moduleId, {
      manifestVersion,
      manifestName: moduleName,
      dependencies
    });
    logVersionChange(moduleId, previous.manifestVersion, manifestVersion, moduleName);
    const prevDependencies = Array.isArray(previous.dependencies) ? previous.dependencies : [];
    logDependencyChanges(moduleId, moduleName, prevDependencies, dependencies);
  }

  function updateModuleRuntime(moduleId, patch) {
    const current = state.get(`runtime.modules.${moduleId}`) || {};
    const next = { ...current, ...patch };
    if (!Object.prototype.hasOwnProperty.call(patch, 'metrics')) {
      next.metrics = serializeMetrics(ensureMetrics(moduleId));
    }
    state.set(`runtime.modules.${moduleId}`, next);
  }

  function publishMetrics(moduleId) {
    const internal = ensureMetrics(moduleId);
    internal.compat = evaluateCompatibility(manifests.get(moduleId));
    updateModuleRuntime(moduleId, { metrics: serializeMetrics(internal) });
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
    const metrics = ensureMetrics(moduleId);
    metrics.attempts += 1;
    metrics.lastAttemptAt = Date.now();
    metrics.lastError = null;
    updateModuleRuntime(moduleId, { state: 'loading', error: null, metrics: serializeMetrics(metrics) });
    const loadStartedAt = now();
    const promise = Promise.resolve()
      .then(() => loader())
      .then(() => {
        const mod = getModule(moduleId);
        if (!mod) {
          throw new Error(`Module "${moduleId}" did not register itself.`);
        }
        const loadDuration = now() - loadStartedAt;
        metrics.loadTimings.last = loadDuration;
        metrics.loadTimings.total += loadDuration;
        metrics.loadTimings.samples += 1;
        if (!initialized.has(moduleId)) {
          if (typeof mod.init === 'function') {
            const initStartedAt = now();
            try {
              mod.init({ state });
            } catch (error) {
              console.error(`a11ytb: échec de l’initialisation du module ${moduleId}.`, error);
              metrics.failures += 1;
              metrics.lastError = error?.message || "Échec d'initialisation";
              metrics.initTimings.last = null;
              error.__a11ytbTracked = true;
              publishMetrics(moduleId);
              updateModuleRuntime(moduleId, { state: 'error', error: metrics.lastError });
              throw error;
            }
            const initDuration = now() - initStartedAt;
            metrics.initTimings.last = initDuration;
            metrics.initTimings.total += initDuration;
            metrics.initTimings.samples += 1;
          }
          initialized.add(moduleId);
        }
        metrics.successes += 1;
        publishMetrics(moduleId);
        updateModuleRuntime(moduleId, { state: 'ready', error: null });
        return mod;
      })
      .catch((error) => {
        const tracked = error && typeof error === 'object' && error.__a11ytbTracked;
        const metrics = ensureMetrics(moduleId);
        if (!tracked) {
          metrics.failures += 1;
          metrics.lastError = error?.message || 'Échec de chargement';
          metrics.loadTimings.last = null;
          publishMetrics(moduleId);
        }
        console.error(`a11ytb: impossible de charger le module ${moduleId}.`, error);
        updateModuleRuntime(moduleId, { state: 'error', error: metrics.lastError || 'Échec de chargement' });
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
