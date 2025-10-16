import { beforeAll, describe, expect, it } from 'vitest';
import { validateModuleManifest } from '../src/module-manifest.js';
import { moduleCatalog } from '../src/module-catalog.js';

async function loadAllModules() {
  return Promise.all(moduleCatalog.map((entry) => entry.loader()));
}

function ensureTestEnvironment() {
  if (!globalThis.window) {
    globalThis.window = {};
  }
  if (!globalThis.window.a11ytb) {
    globalThis.window.a11ytb = {};
  }
  if (!globalThis.document) {
    globalThis.document = {
      documentElement: { lang: 'fr' },
      createElement: () => ({ dataset: {}, style: {}, setAttribute: () => {} }),
      head: { appendChild: () => {} },
    };
  } else if (!globalThis.document.documentElement) {
    globalThis.document.documentElement = { lang: 'fr' };
  }
  if (!globalThis.document.head) {
    globalThis.document.head = { appendChild: () => {} };
  }
}

function findDependencyCycle(graph) {
  const visited = new Set();
  const stack = new Set();
  const path = [];

  function dfs(node) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart === -1) {
        return [node];
      }
      const cyclePath = path.slice(cycleStart);
      cyclePath.push(node);
      return cyclePath;
    }
    if (visited.has(node)) return null;
    visited.add(node);
    stack.add(node);
    path.push(node);

    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!graph.has(neighbor)) continue;
      const cycle = dfs(neighbor);
      if (cycle) return cycle;
    }

    stack.delete(node);
    path.pop();
    return null;
  }

  for (const node of graph.keys()) {
    const cycle = dfs(node);
    if (cycle) return cycle;
  }
  return null;
}

describe('module manifest contract', () => {
  beforeAll(() => {
    ensureTestEnvironment();
  });

  it('valide chaque manifest de module via validateModuleManifest', async () => {
    const { registerModuleManifest, listModuleManifests } = await import('../src/registry.js');
    const normalizedById = new Map();
    moduleCatalog.forEach(({ manifest, id }) => {
      expect(manifest).toBeDefined();
      expect(typeof id).toBe('string');
      const normalized = validateModuleManifest(manifest, id);
      normalizedById.set(normalized.id, normalized);
      expect(Object.isFrozen(normalized)).toBe(true);
      expect(normalized.metadataQuality).toBeDefined();
      expect(typeof normalized.metadataQuality.level).toBe('string');
      expect(typeof normalized.metadataQuality.coverage).toBe('number');
      expect(Array.isArray(normalized.metadataQuality.checks)).toBe(true);
      registerModuleManifest(manifest, id);
    });

    await loadAllModules();
    const registered = listModuleManifests();
    registered.forEach((manifest) => {
      expect(normalizedById.get(manifest.id)).toEqual(manifest);
    });
  });

  it('assure que le graphe de dépendances est acyclique et complet', async () => {
    const { registerModuleManifest, listModuleManifests } = await import('../src/registry.js');
    moduleCatalog.forEach(({ manifest, id }) => {
      registerModuleManifest(manifest, id);
    });
    await loadAllModules();
    const manifests = listModuleManifests();

    const dependencyGraph = new Map(
      manifests.map((manifest) => [manifest.id, (manifest.dependencies ?? []).map((dep) => dep.id)])
    );

    const missing = [];
    manifests.forEach((manifest) => {
      const dependencies = dependencyGraph.get(manifest.id) ?? [];
      dependencies.forEach((depId) => {
        if (!dependencyGraph.has(depId)) {
          missing.push(`${manifest.id} -> ${depId}`);
        }
      });
    });

    if (missing.length) {
      throw new Error(`Dépendances manquantes: ${missing.join(', ')}`);
    }

    const cycle = findDependencyCycle(dependencyGraph);
    if (cycle) {
      throw new Error(`Cycle de dépendances détecté: ${cycle.join(' -> ')}`);
    }
  });

  it('gère le versionnage des manifestes et historise les changements', async () => {
    const { registerModuleManifest, getModuleManifest, getModuleManifestHistory } = await import(
      '../src/registry.js'
    );

    const manifestId = 'test-semver-manifest';
    const baseManifest = {
      id: manifestId,
      name: 'Module test semver',
      version: '1.0.0',
      description: 'Manifest de test pour la gouvernance.',
      category: 'vision',
      keywords: ['test', 'semver'],
      permissions: ['speechSynthesis'],
      defaults: {
        state: {
          [manifestId]: { enabled: true },
        },
      },
      config: {
        fields: [
          {
            type: 'toggle',
            path: `${manifestId}.enabled`,
            label: 'Activer le module de test',
          },
        ],
      },
    };

    const initial = registerModuleManifest(baseManifest, manifestId);
    expect(initial.version).toBe('1.0.0');

    const downgrade = { ...baseManifest, version: '0.5.0' };
    const afterDowngrade = registerModuleManifest(downgrade, manifestId);
    expect(afterDowngrade.version).toBe('1.0.0');

    const upgrade = { ...baseManifest, version: '1.1.0', description: 'Manifest mis à jour.' };
    const upgraded = registerModuleManifest(upgrade, manifestId);
    expect(upgraded.version).toBe('1.1.0');
    expect(getModuleManifest(manifestId).description).toBe('Manifest mis à jour.');

    const history = getModuleManifestHistory(manifestId);
    expect(history).toHaveLength(3);
    expect(history[0].status).toBe('accepted');
    expect(history[0].reason).toBe('initial');
    expect(history[1].status).toBe('rejected');
    expect(history[1].reason).toBe('downgrade');
    expect(history[2].status).toBe('accepted');
    expect(history[2].reason).toBe('upgrade');
    expect(history[2].version).toBe('1.1.0');
  });
});
