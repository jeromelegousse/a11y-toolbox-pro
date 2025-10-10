const SEMVER_REGEX = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

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
  'config',
  'compat'
]);

function ensureArray(value, mapFn = (x) => x) {
  if (value === undefined) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .map(mapFn)
    .filter((entry) => entry !== undefined && entry !== null);
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
        normalized.version = dep.version.trim();
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
      console.warn(`a11ytb: champ de configuration invalide pour "${manifestId}" (index ${index}).`);
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
      default: {
        console.warn(`a11ytb: type de champ de configuration inconnu "${type}" pour "${manifestId}".`);
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
    console.warn(`a11ytb: champs manifest non reconnus pour "${moduleId ?? manifest.id}": ${unknownKeys.join(', ')}`);
  }

  const normalized = {};
  const id = typeof manifest.id === 'string' && manifest.id.trim()
    ? manifest.id.trim()
    : (typeof moduleId === 'string' && moduleId.trim() ? moduleId.trim() : null);

  if (!id) {
    throw new Error('Module manifest requires an "id".');
  }
  if (moduleId && id !== moduleId) {
    throw new Error(`Module manifest id "${id}" does not match module definition id "${moduleId}".`);
  }

  normalized.id = id;

  if (manifest.name && typeof manifest.name === 'string') {
    normalized.name = manifest.name.trim();
  }

  if (manifest.version !== undefined) {
    if (typeof manifest.version !== 'string' || !SEMVER_REGEX.test(manifest.version.trim())) {
      throw new Error(`Module manifest for "${id}" has an invalid semver version.`);
    }
    normalized.version = manifest.version.trim();
  } else {
    normalized.version = '0.0.0';
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

  const permissions = ensureArray(manifest.permissions, (perm) => {
    if (typeof perm !== 'string') return undefined;
    const trimmed = perm.trim();
    return trimmed ? trimmed : undefined;
  });
  if (permissions?.length) {
    normalized.permissions = Array.from(new Set(permissions));
  }

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

  if (manifest.config && typeof manifest.config === 'object') {
    const config = normalizeConfig(manifest.config, id);
    if (config) normalized.config = config;
  }

  const compat = normalizeCompat(manifest.compat);
  if (compat) {
    normalized.compat = compat;
  }

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
