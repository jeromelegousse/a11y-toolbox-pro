import { moduleCatalog } from '../module-catalog.js';
import { moduleCollections } from '../module-collections.js';
import { summarizeStatuses } from '../status-center.js';

const COMPATIBILITY_LABELS = {
  full: 'Compatibles',
  partial: 'À risques',
  unknown: 'À vérifier',
  none: 'Non déclarées'
};

const COMPATIBILITY_TONES = {
  full: 'confirm',
  partial: 'alert',
  unknown: 'warning',
  none: 'muted'
};

const NAMESPACE_TO_MODULE = new Map([
  ['contrast', 'contrast'],
  ['spacing', 'spacing'],
  ['tts', 'tts'],
  ['stt', 'stt'],
  ['braille', 'braille'],
  ['audio', 'audio-feedback'],
  ['audit', 'audit']
]);

const collectionLookup = new Map(moduleCollections.map((collection) => [collection.id, collection]));
const moduleToCollections = new Map();
moduleCollections.forEach((collection) => {
  const members = Array.isArray(collection.modules) ? collection.modules : [];
  members.forEach((moduleId) => {
    if (!moduleToCollections.has(moduleId)) {
      moduleToCollections.set(moduleId, new Set());
    }
    moduleToCollections.get(moduleId).add(collection.id);
  });
});

function formatDuration(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 'Non mesuré';
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes} min ${remaining.toString().padStart(2, '0')} s`;
}

function formatDateRelative(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'Jamais';
  }
  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 60) {
    return 'Il y a quelques secondes';
  }
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `Il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `Il y a ${hours} heure${hours > 1 ? 's' : ''}`;
  }
  const days = Math.floor(diffSeconds / 86400);
  if (days < 7) {
    return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 6) {
    return `Il y a ${weeks} semaine${weeks > 1 ? 's' : ''}`;
  }
  const date = new Date(timestamp);
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function createBadge(text, tone = 'info') {
  const badge = document.createElement('span');
  badge.className = 'a11ytb-admin-badge';
  badge.dataset.tone = tone;
  badge.textContent = text;
  return badge;
}

function createTag(text) {
  const tag = document.createElement('span');
  tag.className = 'a11ytb-admin-tag';
  tag.textContent = text;
  return tag;
}

function computeProfiles(snapshot = {}) {
  const profiles = snapshot?.profiles || {};
  const entries = Object.entries(profiles)
    .map(([id, profile]) => {
      const settings = profile?.settings || {};
      const modules = new Set();
      Object.keys(settings).forEach((path) => {
        if (typeof path !== 'string') return;
        const namespace = path.split('.')[0];
        if (!namespace) return;
        const moduleId = NAMESPACE_TO_MODULE.get(namespace);
        if (moduleId) {
          modules.add(moduleId);
        }
      });
      return {
        id,
        label: profile?.name || id,
        modules: Array.from(modules)
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
    moduleToProfiles
  };
}

function buildModuleEntries(snapshot = {}) {
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
    const metrics = runtimeEntry.metrics || {};
    const compat = metrics.compat || {};
    const compatStatus = compat.status || 'none';
    const blockIds = ensureArray(runtimeEntry.blockIds);
    const collections = moduleToCollections.get(entry.id);
    const collectionsList = collections ? Array.from(collections) : [];
    const profileSet = moduleToProfiles.get(entry.id) || new Set();
    const isDisabled = blockIds.length > 0 && blockIds.every((blockId) => disabledSet.has(blockId));
    const isHidden = blockIds.length > 0 && blockIds.every((blockId) => hiddenSet.has(blockId));
    const isPinned = blockIds.some((blockId) => pinnedSet.has(blockId));
    const disabledByCollection = collectionsList.some((collectionId) => collectionsDisabled.has(collectionId));
    const enabledByRuntime = runtimeEntry.enabled !== false && !disabledByCollection;
    const isErrored = runtimeEntry.state === 'error';
    let status = 'Actif';
    let tone = 'confirm';
    if (isErrored) {
      status = 'En erreur';
      tone = 'alert';
    } else if (isDisabled) {
      status = 'Désactivé';
      tone = 'muted';
    } else if (isHidden) {
      status = 'Masqué';
      tone = 'warning';
    } else if (!enabledByRuntime) {
      status = 'Suspendu';
      tone = 'warning';
    }

    return {
      id: entry.id,
      manifest,
      runtime: runtimeEntry,
      metrics,
      compat,
      compatStatus,
      blockIds,
      status,
      statusTone: tone,
      isDisabled,
      isHidden,
      isPinned,
      collectionDisabled: disabledByCollection,
      canToggle: blockIds.length > 0 && !disabledByCollection,
      profiles: Array.from(profileSet),
      collections: collectionsList,
      enabled: !isDisabled && !isHidden && enabledByRuntime && !isErrored
    };
  });
}

function filterModules(entries, filters) {
  return entries.filter((entry) => {
    if (filters.profile !== 'all' && !entry.profiles.includes(filters.profile)) {
      return false;
    }
    if (filters.collection !== 'all' && !entry.collections.includes(filters.collection)) {
      return false;
    }
    if (filters.compatibility !== 'all' && entry.compatStatus !== filters.compatibility) {
      return false;
    }
    return true;
  });
}

function renderStatusCards(container, snapshot = {}) {
  container.innerHTML = '';
  const summaries = summarizeStatuses(snapshot);
  summaries.forEach((summary) => {
    const card = document.createElement('article');
    card.className = 'a11ytb-status-card';
    card.dataset.tone = summary.tone || 'info';

    const header = document.createElement('header');
    header.className = 'a11ytb-status-card-header';

    const label = document.createElement('span');
    label.className = 'a11ytb-status-label';
    label.textContent = summary.label || summary.id || '';

    const badge = document.createElement('span');
    badge.className = 'a11ytb-badge';
    if (summary.badge) {
      badge.textContent = summary.badge;
    } else {
      badge.hidden = true;
    }

    header.append(label, badge);

    const value = document.createElement('p');
    value.className = 'a11ytb-status-value';
    value.textContent = summary.value || '';
    value.setAttribute('aria-live', summary.live || 'polite');

    const detail = document.createElement('p');
    detail.className = 'a11ytb-status-detail';
    detail.textContent = summary.detail || '';
    detail.hidden = !summary.detail;

    const meta = document.createElement('dl');
    meta.className = 'a11ytb-status-meta';
    if (summary.metaLabels?.latency) {
      const dtLatency = document.createElement('dt');
      dtLatency.textContent = summary.metaLabels.latency;
      const ddLatency = document.createElement('dd');
      ddLatency.textContent = summary.insights?.latencyLabel || 'Non mesuré';
      meta.append(dtLatency, ddLatency);
    }
    if (summary.metaLabels?.compat) {
      const dtCompat = document.createElement('dt');
      dtCompat.textContent = summary.metaLabels.compat;
      const ddCompat = document.createElement('dd');
      ddCompat.textContent = summary.insights?.compatLabel || 'Pré-requis non déclarés';
      meta.append(dtCompat, ddCompat);
    }

    card.append(header, value, detail, meta);
    container.append(card);
  });
}

function createModuleCard(entry, actions) {
  const card = document.createElement('article');
  card.className = 'a11ytb-admin-module-card';
  card.dataset.compat = entry.compatStatus;
  card.setAttribute('role', 'listitem');

  const header = document.createElement('header');
  header.className = 'a11ytb-admin-module-card-header';

  const title = document.createElement('h3');
  title.className = 'a11ytb-admin-module-title';
  title.textContent = entry.manifest.name || entry.id;

  const statusBadge = createBadge(entry.status, entry.statusTone);
  statusBadge.setAttribute('aria-label', `Statut : ${entry.status}`);

  const compatBadge = createBadge(
    COMPATIBILITY_LABELS[entry.compatStatus] || COMPATIBILITY_LABELS.none,
    COMPATIBILITY_TONES[entry.compatStatus] || COMPATIBILITY_TONES.none
  );
  compatBadge.classList.add('a11ytb-admin-compat');
  compatBadge.setAttribute('aria-label', `Compatibilité : ${compatBadge.textContent}`);

  header.append(title, statusBadge, compatBadge);

  const description = document.createElement('p');
  description.className = 'a11ytb-admin-module-description';
  description.textContent = entry.manifest.description || 'Description à venir.';

  const meta = document.createElement('div');
  meta.className = 'a11ytb-admin-module-meta';

  const profileGroup = document.createElement('div');
  profileGroup.className = 'a11ytb-admin-module-meta-group';
  const profileLabel = document.createElement('span');
  profileLabel.className = 'a11ytb-admin-module-meta-label';
  profileLabel.textContent = 'Profils';
  const profileCount = document.createElement('span');
  profileCount.className = 'a11ytb-admin-counter';
  profileCount.textContent = entry.profiles.length.toString();
  profileCount.setAttribute('aria-label', `${entry.profiles.length} profil(s)`);
  const profileTags = document.createElement('div');
  profileTags.className = 'a11ytb-admin-tag-list';
  entry.profiles.slice(0, 4).forEach((profileId) => {
    profileTags.append(createTag(profileId));
  });
  if (entry.profiles.length > 4) {
    profileTags.append(createTag(`+${entry.profiles.length - 4}`));
  }
  profileGroup.append(profileLabel, profileCount, profileTags);

  const collectionGroup = document.createElement('div');
  collectionGroup.className = 'a11ytb-admin-module-meta-group';
  const collectionLabel = document.createElement('span');
  collectionLabel.className = 'a11ytb-admin-module-meta-label';
  collectionLabel.textContent = 'Collections';
  const collectionCount = document.createElement('span');
  collectionCount.className = 'a11ytb-admin-counter';
  collectionCount.textContent = entry.collections.length.toString();
  collectionCount.setAttribute('aria-label', `${entry.collections.length} collection(s)`);
  const collectionTags = document.createElement('div');
  collectionTags.className = 'a11ytb-admin-tag-list';
  entry.collections.slice(0, 4).forEach((collectionId) => {
    const data = collectionLookup.get(collectionId);
    const label = data?.label || collectionId;
    collectionTags.append(createTag(label));
  });
  if (entry.collections.length > 4) {
    collectionTags.append(createTag(`+${entry.collections.length - 4}`));
  }
  collectionGroup.append(collectionLabel, collectionCount, collectionTags);

  meta.append(profileGroup, collectionGroup);

  const metricsList = document.createElement('dl');
  metricsList.className = 'a11ytb-admin-metrics';

  const attempts = entry.metrics.attempts || 0;
  const successes = entry.metrics.successes || 0;
  const failures = entry.metrics.failures || 0;
  const lastAttempt = entry.metrics.lastAttemptAt || entry.runtime.lastAttemptAt;

  const metricsEntries = [
    ['Chargements', `${successes}/${attempts}`],
    ['Échecs', failures.toString()],
    ['Temps moyen', formatDuration(entry.metrics.timings?.combinedAverage)],
    ['Dernière tentative', formatDateRelative(lastAttempt)]
  ];

  metricsEntries.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    metricsList.append(dt, dd);
  });

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'a11ytb-admin-actions';

  const enableButton = document.createElement('button');
  enableButton.type = 'button';
  enableButton.className = 'a11ytb-admin-action';
  enableButton.textContent = entry.enabled ? 'Désactiver' : 'Activer';
  enableButton.disabled = !actions.canToggle(entry);
  enableButton.setAttribute('aria-pressed', entry.enabled ? 'true' : 'false');
  enableButton.addEventListener('click', () => actions.toggleEnabled(entry));
  if (enableButton.disabled && entry.collectionDisabled) {
    enableButton.title = 'Désactivation gérée par une collection : ajustez-la depuis le panneau Collections.';
  }

  const pinButton = document.createElement('button');
  pinButton.type = 'button';
  pinButton.className = 'a11ytb-admin-action';
  pinButton.textContent = entry.isPinned ? 'Retirer l’épingle' : 'Épingler';
  pinButton.disabled = !actions.canPin(entry);
  pinButton.setAttribute('aria-pressed', entry.isPinned ? 'true' : 'false');
  pinButton.addEventListener('click', () => actions.togglePin(entry));
  if (pinButton.disabled && entry.collectionDisabled) {
    pinButton.title = 'Épinglage indisponible lorsque la collection est désactivée.';
  }

  actionsContainer.append(enableButton, pinButton);

  const liveRegion = document.createElement('p');
  liveRegion.className = 'a11ytb-sr-only';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.textContent = `${entry.status}. Compatibilité ${compatBadge.textContent}.`;

  card.append(header, description, meta, metricsList, actionsContainer, liveRegion);
  return card;
}

function updateRuntimePanel(panel, entries) {
  const total = entries.length;
  const active = entries.filter((entry) => entry.enabled).length;
  const pinned = entries.filter((entry) => entry.isPinned).length;
  const disabled = entries.filter((entry) => entry.isDisabled || !entry.enabled).length;
  const loaded = entries.filter((entry) => entry.runtime.loaded || entry.runtime.state === 'ready').length;
  const attempts = entries.reduce((acc, entry) => acc + (entry.metrics.attempts || 0), 0);
  const successes = entries.reduce((acc, entry) => acc + (entry.metrics.successes || 0), 0);
  const failures = entries.reduce((acc, entry) => acc + (entry.metrics.failures || 0), 0);

  panel.counters.total.textContent = total.toString();
  panel.counters.active.textContent = active.toString();
  panel.counters.pinned.textContent = pinned.toString();
  panel.counters.disabled.textContent = disabled.toString();
  panel.counters.loaded.textContent = loaded.toString();
  panel.counters.attempts.textContent = attempts.toString();
  panel.counters.failures.textContent = failures.toString();

  const totalOutcomes = successes + failures;
  const successRatio = totalOutcomes > 0 ? Math.round((successes / totalOutcomes) * 100) : 0;
  panel.meter.style.setProperty('--a11ytb-meter-progress', `${successRatio}%`);
  panel.meter.setAttribute('aria-valuenow', successRatio.toString());
  panel.meter.setAttribute('aria-valuetext', `${successes} chargement(s) réussi(s) sur ${totalOutcomes}`);
  panel.status.textContent = total
    ? `Modules actifs : ${active} sur ${total}. Chargements réussis à ${successRatio} %.`
    : 'En attente de données runtime.';
}

function updateFilterOptions(select, options, currentValue) {
  const existing = Array.from(select.options).map((option) => option.value);
  const nextValues = options.map((option) => option.value);
  const same = existing.length === nextValues.length && existing.every((value, index) => value === nextValues[index]);
  if (!same) {
    select.innerHTML = '';
    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      select.append(opt);
    });
  }
  if (select.value !== currentValue) {
    select.value = currentValue;
  }
}

function buildRuntimePanel() {
  const panel = document.createElement('aside');
  panel.className = 'a11ytb-runtime-panel';

  const title = document.createElement('h2');
  title.className = 'a11ytb-runtime-title';
  title.textContent = 'Observabilité runtime';

  const counters = document.createElement('dl');
  counters.className = 'a11ytb-runtime-counters';

  const entries = [
    ['Modules suivis', 'total'],
    ['Actifs', 'active'],
    ['Épinglés', 'pinned'],
    ['Désactivés', 'disabled'],
    ['Chargés', 'loaded'],
    ['Tentatives', 'attempts'],
    ['Échecs', 'failures']
  ];

  const counterRefs = {};
  entries.forEach(([label, key]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = '0';
    dd.id = `a11ytb-runtime-${key}`;
    counterRefs[key] = dd;
    counters.append(dt, dd);
  });

  const meterLabel = document.createElement('span');
  meterLabel.className = 'a11ytb-runtime-meter-label';
  meterLabel.textContent = 'Ratio de succès';

  const meter = document.createElement('div');
  meter.className = 'a11ytb-runtime-meter';
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  meter.setAttribute('aria-valuetext', 'Aucun chargement observé');

  const liveRegion = document.createElement('p');
  liveRegion.className = 'a11ytb-sr-only';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.textContent = 'En attente de données runtime.';

  panel.append(title, counters, meterLabel, meter, liveRegion);

  return {
    element: panel,
    counters: counterRefs,
    meter,
    status: liveRegion
  };
}

function main() {
  const mount = document.getElementById('a11ytb-admin-app');
  if (!mount) {
    return;
  }

  mount.classList.add('a11ytb-admin-app');
  mount.removeAttribute('aria-busy');

  const introSection = document.createElement('section');
  introSection.className = 'a11ytb-admin-section';

  const introTitle = document.createElement('h2');
  introTitle.className = 'a11ytb-admin-section-title';
  introTitle.textContent = 'Guide rapide';

  const introList = document.createElement('ol');
  introList.className = 'a11ytb-admin-steps';
  ['Ouvrez n’importe quelle page publique pour afficher la boîte à outils.',
    'Utilisez Alt+Shift+A ou le bouton flottant pour la barre latérale.',
    'Explorez les vues Modules, Options & Profils puis Organisation.']
    .forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      introList.append(item);
    });

  const tipsTitle = document.createElement('h3');
  tipsTitle.className = 'a11ytb-admin-subtitle';
  tipsTitle.textContent = 'Raccourcis utiles';

  const tipsList = document.createElement('ul');
  tipsList.className = 'a11ytb-admin-shortcuts';
  ['Alt+Shift+O : Options & Profils', 'Alt+Shift+G : Organisation des modules', 'Alt+Shift+H : Raccourcis complets']
    .forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      tipsList.append(item);
    });

  introSection.append(introTitle, introList, tipsTitle, tipsList);

  const dashboard = document.createElement('section');
  dashboard.className = 'a11ytb-admin-section';

  const dashboardHeader = document.createElement('div');
  dashboardHeader.className = 'a11ytb-admin-section-header';

  const dashboardTitle = document.createElement('h2');
  dashboardTitle.className = 'a11ytb-admin-section-title';
  dashboardTitle.textContent = 'Suivi des modules';

  const dashboardDescription = document.createElement('p');
  dashboardDescription.className = 'a11ytb-admin-section-description';
  dashboardDescription.textContent = 'Filtrez le catalogue, examinez la compatibilité et déclenchez les actions directes sur les modules.';

  dashboardHeader.append(dashboardTitle, dashboardDescription);

  const statusGrid = document.createElement('div');
  statusGrid.className = 'a11ytb-admin-status-grid';

  const filterBar = document.createElement('div');
  filterBar.className = 'a11ytb-admin-filters';

  const buildSelect = (id, label) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'a11ytb-admin-filter';
    wrapper.setAttribute('for', id);
    wrapper.textContent = label;
    const select = document.createElement('select');
    select.id = id;
    select.className = 'a11ytb-admin-filter-select';
    select.setAttribute('aria-label', label);
    wrapper.append(select);
    return { wrapper, select };
  };

  const profileFilter = buildSelect('a11ytb-filter-profile', 'Profils');
  const collectionFilter = buildSelect('a11ytb-filter-collection', 'Collections');
  const compatibilityFilter = buildSelect('a11ytb-filter-compat', 'Compatibilité');

  filterBar.append(profileFilter.wrapper, collectionFilter.wrapper, compatibilityFilter.wrapper);

  const moduleGrid = document.createElement('div');
  moduleGrid.className = 'a11ytb-admin-module-grid';
  moduleGrid.setAttribute('role', 'list');

  const emptyState = document.createElement('p');
  emptyState.className = 'a11ytb-admin-empty';
  emptyState.textContent = 'Aucun module ne correspond aux filtres sélectionnés.';
  emptyState.hidden = true;

  dashboard.append(dashboardHeader, statusGrid, filterBar, moduleGrid, emptyState);

  const runtimePanel = buildRuntimePanel();

  const layout = document.createElement('div');
  layout.className = 'a11ytb-admin-app-grid';
  const mainColumn = document.createElement('div');
  mainColumn.className = 'a11ytb-admin-app-main';
  mainColumn.append(introSection, dashboard);
  layout.append(mainColumn, runtimePanel.element);

  mount.innerHTML = '';
  mount.append(layout);

  const filters = {
    profile: 'all',
    collection: 'all',
    compatibility: 'all'
  };

  const defaultOptions = {
    profile: [{ value: 'all', label: 'Tous les profils' }],
    collection: [{ value: 'all', label: 'Toutes les collections' }],
    compatibility: [
      { value: 'all', label: 'Compatibilité : toutes' },
      { value: 'full', label: 'Compatibles' },
      { value: 'partial', label: 'À risques' },
      { value: 'unknown', label: 'À vérifier' },
      { value: 'none', label: 'Non déclarées' }
    ]
  };

  updateFilterOptions(profileFilter.select, defaultOptions.profile, filters.profile);
  updateFilterOptions(collectionFilter.select, defaultOptions.collection, filters.collection);
  updateFilterOptions(compatibilityFilter.select, defaultOptions.compatibility, filters.compatibility);

  let currentSnapshot = {};
  let currentEntries = [];

  const actions = {
    canToggle(entry) {
      return entry.canToggle && typeof previewState?.set === 'function';
    },
    canPin(entry) {
      return entry.canToggle && typeof previewState?.set === 'function';
    },
    toggleEnabled(entry) {
      if (!this.canToggle(entry)) return;
      const blockIds = entry.blockIds;
      const disabled = new Set(ensureArray(previewState.get('ui.disabled')));
      const pinned = new Set(ensureArray(previewState.get('ui.pinned')));
      if (entry.enabled) {
        blockIds.forEach((blockId) => {
          disabled.add(blockId);
          pinned.delete(blockId);
        });
      } else {
        blockIds.forEach((blockId) => disabled.delete(blockId));
      }
      previewState.set('ui.disabled', Array.from(disabled));
      previewState.set('ui.pinned', Array.from(pinned));
    },
    togglePin(entry) {
      if (!this.canPin(entry)) return;
      const blockIds = entry.blockIds;
      const current = ensureArray(previewState.get('ui.pinned'));
      let next = current.filter((id) => !blockIds.includes(id));
      if (!entry.isPinned) {
        next = [...blockIds, ...next];
      }
      previewState.set('ui.pinned', next);
    }
  };

  function applyFilters() {
    const filtered = filterModules(currentEntries, filters);
    moduleGrid.innerHTML = '';
    if (!filtered.length) {
      emptyState.hidden = false;
      moduleGrid.hidden = true;
    } else {
      emptyState.hidden = true;
      moduleGrid.hidden = false;
      filtered.forEach((entry) => {
        moduleGrid.append(createModuleCard(entry, actions));
      });
    }
  }

  function updateFiltersFromSnapshot(snapshot) {
    const { list } = computeProfiles(snapshot);
    const profileOptions = [{ value: 'all', label: 'Tous les profils' }, ...list.map((entry) => ({
      value: entry.id,
      label: entry.label
    }))];
    updateFilterOptions(profileFilter.select, profileOptions, filters.profile);

    const collectionOptions = [{ value: 'all', label: 'Toutes les collections' }, ...moduleCollections.map((collection) => ({
      value: collection.id,
      label: collection.label || collection.id
    }))];
    updateFilterOptions(collectionFilter.select, collectionOptions, filters.collection);
  }

  function sync(snapshot) {
    currentSnapshot = snapshot || {};
    renderStatusCards(statusGrid, currentSnapshot);
    currentEntries = buildModuleEntries(currentSnapshot);
    updateRuntimePanel(runtimePanel, currentEntries);
    updateFiltersFromSnapshot(currentSnapshot);
    applyFilters();
  }

  profileFilter.select.addEventListener('change', () => {
    filters.profile = profileFilter.select.value;
    applyFilters();
  });

  collectionFilter.select.addEventListener('change', () => {
    filters.collection = collectionFilter.select.value;
    applyFilters();
  });

  compatibilityFilter.select.addEventListener('change', () => {
    filters.compatibility = compatibilityFilter.select.value;
    applyFilters();
  });

  const previewFrame = document.querySelector('.a11ytb-admin-preview iframe');
  const connectionStatus = document.createElement('p');
  connectionStatus.className = 'a11ytb-admin-connection';
  connectionStatus.setAttribute('role', 'status');
  connectionStatus.setAttribute('aria-live', 'polite');
  connectionStatus.textContent = 'Connexion à l’aperçu en cours…';
  dashboardHeader.append(connectionStatus);

  function attemptConnection() {
    if (!previewFrame || !previewFrame.contentWindow) {
      connectionStatus.textContent = 'Aucun aperçu disponible pour synchroniser les données.';
      return;
    }
    try {
      const candidate = previewFrame.contentWindow;
      const api = candidate?.a11ytb?.state;
      if (!api || typeof api.get !== 'function') {
        connectionStatus.textContent = 'Chargement de l’aperçu…';
        window.setTimeout(attemptConnection, 500);
        return;
      }
      previewState = api;
      connectionStatus.textContent = 'Aperçu connecté. Les données sont synchronisées.';
      const snapshot = previewState.get();
      sync(snapshot);
      if (typeof previewState.on === 'function') {
        previewState.on((next) => {
          sync(next);
        });
      }
    } catch (error) {
      connectionStatus.textContent = 'Impossible de lire les données de l’aperçu (origine différente).';
    }
  }

  attemptConnection();
  if (previewFrame) {
    previewFrame.addEventListener('load', attemptConnection);
  }

  sync(currentSnapshot);
}

let previewState = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
