import { getModule, listBlocks } from './registry.js';

const DEPENDENCY_STATUS_LABELS = {
  ok: 'OK',
  missing: 'Manquant',
  incompatible: 'Version incompatible'
};

const DEPENDENCY_STATUS_TONE = {
  missing: 'alert',
  incompatible: 'warning'
};

function parseSemver(version) {
  if (typeof version !== 'string') {
    return { major: 0, minor: 0, patch: 0, pre: null };
  }
  const normalized = version.trim();
  const [main = '0.0.0', pre = null] = normalized.split('-', 2);
  const [major = '0', minor = '0', patch = '0'] = main.split('.', 3);
  return {
    major: Number.parseInt(major, 10) || 0,
    minor: Number.parseInt(minor, 10) || 0,
    patch: Number.parseInt(patch, 10) || 0,
    pre: pre ?? null
  };
}

function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre.localeCompare(right.pre);
}

export function setupModuleRuntime({ state, catalog }) {
  const loaders = new Map(catalog.map((entry) => [entry.id, entry.loader]));
  const manifests = new Map(catalog.map((entry) => [entry.id, entry.manifest]));
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

  function isModuleEnabled(blockIds, disabledSet) {
    return blockIds.some((blockId) => !disabledSet.has(blockId));
  }

  let lastDisabled = new Set(state.get('ui.disabled') ?? []);
  moduleToBlocks.forEach((blockIds, moduleId) => {
    const enabled = isModuleEnabled(blockIds, lastDisabled);
    updateModuleRuntime(moduleId, { blockIds, enabled });
    applyModuleMetadata(moduleId);
    if (enabled) {
      loadModule(moduleId).catch(() => {});
    }
  });

  const modulesWithoutBlocks = catalog
    .map((entry) => entry.id)
    .filter((id) => !moduleToBlocks.has(id));

  modulesWithoutBlocks.forEach((moduleId) => {
    updateModuleRuntime(moduleId, { blockIds: [], enabled: true });
    applyModuleMetadata(moduleId);
    loadModule(moduleId).catch(() => {});
  });

  state.on((snapshot) => {
    const nextDisabled = new Set(snapshot?.ui?.disabled ?? []);
    moduleToBlocks.forEach((blockIds, moduleId) => {
      const wasEnabled = isModuleEnabled(blockIds, lastDisabled);
      const isEnabled = isModuleEnabled(blockIds, nextDisabled);
      if (wasEnabled !== isEnabled) {
        updateModuleRuntime(moduleId, { enabled: isEnabled });
      }
      if (isEnabled && !wasEnabled) {
        loadModule(moduleId).catch(() => {});
      }
    });
    modulesWithoutBlocks.forEach((moduleId) => {
      if (!loading.has(moduleId) && !initialized.has(moduleId)) {
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
