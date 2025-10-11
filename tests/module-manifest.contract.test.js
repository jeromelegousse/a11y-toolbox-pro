import { beforeAll, describe, expect, it } from 'vitest';
import { validateModuleManifest } from '../src/module-manifest.js';

const MODULE_PATHS = [
  '../src/modules/tts.js',
  '../src/modules/stt.js',
  '../src/modules/braille.js',
  '../src/modules/contrast.js',
  '../src/modules/spacing.js'
];

async function loadAllModules() {
  return Promise.all(MODULE_PATHS.map((path) => import(path)));
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
      head: { appendChild: () => {} }
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
    const modules = await loadAllModules();

    const normalizedById = new Map();
    modules.forEach((moduleEntry) => {
      const manifest = moduleEntry.manifest || moduleEntry.default?.manifest;
      expect(manifest).toBeDefined();
      expect(typeof manifest.id).toBe('string');
      const normalized = validateModuleManifest(manifest, manifest.id);
      normalizedById.set(normalized.id, normalized);
      expect(Object.isFrozen(normalized)).toBe(true);
    });

    const { listModuleManifests } = await import('../src/registry.js');
    const registered = listModuleManifests();
    registered.forEach((manifest) => {
      expect(normalizedById.get(manifest.id)).toEqual(manifest);
    });
  });

  it('assure que le graphe de dépendances est acyclique et complet', async () => {
    await loadAllModules();
    const { listModuleManifests } = await import('../src/registry.js');
    const manifests = listModuleManifests();

    const dependencyGraph = new Map(
      manifests.map((manifest) => [
        manifest.id,
        (manifest.dependencies ?? []).map((dep) => dep.id)
      ])
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
});
