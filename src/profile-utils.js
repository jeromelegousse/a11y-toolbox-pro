import { moduleCatalog } from './module-catalog.js';

const DEFAULT_NAMESPACE_MAP = new Map([
  ['contrast', 'contrast'],
  ['spacing', 'spacing'],
  ['tts', 'tts'],
  ['stt', 'stt'],
  ['braille', 'braille'],
  ['audio', 'audio-feedback'],
  ['audit', 'audit'],
]);

export const NAMESPACE_TO_MODULE = DEFAULT_NAMESPACE_MAP;

export function resolveModuleFromNamespace(namespace) {
  if (typeof namespace !== 'string') {
    return null;
  }
  const key = namespace.split('.')[0];
  return NAMESPACE_TO_MODULE.get(key) || null;
}

export function extractModulesFromProfileSettings(settings = {}) {
  if (!settings || typeof settings !== 'object') {
    return [];
  }
  const modules = new Set();
  Object.keys(settings).forEach((path) => {
    const moduleId = resolveModuleFromNamespace(path);
    if (moduleId) {
      modules.add(moduleId);
    }
  });
  return Array.from(modules);
}

export function computeProfiles(snapshot = {}) {
  const profiles = snapshot?.profiles || {};
  const entries = Object.entries(profiles)
    .map(([id, profile]) => {
      const modules = extractModulesFromProfileSettings(profile?.settings || {});
      return {
        id,
        label: profile?.name || id,
        modules,
      };
    })
    .filter((entry) => entry.modules.length > 0);

  const moduleToProfiles = new Map();
  entries.forEach((profile) => {
    profile.modules.forEach((moduleId) => {
      if (!moduleToProfiles.has(moduleId)) {
        moduleToProfiles.set(moduleId, new Set());
      }
      moduleToProfiles.get(moduleId).add(profile.id);
    });
  });

  return {
    list: entries,
    moduleToProfiles,
  };
}

export function getModuleLabel(moduleId) {
  const entry = moduleCatalog.find((module) => module.id === moduleId);
  return entry?.manifest?.name || moduleId;
}
