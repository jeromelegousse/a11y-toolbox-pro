import { moduleCollections } from '../module-collections.js';
import { summarizeStatuses } from '../status-center.js';
import { buildModuleEntries, computeProfiles, filterModules, sortModules } from './data-model.js';
import { createAdminLayout } from './layout.js';
import { buildRuntimePanel, updateRuntimePanel } from './runtime-panel.js';
import { createModuleCard } from './render/module-card.js';
import { renderStatusCards } from './render/status-cards.js';
import { ensureArray, formatDateRelative, getGeminiConfig, updateFilterOptions } from './utils.js';

const DEFAULT_FILTERS = {
  profile: 'all',
  collection: 'all',
  compatibility: 'all',
  sort: 'alpha',
  search: '',
  onlyPinned: false
};

let previewState = null;

export function initAdminDashboard(mount) {
  if (!mount) {
    return;
  }

  mount.classList.add('a11ytb-admin-app');
  mount.removeAttribute('aria-busy');

  const runtimePanel = buildRuntimePanel();
  const layout = createAdminLayout(runtimePanel);

  mount.innerHTML = '';
  mount.append(layout.root);

  const filters = { ...DEFAULT_FILTERS };

  const geminiConfig = getGeminiConfig();
  if (layout.geminiStatus) {
    layout.geminiStatus.hidden = false;
    if (geminiConfig?.hasKey) {
      const mask = geminiConfig.masked || '••••••••';
      const quota = Number.isFinite(geminiConfig.quota) ? geminiConfig.quota : null;
      const quotaLabel = quota === null ? 'quota non précisé' : `${quota} requête(s)/min`;
      layout.geminiStatus.textContent = `Clé Gemini configurée (${mask}) – ${quotaLabel}.`;
    } else {
      layout.geminiStatus.textContent = 'Aucune clé Gemini enregistrée. Les intégrations IA restent désactivées.';
    }
  }

  const compatibilityOptions = [
    { value: 'all', label: 'Compatibilité : toutes' },
    { value: 'full', label: 'Compatibles' },
    { value: 'partial', label: 'À risques' },
    { value: 'unknown', label: 'À vérifier' },
    { value: 'none', label: 'Non déclarées' }
  ];
  const sortOptions = [
    { value: 'alpha', label: 'Tri alphabétique' },
    { value: 'status', label: 'Par statut' },
    { value: 'compat', label: 'Par compatibilité' },
    { value: 'recent', label: 'Plus récents' }
  ];

  updateFilterOptions(layout.filters.compatibility, compatibilityOptions, filters.compatibility);
  updateFilterOptions(layout.filters.sort, sortOptions, filters.sort);

  layout.filters.search.value = filters.search;
  layout.filters.pinned.checked = filters.onlyPinned;

  let currentSnapshot = {};
  let currentEntries = [];

  function updateFiltersFromSnapshot(snapshot) {
    const { list } = computeProfiles(snapshot);
    const profileOptions = [
      { value: 'all', label: 'Tous les profils' },
      ...list.map((entry) => ({ value: entry.id, label: entry.label }))
    ];
    updateFilterOptions(layout.filters.profile, profileOptions, filters.profile);
    filters.profile = layout.filters.profile.value;

    const collectionOptions = [
      { value: 'all', label: 'Toutes les collections' },
      ...moduleCollections.map((collection) => ({
        value: collection.id,
        label: collection.label || collection.id
      }))
    ];
    updateFilterOptions(layout.filters.collection, collectionOptions, filters.collection);
    filters.collection = layout.filters.collection.value;
  }

  function renderModules(entries) {
    const filtered = filterModules(entries, filters);
    const sorted = sortModules(filtered, filters.sort);
    layout.moduleGrid.innerHTML = '';
    if (!sorted.length) {
      layout.emptyState.hidden = false;
      layout.moduleGrid.hidden = true;
      return;
    }
    layout.emptyState.hidden = true;
    layout.moduleGrid.hidden = false;
    sorted.forEach((entry) => {
      layout.moduleGrid.append(createModuleCard(entry, actions));
    });
  }

  function renderSyncTimeline(events) {
    if (!layout.syncList || !layout.syncEmpty) return;
    const items = Array.isArray(events) ? events.slice(0, 6) : [];
    layout.syncList.innerHTML = '';
    if (!items.length) {
      layout.syncEmpty.hidden = false;
      layout.syncList.hidden = true;
      if (layout.syncStatus) {
        layout.syncStatus.textContent = 'Aucune synchronisation enregistrée pour le moment.';
      }
      return;
    }
    layout.syncEmpty.hidden = true;
    layout.syncList.hidden = false;
    items.forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-admin-sync-item';

      const head = document.createElement('div');
      head.className = 'a11ytb-admin-sync-head';

      const connector = document.createElement('span');
      connector.className = 'a11ytb-admin-sync-connector';
      connector.textContent = entry.connector === 'all'
        ? 'Connecteurs activité'
        : `Connecteur ${entry.connector}`;

      const badge = document.createElement('span');
      badge.className = 'a11ytb-admin-sync-badge';
      badge.dataset.status = entry.status || 'queued';
      switch (entry.status) {
        case 'success':
          badge.textContent = 'Succès';
          break;
        case 'error':
          badge.textContent = 'Échec';
          break;
        default:
          badge.textContent = 'En attente';
      }

      head.append(connector, badge);

      const meta = document.createElement('p');
      meta.className = 'a11ytb-admin-sync-meta';
      const count = Number.isFinite(entry.count) ? entry.count : 0;
      const jobLabel = entry.jobType === 'bulk' ? `${count} entrée${count > 1 ? 's' : ''}` : 'Entrée unique';
      const timeLabel = formatDateRelative(entry.timestamp);
      meta.textContent = `${jobLabel} • ${timeLabel}`;

      item.append(head, meta);

      layout.syncList.append(item);
    });

    if (layout.syncStatus) {
      layout.syncStatus.textContent = `Dernier envoi ${formatDateRelative(items[0].timestamp)}`;
    }
  }

  function renderExportTimeline(events) {
    if (!layout.exportList || !layout.exportEmpty) return;
    const items = Array.isArray(events) ? events.slice(0, 8) : [];
    layout.exportList.innerHTML = '';
    if (!items.length) {
      layout.exportEmpty.hidden = false;
      layout.exportList.hidden = true;
      if (layout.exportStatus) {
        layout.exportStatus.textContent = 'Aucun export recensé.';
      }
      return;
    }
    layout.exportEmpty.hidden = true;
    layout.exportList.hidden = false;
    items.forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-admin-export-item';

      const head = document.createElement('div');
      head.className = 'a11ytb-admin-export-head';

      const format = document.createElement('span');
      format.className = 'a11ytb-admin-export-format';
      const formatLabel = String(entry.format || 'json').toUpperCase();
      format.textContent = `Export ${formatLabel}`;

      const badge = document.createElement('span');
      badge.className = 'a11ytb-admin-export-badge';
      badge.dataset.status = entry.status || 'success';
      badge.textContent = entry.status === 'error' ? 'Erreur' : 'Terminé';

      head.append(format, badge);

      const meta = document.createElement('p');
      meta.className = 'a11ytb-admin-export-meta';
      const modeLabel = entry.mode === 'clipboard' ? 'Presse-papiers' : 'Téléchargement';
      const timeLabel = formatDateRelative(entry.timestamp);
      const count = Number.isFinite(entry.count) ? entry.count : 0;
      meta.textContent = `${modeLabel} • ${count} entrée${count > 1 ? 's' : ''} • ${timeLabel}`;

      item.append(head, meta);
      layout.exportList.append(item);
    });

    if (layout.exportStatus) {
      layout.exportStatus.textContent = `Dernier export ${formatDateRelative(items[0].timestamp)}`;
    }
  }

  function sync(snapshot) {
    currentSnapshot = snapshot || {};
    const summaries = summarizeStatuses(currentSnapshot);
    renderStatusCards(layout.statusGrid, summaries);
    currentEntries = buildModuleEntries(currentSnapshot);
    updateRuntimePanel(runtimePanel, currentEntries);
    updateFiltersFromSnapshot(currentSnapshot);
    renderModules(currentEntries);
    const collaboration = currentSnapshot.collaboration || {};
    renderSyncTimeline(collaboration.syncs);
    renderExportTimeline(collaboration.exports);
  }

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

  layout.filters.profile.addEventListener('change', () => {
    filters.profile = layout.filters.profile.value;
    renderModules(currentEntries);
  });
  layout.filters.collection.addEventListener('change', () => {
    filters.collection = layout.filters.collection.value;
    renderModules(currentEntries);
  });
  layout.filters.compatibility.addEventListener('change', () => {
    filters.compatibility = layout.filters.compatibility.value;
    renderModules(currentEntries);
  });
  layout.filters.sort.addEventListener('change', () => {
    filters.sort = layout.filters.sort.value;
    renderModules(currentEntries);
  });
  layout.filters.search.addEventListener('input', () => {
    filters.search = layout.filters.search.value.trim();
    renderModules(currentEntries);
  });
  layout.filters.pinned.addEventListener('change', () => {
    filters.onlyPinned = layout.filters.pinned.checked;
    renderModules(currentEntries);
  });

  const previewFrame = document.querySelector('.a11ytb-admin-preview iframe');

  function attemptConnection() {
    if (!previewFrame || !previewFrame.contentWindow) {
      layout.connectionStatus.textContent = 'Aucun aperçu disponible pour synchroniser les données.';
      return;
    }
    try {
      const candidate = previewFrame.contentWindow;
      const api = candidate?.a11ytb?.state;
      if (!api || typeof api.get !== 'function') {
        layout.connectionStatus.textContent = 'Chargement de l’aperçu…';
        window.setTimeout(attemptConnection, 500);
        return;
      }
      previewState = api;
      layout.connectionStatus.textContent = 'Aperçu connecté. Les données sont synchronisées.';
      const snapshot = previewState.get();
      sync(snapshot);
      if (typeof previewState.on === 'function') {
        previewState.on((next) => {
          sync(next);
        });
      }
    } catch (error) {
      layout.connectionStatus.textContent = 'Impossible de lire les données de l’aperçu (origine différente).';
    }
  }

  attemptConnection();
  if (previewFrame) {
    previewFrame.addEventListener('load', attemptConnection);
  }

  sync(currentSnapshot);
}
