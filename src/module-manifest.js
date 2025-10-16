import { isValidSemver, parseSemver } from './utils/semver.js';

const KNOWN_FIELDS = new Set([
  'id',
  'name',
  'version',
  'description',
  'category',
  'keywords',
  'permissions',
  'dependencies',
  'homepage',
  'bugs',
  'license',
  'authors',
  'defaults',
  'lifecycle',
  'workflow',
  'config',
  'compat',
  'runtime',
  'guides',
]);

const KNOWN_PRELOAD_STRATEGIES = new Set(['idle', 'visible', 'pointer']);

const QUALITY_LEVEL_LABELS = Object.freeze({
  AAA: 'Excellent',
  AA: 'Avancé',
  A: 'Solide',
  B: 'À renforcer',
  C: 'Critique',
});

const QUALITY_CHECKS = Object.freeze([
  {
    id: 'name',
    label: 'Nom lisible',
    dimension: 'documentation',
    weight: 0.75,
    hint: 'Définissez `manifest.name` pour identifier clairement le module dans le catalogue.',
    evaluate: (manifest) => typeof manifest.name === 'string' && manifest.name.trim().length > 0,
  },
  {
    id: 'description',
    label: 'Description détaillée',
    dimension: 'documentation',
    weight: 1,
    hint: 'Ajoutez une description utilisateur (au moins deux phrases) pour aligner le module sur les solutions professionnelles.',
    evaluate: (manifest) => {
      if (typeof manifest.description !== 'string') return false;
      return manifest.description.trim().length >= 40;
    },
  },
  {
    id: 'category',
    label: 'Catégorie renseignée',
    dimension: 'catalogue',
    weight: 0.5,
    hint: 'Renseignez `category` pour faciliter le tri par thématique.',
    evaluate: (manifest) =>
      typeof manifest.category === 'string' && manifest.category.trim().length > 0,
  },
  {
    id: 'keywords',
    label: 'Mots-clés filtrables',
    dimension: 'catalogue',
    weight: 0.5,
    hint: 'Ajoutez au moins deux `keywords` pour rejoindre l’expérience de filtrage proposée par Stark.',
    evaluate: (manifest) => Array.isArray(manifest.keywords) && manifest.keywords.length >= 2,
  },
  {
    id: 'config',
    label: 'Options centralisées',
    dimension: 'expérience',
    weight: 1,
    hint: 'Exposez les réglages clés via `config.fields` afin de rester cohérent avec la console Options & Profils.',
    evaluate: (manifest) =>
      Array.isArray(manifest.config?.fields) && manifest.config.fields.length > 0,
  },
  {
    id: 'defaults',
    label: 'Valeurs par défaut',
    dimension: 'expérience',
    weight: 0.5,
    hint: 'Déclarez `defaults.state` pour garantir une initialisation sûre (équivalent aux presets des barres EqualWeb).',
    evaluate: (manifest) => {
      const state = manifest.defaults?.state;
      return !!state && Object.keys(state).length > 0;
    },
  },
  {
    id: 'compat',
    label: 'Compatibilité documentée',
    dimension: 'fiabilité',
    weight: 1.25,
    hint: 'Ajoutez `compat.features` ou `compat.browsers` pour aligner les garanties avec axe DevTools et Accessibility Insights.',
    evaluate: (manifest) => {
      const compat = manifest.compat;
      if (!compat || typeof compat !== 'object') return false;
      const hasFeatures = Array.isArray(compat.features) && compat.features.length > 0;
      const hasBrowsers = Array.isArray(compat.browsers) && compat.browsers.length > 0;
      return hasFeatures || hasBrowsers;
    },
  },
  {
    id: 'permissions',
    label: 'Permissions explicites',
    dimension: 'fiabilité',
    weight: 0.75,
    hint: 'Listez les APIs critiques dans `permissions` pour sécuriser les audits et anticiper les échecs.',
    evaluate: (manifest) => Array.isArray(manifest.permissions) && manifest.permissions.length > 0,
  },
  {
    id: 'guides',
    label: 'Guides FastPass',
    dimension: 'guidage',
    weight: 1.5,
    hint: 'Déclarez des `guides` avec étapes pour rivaliser avec les parcours FastPass d’Accessibility Insights.',
    evaluate: (manifest) => Array.isArray(manifest.guides) && manifest.guides.length > 0,
  },
  {
    id: 'authors',
    label: 'Contact référent',
    dimension: 'gouvernance',
    weight: 0.5,
    hint: 'Ajoutez au moins un `author` pour tracer la responsabilité du module.',
    evaluate: (manifest) => Array.isArray(manifest.authors) && manifest.authors.length > 0,
  },
  {
    id: 'license',
    label: 'Licence déclarée',
    dimension: 'gouvernance',
    weight: 0.25,
    hint: 'Déclarez la `license` pour harmoniser la gouvernance avec les plateformes concurrentes.',
    evaluate: (manifest) =>
      typeof manifest.license === 'string' && manifest.license.trim().length > 0,
  },
]);

function formatList(items = []) {
  if (!items.length) return '';
  if (typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function') {
    try {
      return new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' }).format(items);
    } catch (error) {
      /* ignore and fallback */
    }
  }
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  const head = items.slice(0, -1).join(', ');
  return `${head} et ${items[items.length - 1]}`;
}

export function assessManifestQuality(manifest = {}) {
  const evaluations = QUALITY_CHECKS.map((check) => {
    const passed = !!check.evaluate(manifest);
    return Object.freeze({
      id: check.id,
      label: check.label,
      dimension: check.dimension,
      passed,
      weight: check.weight,
      hint: check.hint,
    });
  });

  const totalWeight = evaluations.reduce((acc, entry) => acc + entry.weight, 0);
  const earnedWeight = evaluations.reduce(
    (acc, entry) => acc + (entry.passed ? entry.weight : 0),
    0
  );
  const coverage = totalWeight > 0 ? Math.max(0, Math.min(1, earnedWeight / totalWeight)) : 1;
  const coveragePercent = Math.round(coverage * 100);

  let level = 'C';
  if (coverage >= 0.85) {
    level = 'AAA';
  } else if (coverage >= 0.7) {
    level = 'AA';
  } else if (coverage >= 0.5) {
    level = 'A';
  } else if (coverage >= 0.3) {
    level = 'B';
  }

  const missing = evaluations.filter((entry) => !entry.passed).map((entry) => entry.label);
  const recommendations = evaluations
    .filter((entry) => !entry.passed && entry.hint)
    .map((entry) => entry.hint);

  const limitedRecommendations = recommendations.slice(0, 4);
  const headline = `Couverture métadonnées : ${coveragePercent} % (niveau ${level}).`;
  const detail = missing.length
    ? `À compléter : ${formatList(missing)}.`
    : 'Tous les indicateurs sont au vert.';

  return Object.freeze({
    level,
    levelLabel: QUALITY_LEVEL_LABELS[level] || level,
    coverage,
    coveragePercent,
    summary: headline,
    detail,
    missing: Object.freeze(missing),
    recommendations: Object.freeze(limitedRecommendations),
    checks: Object.freeze(evaluations),
  });
}

function ensureArray(value, mapFn = (x) => x) {
  if (value === undefined) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map(mapFn).filter((entry) => entry !== undefined && entry !== null);
}

function normalizeGuides(guides, manifestId) {
  if (guides === undefined || guides === null) return undefined;
  const entries = Array.isArray(guides) ? guides : [guides];
  const normalized = [];
  entries.forEach((guide, index) => {
    if (!guide || typeof guide !== 'object') {
      console.warn(`a11ytb: guide ignoré pour "${manifestId}" (index ${index}).`);
      return;
    }
    const rawId = typeof guide.id === 'string' && guide.id.trim() ? guide.id.trim() : null;
    if (!rawId) {
      console.warn(`a11ytb: guide sans identifiant pour "${manifestId}" (index ${index}).`);
      return;
    }
    const steps = Array.isArray(guide.steps) ? guide.steps.filter(Boolean) : [];
    if (!steps.length) {
      console.warn(`a11ytb: guide "${rawId}" sans étapes pour "${manifestId}".`);
      return;
    }
    const record = { ...guide };
    record.id = rawId;
    if (typeof record.title === 'string') {
      record.title = record.title.trim();
    }
    if (!record.title) {
      record.title = rawId;
    }
    record.steps = Object.freeze(steps.slice());
    if (record.prerequisites !== undefined) {
      const prereqs = Array.isArray(record.prerequisites)
        ? record.prerequisites.filter(Boolean)
        : [record.prerequisites].filter(Boolean);
      record.prerequisites = Object.freeze(prereqs);
    }
    if (record.tags !== undefined) {
      const tags = ensureArray(record.tags, (tag) => {
        if (typeof tag !== 'string') return undefined;
        const trimmed = tag.trim();
        return trimmed ? trimmed : undefined;
      });
      if (tags?.length) {
        record.tags = Object.freeze(Array.from(new Set(tags)));
      } else {
        delete record.tags;
      }
    }
    normalized.push(Object.freeze(record));
  });
  return normalized.length ? Object.freeze(normalized) : undefined;
}

function normalizeDependencies(input) {
  if (!input) return undefined;
  return ensureArray(input, (dep) => {
    if (typeof dep === 'string') {
      return { id: dep };
    }
    if (dep && typeof dep === 'object' && typeof dep.id === 'string' && dep.id.trim()) {
      const normalized = { id: dep.id.trim() };
      if (typeof dep.version === 'string' && dep.version.trim()) {
        const version = dep.version.trim();
        if (!isValidSemver(version)) {
          console.warn(`a11ytb: version de dépendance invalide "${version}" pour "${dep.id}".`);
        } else {
          normalized.version = version;
          const parsed = parseSemver(version);
          if (parsed) {
            normalized.versionInfo = parsed;
          }
        }
      }
      return normalized;
    }
    console.warn('a11ytb: dépendance de module ignorée car invalide.', dep);
    return undefined;
  });
}

function normalizeLifecycle(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object') return undefined;
  const allowed = ['init', 'mount', 'unmount', 'onStateChange'];
  const output = {};
  allowed.forEach((key) => {
    if (typeof lifecycle[key] === 'function') {
      output[key] = lifecycle[key];
    }
  });
  return Object.keys(output).length ? output : undefined;
}

function normalizeWorkflow(workflow) {
  if (!workflow || typeof workflow !== 'object') return undefined;

  const states = [];
  if (Array.isArray(workflow.states)) {
    workflow.states.forEach((entry) => {
      let id = '';
      let label = '';
      let description = '';
      let roles = [];
      if (typeof entry === 'string') {
        id = entry.trim();
        label = id;
      } else if (entry && typeof entry === 'object') {
        id = typeof entry.id === 'string' ? entry.id.trim() : '';
        label = typeof entry.label === 'string' ? entry.label.trim() : '';
        description = typeof entry.description === 'string' ? entry.description.trim() : '';
        roles = ensureArray(entry.roles, (role) =>
          typeof role === 'string' ? role.trim() : undefined
        ).filter(Boolean);
      }
      if (!id) {
        console.warn('a11ytb: état de workflow ignoré car sans identifiant.', entry);
        return;
      }
      states.push(
        Object.freeze({
          id,
          label: label || id,
          description: description || undefined,
          roles: roles.length ? Object.freeze(roles) : undefined,
        })
      );
    });
  } else if (workflow.states && typeof workflow.states === 'object') {
    Object.entries(workflow.states).forEach(([key, value]) => {
      if (!key) return;
      const label =
        typeof value === 'string' ? value.trim() : value?.label ? String(value.label).trim() : key;
      const description =
        value && typeof value === 'object' && typeof value.description === 'string'
          ? value.description.trim()
          : '';
      const roles =
        value && typeof value === 'object'
          ? ensureArray(value.roles, (role) =>
              typeof role === 'string' ? role.trim() : undefined
            ).filter(Boolean)
          : [];
      states.push(
        Object.freeze({
          id: key.trim(),
          label: label || key.trim(),
          description: description || undefined,
          roles: roles.length ? Object.freeze(roles) : undefined,
        })
      );
    });
  }

  if (!states.length) {
    console.warn('a11ytb: workflow de module ignoré car aucun état valide.');
    return undefined;
  }

  const transitions = ensureArray(workflow.transitions, (transition) => {
    if (!transition || typeof transition !== 'object') return undefined;
    const from = typeof transition.from === 'string' ? transition.from.trim() : '';
    const to = typeof transition.to === 'string' ? transition.to.trim() : '';
    if (!from || !to) return undefined;
    const id = typeof transition.id === 'string' ? transition.id.trim() : '';
    const label = typeof transition.label === 'string' ? transition.label.trim() : '';
    const roles = ensureArray(transition.roles, (role) =>
      typeof role === 'string' ? role.trim() : undefined
    ).filter(Boolean);
    return Object.freeze({
      id: id || undefined,
      from,
      to,
      label: label || undefined,
      roles: roles.length ? Object.freeze(roles) : undefined,
    });
  }).filter(Boolean);

  const defaultState =
    typeof workflow.defaultState === 'string' ? workflow.defaultState.trim() : states[0].id;
  const normalizedDefault = states.some((state) => state.id === defaultState)
    ? defaultState
    : states[0].id;

  const normalized = {
    defaultState: normalizedDefault,
    states: Object.freeze(states),
  };
  if (transitions.length) {
    normalized.transitions = Object.freeze(transitions);
  }

  const derivedPermissions = new Set();
  states.forEach((state) => {
    derivedPermissions.add(`workflow:state:${state.id}`);
  });
  transitions.forEach((transition) => {
    const key = transition.id || `${transition.from}:${transition.to}`;
    derivedPermissions.add(`workflow:transition:${key}`);
  });

  return {
    definition: Object.freeze(normalized),
    permissions: Array.from(derivedPermissions),
  };
}

function normalizeCompat(compat) {
  if (!compat || typeof compat !== 'object') return undefined;
  const normalized = {};
  if (compat.browsers) {
    const browsers = ensureArray(compat.browsers, (entry) => {
      if (typeof entry !== 'string') return undefined;
      const trimmed = entry.trim();
      return trimmed ? trimmed : undefined;
    });
    if (browsers?.length) normalized.browsers = browsers;
  }
  if (compat.features) {
    const features = ensureArray(compat.features, (entry) => {
      if (typeof entry !== 'string') return undefined;
      const trimmed = entry.trim();
      return trimmed ? trimmed : undefined;
    });
    if (features?.length) normalized.features = features;
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeRuntime(runtime, manifestId) {
  if (!runtime || typeof runtime !== 'object') return undefined;
  const normalized = {};

  if (runtime.preload !== undefined) {
    const value = typeof runtime.preload === 'string' ? runtime.preload.trim().toLowerCase() : '';
    if (KNOWN_PRELOAD_STRATEGIES.has(value)) {
      normalized.preload = value;
    } else if (value) {
      console.warn(`a11ytb: stratégie de préchargement inconnue "${value}" pour "${manifestId}".`);
    }
  }

  return Object.keys(normalized).length ? Object.freeze(normalized) : undefined;
}

function normalizeConfig(config, manifestId) {
  if (!config || typeof config !== 'object') return undefined;

  const normalized = {};
  if (typeof config.group === 'string' && config.group.trim()) {
    normalized.group = config.group.trim();
  }
  if (typeof config.description === 'string' && config.description.trim()) {
    normalized.description = config.description.trim();
  }

  const fields = Array.isArray(config.fields) ? config.fields : [];
  const normalizedFields = [];

  fields.forEach((field, index) => {
    if (!field || typeof field !== 'object') {
      console.warn(`a11ytb: champ de configuration ignoré pour "${manifestId}" (index ${index}).`);
      return;
    }
    const type = typeof field.type === 'string' ? field.type.trim() : '';
    const path = typeof field.path === 'string' ? field.path.trim() : '';
    if (!type || !path) {
      console.warn(
        `a11ytb: champ de configuration invalide pour "${manifestId}" (index ${index}).`
      );
      return;
    }

    const normalizedField = { type, path };
    if (typeof field.label === 'string' && field.label.trim()) {
      normalizedField.label = field.label.trim();
    }
    if (typeof field.description === 'string' && field.description.trim()) {
      normalizedField.description = field.description.trim();
    }
    if (typeof field.format === 'function') {
      normalizedField.format = field.format;
    }
    if (typeof field.onChange === 'function') {
      normalizedField.onChange = field.onChange;
    }
    if (typeof field.getOptions === 'function') {
      normalizedField.getOptions = field.getOptions;
    }
    if (typeof field.emptyLabel === 'string' && field.emptyLabel.trim()) {
      normalizedField.emptyLabel = field.emptyLabel.trim();
    }

    switch (type) {
      case 'range': {
        const min = Number(field.min);
        const max = Number(field.max);
        if (Number.isNaN(min) || Number.isNaN(max)) {
          console.warn(`a11ytb: champ de configuration "${path}" nécessite min/max numériques.`);
          return;
        }
        normalizedField.min = min;
        normalizedField.max = max;
        if (field.step !== undefined) {
          const step = Number(field.step);
          if (!Number.isNaN(step) && step > 0) {
            normalizedField.step = step;
          }
        }
        if (typeof field.unit === 'string' && field.unit.trim()) {
          normalizedField.unit = field.unit.trim();
        }
        break;
      }
      case 'toggle': {
        if (field.trueValue !== undefined) normalizedField.trueValue = field.trueValue;
        if (field.falseValue !== undefined) normalizedField.falseValue = field.falseValue;
        break;
      }
      case 'select': {
        if (!normalizedField.getOptions) {
          const options = ensureArray(field.options, (option) => {
            if (!option || typeof option !== 'object') return undefined;
            const value = 'value' in option ? option.value : option.id;
            if (value === undefined || value === null) return undefined;
            const label = typeof option.label === 'string' ? option.label.trim() : String(value);
            return { value, label };
          });
          if (options?.length) {
            normalizedField.options = options;
          } else {
            console.warn(`a11ytb: champ de configuration "${path}" nécessite des options.`);
            return;
          }
        }
        break;
      }
      case 'time': {
        if (typeof field.defaultValue === 'string' && field.defaultValue.trim()) {
          normalizedField.defaultValue = field.defaultValue.trim();
        }
        if (field.step !== undefined) {
          const step = Number(field.step);
          if (!Number.isNaN(step) && step > 0) {
            normalizedField.step = step;
          }
        }
        break;
      }
      default: {
        console.warn(
          `a11ytb: type de champ de configuration inconnu "${type}" pour "${manifestId}".`
        );
        return;
      }
    }

    normalizedFields.push(Object.freeze(normalizedField));
  });

  if (!normalizedFields.length) return undefined;
  normalized.fields = Object.freeze(normalizedFields);
  return Object.freeze(normalized);
}

export function validateModuleManifest(manifest, moduleId) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Module manifest must be an object.');
  }

  const unknownKeys = Object.keys(manifest).filter((key) => !KNOWN_FIELDS.has(key));
  if (unknownKeys.length) {
    console.warn(
      `a11ytb: champs manifest non reconnus pour "${moduleId ?? manifest.id}": ${unknownKeys.join(', ')}`
    );
  }

  const normalized = {};
  const id =
    typeof manifest.id === 'string' && manifest.id.trim()
      ? manifest.id.trim()
      : typeof moduleId === 'string' && moduleId.trim()
        ? moduleId.trim()
        : null;

  if (!id) {
    throw new Error('Module manifest requires an "id".');
  }
  if (moduleId && id !== moduleId) {
    throw new Error(
      `Module manifest id "${id}" does not match module definition id "${moduleId}".`
    );
  }

  normalized.id = id;

  if (manifest.name && typeof manifest.name === 'string') {
    normalized.name = manifest.name.trim();
  }

  if (manifest.version !== undefined) {
    if (!isValidSemver(manifest.version)) {
      throw new Error(`Module manifest for "${id}" has an invalid semver version.`);
    }
    normalized.version = manifest.version.trim();
  } else {
    normalized.version = '0.0.0';
  }

  const parsedVersion = parseSemver(normalized.version);
  if (parsedVersion) {
    normalized.versionInfo = parsedVersion;
  }

  if (manifest.description && typeof manifest.description === 'string') {
    normalized.description = manifest.description.trim();
  }

  if (manifest.category && typeof manifest.category === 'string') {
    normalized.category = manifest.category.trim();
  }

  const keywords = ensureArray(manifest.keywords, (keyword) => {
    if (typeof keyword !== 'string') return undefined;
    const trimmed = keyword.trim();
    return trimmed ? trimmed.toLowerCase() : undefined;
  });
  if (keywords?.length) {
    normalized.keywords = Array.from(new Set(keywords));
  }

  let permissions = ensureArray(manifest.permissions, (perm) => {
    if (typeof perm !== 'string') return undefined;
    const trimmed = perm.trim();
    return trimmed ? trimmed : undefined;
  });

  const dependencies = normalizeDependencies(manifest.dependencies);
  if (dependencies?.length) {
    normalized.dependencies = dependencies;
  }

  if (manifest.homepage && typeof manifest.homepage === 'string') {
    normalized.homepage = manifest.homepage.trim();
  }
  if (manifest.bugs && typeof manifest.bugs === 'string') {
    normalized.bugs = manifest.bugs.trim();
  }
  if (manifest.license && typeof manifest.license === 'string') {
    normalized.license = manifest.license.trim();
  }

  const authors = ensureArray(manifest.authors, (author) => {
    if (typeof author === 'string') {
      const trimmed = author.trim();
      return trimmed ? trimmed : undefined;
    }
    if (author && typeof author === 'object' && typeof author.name === 'string') {
      const record = { name: author.name.trim() };
      if (author.email && typeof author.email === 'string') {
        const email = author.email.trim();
        if (email) record.email = email;
      }
      if (author.url && typeof author.url === 'string') {
        const url = author.url.trim();
        if (url) record.url = url;
      }
      return record;
    }
    return undefined;
  });
  if (authors?.length) {
    normalized.authors = authors;
  }

  if (manifest.defaults && typeof manifest.defaults === 'object') {
    const defaults = {};
    if (manifest.defaults.state && typeof manifest.defaults.state === 'object') {
      defaults.state = structuredClone(manifest.defaults.state);
    }
    if (Object.keys(defaults).length) {
      normalized.defaults = defaults;
    }
  }

  const lifecycle = normalizeLifecycle(manifest.lifecycle);
  if (lifecycle) {
    normalized.lifecycle = lifecycle;
  }

  const workflow = normalizeWorkflow(manifest.workflow);
  if (workflow) {
    normalized.workflow = workflow.definition;
    if (workflow.permissions?.length) {
      permissions = (permissions || []).concat(workflow.permissions);
    }
  }

  if (manifest.config && typeof manifest.config === 'object') {
    const config = normalizeConfig(manifest.config, id);
    if (config) normalized.config = config;
  }

  const compat = normalizeCompat(manifest.compat);
  if (compat) {
    normalized.compat = compat;
  }

  const runtime = normalizeRuntime(manifest.runtime, id);
  if (runtime) {
    normalized.runtime = runtime;
  }

  const guides = normalizeGuides(manifest.guides, id);
  if (guides) {
    normalized.guides = guides;
  }

  if (permissions?.length) {
    normalized.permissions = Array.from(new Set(permissions));
  }

  normalized.metadataQuality = assessManifestQuality(normalized);

  return Object.freeze(normalized);
}

export function mergeManifestDefaults(state, manifest) {
  if (!manifest?.defaults?.state) return state;
  const next = { ...state };
  Object.entries(manifest.defaults.state).forEach(([namespace, value]) => {
    if (next[namespace] === undefined) {
      next[namespace] = structuredClone(value);
    }
  });
  return next;
}
