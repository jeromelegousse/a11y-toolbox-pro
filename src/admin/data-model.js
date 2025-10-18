import { moduleCatalog } from '../module-catalog.js';
import { flattenedModuleCollections } from '../module-collections.js';
import { computeProfiles } from '../profile-utils.js';
import { ensureArray } from './utils.js';

export { computeProfiles } from '../profile-utils.js';

export const collectionLookup = new Map(
  flattenedModuleCollections.map((collection) => [collection.id, collection])
);

const moduleToCollections = new Map();
flattenedModuleCollections.forEach((collection) => {
  const members = ensureArray(collection.modules);
  members.forEach((moduleId) => {
    if (!moduleToCollections.has(moduleId)) {
      moduleToCollections.set(moduleId, new Set());
    }
    moduleToCollections.get(moduleId).add(collection.id);
  });
});

function resolveStatus(runtimeEntry, { disabled, hidden, disabledCollections }) {
  const isErrored = runtimeEntry.state === 'error';
  if (isErrored) {
    return { label: 'En erreur', tone: 'alert', enabled: false };
  }

  const blockIds = ensureArray(runtimeEntry.blockIds);
  const fullyDisabled = blockIds.length > 0 && blockIds.every((blockId) => disabled.has(blockId));
  const fullyHidden = blockIds.length > 0 && blockIds.every((blockId) => hidden.has(blockId));
  const disabledByCollection = ensureArray(runtimeEntry.collections).some((collectionId) =>
    disabledCollections.has(collectionId)
  );

  if (fullyDisabled) {
    return { label: 'Désactivé', tone: 'muted', enabled: false };
  }
  if (fullyHidden) {
    return { label: 'Masqué', tone: 'warning', enabled: false };
  }
  if (runtimeEntry.enabled === false || disabledByCollection) {
    return { label: 'Suspendu', tone: 'warning', enabled: false };
  }
  return { label: 'Actif', tone: 'confirm', enabled: true };
}

function determineAvailability({
  enabled,
  statusTone,
  compatStatus,
  collectionDisabled,
  dependencies,
  flags,
}) {
  const dependencyList = ensureArray(dependencies);
  const hasBlockingDependency = dependencyList.some(
    (dependency) => dependency.status && dependency.status !== 'ok'
  );
  const hasAlertFlag = ensureArray(flags).some((flag) => flag.tone === 'alert');
  if (statusTone === 'alert' || hasBlockingDependency || hasAlertFlag) {
    return 'blocked';
  }
  if (!enabled || collectionDisabled || compatStatus === 'partial' || compatStatus === 'unknown') {
    return 'attention';
  }
  return 'ready';
}

function buildFlags(isCollectionDisabled, runtimeEntry, compat) {
  const flags = [];
  if (isCollectionDisabled) {
    flags.push({ tone: 'warning', label: 'Collection désactivée' });
  }
  const dependencies = ensureArray(runtimeEntry.dependencies);
  const blockingDependencies = dependencies.filter(
    (dependency) => dependency.status && dependency.status !== 'ok'
  );
  if (blockingDependencies.length) {
    const label =
      blockingDependencies.length > 1
        ? `${blockingDependencies.length} dépendances à résoudre`
        : `${blockingDependencies[0].label} à vérifier`;
    flags.push({ tone: 'alert', label });
  }
  if (compat?.status === 'unknown') {
    flags.push({ tone: 'warning', label: 'Compatibilité à confirmer' });
  }
  if (compat?.status === 'partial') {
    flags.push({ tone: 'alert', label: 'Compatibilité partielle' });
  }
  return flags;
}

function buildSearchText(entry) {
  const manifest = entry.manifest || {};
  const tokens = [entry.id, manifest.name, manifest.description, manifest.category]
    .concat(ensureArray(manifest.keywords))
    .concat(ensureArray(manifest.permissions));
  return tokens
    .filter(Boolean)
    .map((token) => token.toString().toLowerCase())
    .join(' ');
}

export function buildModuleEntries(snapshot = {}) {
  const stateUi = snapshot?.ui || {};
  const runtime = snapshot?.runtime?.modules || {};
  const disabledSet = new Set(ensureArray(stateUi.disabled));
  const hiddenSet = new Set(ensureArray(stateUi.hidden));
  const pinnedSet = new Set(ensureArray(stateUi.pinned));
  const collectionsDisabled = new Set(ensureArray(stateUi.collections?.disabled));
  const { moduleToProfiles } = computeProfiles(snapshot);

  return moduleCatalog.map((entry) => {
    const manifest = entry.manifest || {};
    const runtimeEntry = runtime[entry.id] || {};
    const blockIds = ensureArray(runtimeEntry.blockIds);
    const status = resolveStatus(runtimeEntry, {
      disabled: disabledSet,
      hidden: hiddenSet,
      disabledCollections: collectionsDisabled,
    });

    const collections = moduleToCollections.get(entry.id);
    const collectionIds = collections ? Array.from(collections) : [];
    const isCollectionDisabled = collectionIds.some((collectionId) =>
      collectionsDisabled.has(collectionId)
    );
    const pinned = blockIds.some((blockId) => pinnedSet.has(blockId));
    const compat = runtimeEntry.metrics?.compat ||
      runtimeEntry.compat ||
      manifest.compat || { status: 'none' };
    const compatStatus = compat.status || 'none';

    const dependencies = ensureArray(runtimeEntry.dependencies);

    const metrics = runtimeEntry.metrics
      ? { ...runtimeEntry.metrics }
      : {
          attempts: 0,
          successes: 0,
          failures: 0,
          timings: { load: {}, init: {}, combinedAverage: null },
        };
    if (!Number.isFinite(metrics.lastAttemptAt) && Number.isFinite(runtimeEntry.lastAttemptAt)) {
      metrics.lastAttemptAt = runtimeEntry.lastAttemptAt;
    }

    const profiles = moduleToProfiles.get(entry.id) || new Set();
    const flags = buildFlags(isCollectionDisabled, runtimeEntry, compat);

    const entry = {
      id: entry.id,
      manifest,
      runtime: runtimeEntry,
      blockIds,
      metrics,
      compat,
      compatStatus,
      status: status.label,
      statusTone: status.tone,
      enabled: status.enabled,
      isDisabled: !status.enabled && status.label === 'Désactivé',
      isHidden: !status.enabled && status.label === 'Masqué',
      isPinned: pinned,
      canToggle: blockIds.length > 0 && !isCollectionDisabled,
      collectionDisabled: isCollectionDisabled,
      profiles: Array.from(profiles),
      collections: collectionIds,
      dependencies,
      flags,
      searchText: buildSearchText({ id: entry.id, manifest }),
    };

    entry.availability = determineAvailability({
      enabled: entry.enabled,
      statusTone: entry.statusTone,
      compatStatus,
      collectionDisabled: isCollectionDisabled,
      dependencies: entry.dependencies,
      flags: entry.flags,
    });

    return entry;
  });
}

export function filterModules(entries, filters) {
  return entries.filter((entry) => {
    if (filters.availability && filters.availability !== 'all' && entry.availability !== filters.availability) {
      return false;
    }
    if (filters.profile !== 'all' && !entry.profiles.includes(filters.profile)) {
      return false;
    }
    if (filters.collection !== 'all' && !entry.collections.includes(filters.collection)) {
      return false;
    }
    if (filters.compatibility !== 'all' && entry.compatStatus !== filters.compatibility) {
      return false;
    }
    if (filters.search) {
      const query = filters.search.toLowerCase();
      if (!entry.searchText.includes(query)) {
        return false;
      }
    }
    if (filters.onlyPinned && !entry.isPinned) {
      return false;
    }
    return true;
  });
}

export function sortModules(entries, sortKey) {
  const list = [...entries];
  switch (sortKey) {
    case 'status':
      return list.sort((a, b) => a.status.localeCompare(b.status, 'fr'));
    case 'recent':
      return list.sort((a, b) => {
        const aTime = a.metrics.lastAttemptAt || a.runtime.lastAttemptAt || 0;
        const bTime = b.metrics.lastAttemptAt || b.runtime.lastAttemptAt || 0;
        return bTime - aTime;
      });
    case 'compat':
      return list.sort((a, b) => a.compatStatus.localeCompare(b.compatStatus, 'fr'));
    case 'alpha':
    default:
      return list.sort((a, b) =>
        (a.manifest.name || a.id).localeCompare(b.manifest.name || b.id, 'fr')
      );
  }
}

function incrementCount(map, key) {
  if (!key) {
    return;
  }
  const current = map.get(key) || 0;
  map.set(key, current + 1);
}

function sortByCountAndLabel(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return (a.label || a.id).localeCompare(b.label || b.id, 'fr');
}

function formatCounts(map, lookup) {
  return Array.from(map.entries())
    .map(([id, count]) => {
      const metadata = lookup?.get(id);
      const label = metadata?.label || id;
      const pathLabel = metadata?.pathLabel || label;
      return { id, count, label, pathLabel };
    })
    .sort(sortByCountAndLabel);
}

export function computeAvailabilityBuckets(entries = []) {
  const stats = {
    total: entries.length,
    enabled: 0,
    pinned: 0,
  };

  const initialBuckets = [
    {
      id: 'ready',
      label: 'Prêts à l’usage',
      description: 'Modules actifs ou activables immédiatement.',
      tone: 'confirm',
      modules: [],
    },
    {
      id: 'attention',
      label: 'À surveiller',
      description: 'Compatibilité partielle, collections désactivées ou modules en pause.',
      tone: 'warning',
      modules: [],
    },
    {
      id: 'blocked',
      label: 'Bloqués',
      description: 'Dépendances manquantes, erreurs de chargement ou alertes critiques.',
      tone: 'alert',
      modules: [],
    },
  ];

  const bucketMap = new Map(initialBuckets.map((bucket) => [bucket.id, { ...bucket, modules: [] }]));
  const profileCounts = new Map();
  const collectionCounts = new Map();

  entries.forEach((entry) => {
    if (entry.enabled) {
      stats.enabled += 1;
    }
    if (entry.isPinned) {
      stats.pinned += 1;
    }

    ensureArray(entry.profiles).forEach((profileId) => incrementCount(profileCounts, profileId));
    ensureArray(entry.collections).forEach((collectionId) => incrementCount(collectionCounts, collectionId));

    const bucketId = bucketMap.has(entry.availability) ? entry.availability : determineAvailability(entry);
    const bucket = bucketMap.get(bucketId) || bucketMap.get('attention');
    bucket.modules.push(entry);
  });

  const buckets = Array.from(bucketMap.values()).map((bucket) => ({
    ...bucket,
    modules: bucket.modules
      .slice()
      .sort((a, b) => (a.manifest.name || a.id).localeCompare(b.manifest.name || b.id, 'fr')),
    count: bucket.modules.length,
  }));

  return {
    stats,
    buckets,
    profiles: formatCounts(profileCounts),
    collections: formatCounts(collectionCounts, collectionLookup),
  };
}

const COMPATIBILITY_SEVERITY = new Map([
  ['full', 0],
  ['unknown', 1],
  ['partial', 2],
  ['none', 3],
]);

function pickWorstCompatStatus(current, candidate) {
  const currentWeight = COMPATIBILITY_SEVERITY.get(current) ?? 0;
  const candidateWeight = COMPATIBILITY_SEVERITY.get(candidate) ?? 0;
  return candidateWeight > currentWeight ? candidate : current;
}

function normalizeFlags(entry) {
  const seen = new Set();
  const result = [];
  ensureArray(entry?.flags).forEach((flag) => {
    if (!flag || typeof flag.label !== 'string') {
      return;
    }
    const key = `${flag.tone || 'info'}::${flag.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ tone: flag.tone || 'info', label: flag.label });
    }
  });
  return result;
}

function buildChildHighlights(collection, moduleSet, entryById) {
  return flattenedModuleCollections
    .filter((child) => child.parentId === collection.id)
    .map((child) => {
      const directModules = ensureArray(child.directModules).filter(Boolean);
      if (!directModules.length) {
        return null;
      }
      const matched = directModules.filter((moduleId) => moduleSet.has(moduleId));
      const missing = directModules.filter((moduleId) => !moduleSet.has(moduleId));
      const hasIssues = matched.length > 0 && (missing.length > 0);
      if (!hasIssues) {
        return null;
      }
      return {
        id: child.id,
        label: child.label || child.id,
        matched: matched.length,
        total: directModules.length,
        missingModules: missing.map((moduleId) => ({
          id: moduleId,
          label: entryById.get(moduleId)?.manifest?.name || moduleId,
        })),
      };
    })
    .filter(Boolean);
}

export function computeProfileCollectionSuggestions(entries = [], snapshot = {}) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const { list: profiles } = computeProfiles(snapshot);
  const disabledCollections = new Set(ensureArray(snapshot?.ui?.collections?.disabled));
  const result = [];

  const topLevelCollections = flattenedModuleCollections.filter((collection) => collection.depth === 0);

  profiles.forEach((profile) => {
    const moduleSet = new Set(ensureArray(profile.modules));
    const profileSuggestions = [];

    topLevelCollections.forEach((collection) => {
      const directModules = ensureArray(collection.directModules).filter(Boolean);
      if (!directModules.length) {
        return;
      }

      const moduleDetails = directModules.map((moduleId) => {
        const entry = entryById.get(moduleId) || null;
        return {
          id: moduleId,
          entry,
          inProfile: moduleSet.has(moduleId),
        };
      });

      const matched = moduleDetails.filter((detail) => detail.inProfile);
      if (!matched.length) {
        return;
      }

      const missing = moduleDetails.filter((detail) => !detail.inProfile);
      const blockedCount = matched.filter((detail) => detail.entry?.availability === 'blocked').length;
      const attentionCount = matched.filter((detail) => detail.entry?.availability === 'attention').length;
      const readyCount = matched.filter((detail) => detail.entry?.availability === 'ready').length;
      const compatStatus = moduleDetails.reduce(
        (worst, detail) => pickWorstCompatStatus(worst, detail.entry?.compatStatus || 'full'),
        'full'
      );

      const aggregatedFlags = [];
      const seenFlags = new Set();
      moduleDetails.forEach((detail) => {
        normalizeFlags(detail.entry).forEach((flag) => {
          const key = `${flag.tone}::${flag.label}`;
          if (!seenFlags.has(key)) {
            seenFlags.add(key);
            aggregatedFlags.push(flag);
          }
        });
      });

      const isCollectionDisabled = disabledCollections.has(collection.id);

      const shouldInclude =
        missing.length > 0 || blockedCount > 0 || attentionCount > 0 || isCollectionDisabled;
      if (!shouldInclude) {
        return;
      }

      const childHighlights = buildChildHighlights(collection, moduleSet, entryById);

      const coverage = directModules.length ? matched.length / directModules.length : 0;

      let tone = 'info';
      if (blockedCount > 0) {
        tone = 'alert';
      } else if (attentionCount > 0 || missing.length > 0 || isCollectionDisabled) {
        tone = 'warning';
      } else if (readyCount === matched.length && matched.length > 0) {
        tone = 'confirm';
      }

      const requires = ensureArray(collection.requires).map((requirement) => {
        if (!requirement || typeof requirement !== 'object') {
          return null;
        }
        if (requirement.type === 'module') {
          const moduleEntry = entryById.get(requirement.id);
          return {
            id: requirement.id,
            type: 'module',
            label: moduleEntry?.manifest?.name || requirement.label || requirement.id,
            reason: requirement.reason || '',
          };
        }
        const target = collectionLookup.get(requirement.id);
        return {
          id: requirement.id,
          type: 'collection',
          label: requirement.label || target?.label || requirement.id,
          reason: requirement.reason || '',
        };
      }).filter(Boolean);

      profileSuggestions.push({
        id: collection.id,
        label: collection.label || collection.id,
        description: collection.description || '',
        coverage: {
          matched: matched.length,
          total: directModules.length,
          percent: coverage,
        },
        missingModules: missing.map((detail) => ({
          id: detail.id,
          label: detail.entry?.manifest?.name || detail.id,
          compatStatus: detail.entry?.compatStatus || 'none',
        })),
        modules: moduleDetails.map((detail) => ({
          id: detail.id,
          label: detail.entry?.manifest?.name || detail.id,
          availability: detail.entry?.availability || 'attention',
          status: detail.entry?.status || '',
          tone: detail.entry?.statusTone || 'info',
          compatStatus: detail.entry?.compatStatus || 'none',
          inProfile: detail.inProfile,
        })),
        flags: aggregatedFlags,
        blockedCount,
        attentionCount,
        readyCount,
        compatStatus,
        tone,
        requires,
        isCollectionDisabled,
        children: childHighlights,
        score:
          blockedCount * 100 +
          attentionCount * 50 +
          (missing.length > 0 ? 25 : 0) +
          coverage,
      });
    });

    if (profileSuggestions.length) {
      profileSuggestions.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.coverage.percent !== a.coverage.percent) {
          return b.coverage.percent - a.coverage.percent;
        }
        return (a.label || a.id).localeCompare(b.label || b.id, 'fr');
      });
      result.push({
        profileId: profile.id,
        profileLabel: profile.label,
        suggestions: profileSuggestions,
      });
    }
  });

  return result;
}
