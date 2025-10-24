import { flattenedModuleCollections } from '../module-collections.js';
import { summarizeStatuses } from '../status-center.js';
import { COMPATIBILITY_LABELS, COMPATIBILITY_TONES } from './constants.js';
import {
  buildModuleEntries,
  computeMetricsOverview,
  computeProfiles,
  computeProfileCollectionSuggestions,
  filterModules,
  sortModules,
} from './data-model.js';
import { createAdminLayout } from './layout.js';
import { buildRuntimePanel, updateRuntimePanel } from './runtime-panel.js';
import { createModuleCard } from './render/module-card.js';
import { createModuleAvailabilityPanel } from './render/module-availability-panel.js';
import { renderManifestDiff } from './render/manifest-diff.js';
import { renderStatusCards } from './render/status-cards.js';
import { createMetricsDashboard } from './render/metrics-dashboard.js';
import {
  createBadge,
  ensureArray,
  formatDateRelative,
  getGeminiConfig,
  getLlavaConfig,
  updateFilterOptions,
} from './utils.js';

const DEFAULT_FILTERS = {
  availability: 'all',
  profile: 'all',
  collection: 'all',
  compatibility: 'all',
  sort: 'alpha',
  search: '',
  onlyPinned: false,
};

let previewState = null;
let availabilityController = null;

export function initAdminDashboard(mount) {
  if (!mount) {
    return;
  }

  mount.classList.add('a11ytb-admin-app');
  mount.removeAttribute('aria-busy');

  const runtimePanel = buildRuntimePanel();
  const layout = createAdminLayout(runtimePanel);
  const metricsView = createMetricsDashboard(layout.metrics);

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
      setNoticeText(layout.geminiStatus, `Clé Gemini configurée (${mask}) – ${quotaLabel}.`);
    } else {
      setNoticeText(
        layout.geminiStatus,
        'Aucune clé Gemini enregistrée. Les intégrations IA restent désactivées.'
      );
    }
  }

  const llavaConfig = getLlavaConfig();
  if (layout.llavaStatus) {
    layout.llavaStatus.hidden = false;
    if (llavaConfig?.isReady) {
      const endpointLabel = llavaConfig.endpoint
        ? `endpoint ${llavaConfig.endpoint}`
        : 'endpoint actif';
      const secretLabel = llavaConfig.maskedToken ? llavaConfig.maskedToken : 'secret masqué';
      setNoticeText(layout.llavaStatus, `LLaVA prêt (${endpointLabel} • ${secretLabel}).`);
    } else {
      let message =
        'LLaVA non configuré. Renseignez un endpoint et un secret chiffré dans les réglages.';
      if (llavaConfig?.tokenError) {
        message +=
          ' Le secret stocké est illisible : regénérez-le puis réenregistrez le formulaire.';
      }
      setNoticeText(layout.llavaStatus, message);
    }
  }

  const compatibilityOptions = [
    { value: 'all', label: 'Compatibilité : toutes' },
    { value: 'full', label: 'Compatibles' },
    { value: 'partial', label: 'À risques' },
    { value: 'unknown', label: 'À vérifier' },
    { value: 'none', label: 'Non déclarées' },
  ];
  const sortOptions = [
    { value: 'alpha', label: 'Tri alphabétique' },
    { value: 'status', label: 'Par statut' },
    { value: 'compat', label: 'Par compatibilité' },
    { value: 'recent', label: 'Plus récents' },
  ];

  updateFilterOptions(layout.filters.compatibility, compatibilityOptions, filters.compatibility);
  updateFilterOptions(layout.filters.sort, sortOptions, filters.sort);

  layout.filters.search.value = filters.search;
  layout.filters.pinned.checked = filters.onlyPinned;

  let currentSnapshot = {};
  let currentEntries = [];
  let currentSummaries = [];

  function setNoticeText(element, message) {
    if (!element) return;
    const target = element.querySelector('p') || element;
    target.textContent = message;
  }

  function setSelectValue(select, value) {
    if (!select) return;
    const options = Array.from(select.options || []);
    if (options.some((option) => option.value === value)) {
      select.value = value;
    }
  }

  function applySuggestionFilters(profileId, collectionId) {
    if (profileId && layout.filters.profile) {
      filters.profile = profileId;
      setSelectValue(layout.filters.profile, profileId);
    }
    if (collectionId && layout.filters.collection) {
      filters.collection = collectionId;
      setSelectValue(layout.filters.collection, collectionId);
    }
    renderModules(currentEntries);
  }

  function updateAvailabilityPanel() {
    if (availabilityController) {
      availabilityController.update(currentEntries, { filters });
    }
  }

  function focusModule(entry) {
    if (!entry) return;
    filters.search = entry.id;
    layout.filters.search.value = entry.id;
    renderModules(currentEntries);
  }

  function updateManifestDiffView(summaries) {
    const source = Array.isArray(summaries) ? summaries : currentSummaries;
    if (Array.isArray(summaries)) {
      currentSummaries = summaries;
    }
    const manifestSummary = Array.isArray(source)
      ? source.find((entry) => entry.id === 'manifest-history')
      : null;
    const moduleId = manifestSummary?.insights?.manifestDiff?.moduleId;
    const moduleEntry = moduleId ? currentEntries.find((entry) => entry.id === moduleId) : null;
    renderManifestDiff(layout.manifestDiff, manifestSummary, moduleEntry, {
      onFocusModule(entry) {
        focusModule(entry);
      },
    });
  }

  function updateFiltersFromSnapshot(snapshot) {
    const { list } = computeProfiles(snapshot);
    const profileOptions = [
      { value: 'all', label: 'Tous les profils' },
      ...list.map((entry) => ({ value: entry.id, label: entry.label })),
    ];
    updateFilterOptions(layout.filters.profile, profileOptions, filters.profile);
    filters.profile = layout.filters.profile.value;

    const collectionOptions = [
      { value: 'all', label: 'Toutes les collections' },
      ...flattenedModuleCollections.map((collection) => {
        const indent = collection.depth > 0 ? `${' '.repeat(collection.depth * 2)}⤷ ` : '';
        return {
          value: collection.id,
          label: `${indent}${collection.label || collection.id}`.trim(),
          ariaLabel: collection.pathLabel || collection.label || collection.id,
        };
      }),
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
      updateAvailabilityPanel();
      updateManifestDiffView();
      return;
    }
    layout.emptyState.hidden = true;
    layout.moduleGrid.hidden = false;
    sorted.forEach((entry) => {
      layout.moduleGrid.append(createModuleCard(entry, actions));
    });
    updateAvailabilityPanel();
    updateManifestDiffView();
  }

  function renderSyncTimeline(events) {
    if (!layout.syncList || !layout.syncEmpty) return;
    const items = Array.isArray(events) ? events.slice(0, 6) : [];
    layout.syncList.innerHTML = '';
    if (!items.length) {
      layout.syncEmpty.hidden = false;
      layout.syncList.hidden = true;
      if (layout.syncStatus) {
        setNoticeText(
          layout.syncStatus?.closest('.notice') || layout.syncStatus,
          'Aucune synchronisation enregistrée pour le moment.'
        );
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
      connector.textContent =
        entry.connector === 'all' ? 'Connecteurs activité' : `Connecteur ${entry.connector}`;

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
      const jobLabel =
        entry.jobType === 'bulk' ? `${count} entrée${count > 1 ? 's' : ''}` : 'Entrée unique';
      const timeLabel = formatDateRelative(entry.timestamp);
      meta.textContent = `${jobLabel} • ${timeLabel}`;

      item.append(head, meta);

      layout.syncList.append(item);
    });

    if (layout.syncStatus) {
      setNoticeText(
        layout.syncStatus?.closest('.notice') || layout.syncStatus,
        `Dernier envoi ${formatDateRelative(items[0].timestamp)}`
      );
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
        setNoticeText(
          layout.exportStatus?.closest('.notice') || layout.exportStatus,
          'Aucun export recensé.'
        );
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
      setNoticeText(
        layout.exportStatus?.closest('.notice') || layout.exportStatus,
        `Dernier export ${formatDateRelative(items[0].timestamp)}`
      );
    }
  }

  function renderProfileShareTimeline(events) {
    if (!layout.shareList || !layout.shareEmpty) return;
    const items = Array.isArray(events) ? events.slice(0, 8) : [];
    layout.shareList.innerHTML = '';
    if (!items.length) {
      layout.shareEmpty.hidden = false;
      layout.shareList.hidden = true;
      if (layout.shareStatus) {
        setNoticeText(
          layout.shareStatus?.closest('.notice') || layout.shareStatus,
          'Aucun partage enregistré.'
        );
      }
      return;
    }
    layout.shareEmpty.hidden = true;
    layout.shareList.hidden = false;
    items.forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-admin-share-item';

      const head = document.createElement('div');
      head.className = 'a11ytb-admin-share-head';

      const profile = document.createElement('span');
      profile.className = 'a11ytb-admin-share-profile';
      profile.textContent = entry.profileName || entry.profileId;

      const badge = document.createElement('span');
      badge.className = 'a11ytb-admin-share-badge';
      badge.dataset.status = entry.action || 'shared';
      switch (entry.action) {
        case 'revoked':
          badge.textContent = 'Arrêté';
          break;
        case 'updated':
          badge.textContent = 'Mis à jour';
          break;
        default:
          badge.textContent = 'Partagé';
      }

      head.append(profile, badge);

      const meta = document.createElement('p');
      meta.className = 'a11ytb-admin-share-meta';
      const count = Number.isFinite(entry.count) ? entry.count : 0;
      const countLabel =
        entry.action === 'revoked'
          ? 'Partage désactivé'
          : `${count || 0} destinataire${count > 1 ? 's' : ''}`;
      const timeLabel = formatDateRelative(entry.timestamp);
      meta.textContent = `${countLabel} • ${timeLabel}`;

      item.append(head, meta);

      const recipients = Array.isArray(entry.recipients) ? entry.recipients : [];
      if (recipients.length && entry.action !== 'revoked') {
        const list = document.createElement('ul');
        list.className = 'a11ytb-admin-share-recipients';
        list.setAttribute('role', 'list');
        recipients.slice(0, 6).forEach((recipient) => {
          const li = document.createElement('li');
          li.className = 'a11ytb-admin-share-recipient';
          li.textContent = recipient;
          list.append(li);
        });
        item.append(list);
      }

      layout.shareList.append(item);
    });

    if (layout.shareStatus) {
      setNoticeText(
        layout.shareStatus?.closest('.notice') || layout.shareStatus,
        `Dernier partage ${formatDateRelative(items[0].timestamp)}`
      );
    }
  }

  function renderAutomationTimeline(events) {
    if (!layout.automationList || !layout.automationEmpty) return;
    const items = Array.isArray(events) ? events.slice(0, 8) : [];
    layout.automationList.innerHTML = '';
    if (!items.length) {
      layout.automationEmpty.hidden = false;
      layout.automationList.hidden = true;
      if (layout.automationStatus) {
        setNoticeText(
          layout.automationStatus?.closest('.notice') || layout.automationStatus,
          'Aucune automatisation enregistrée.'
        );
      }
      return;
    }
    layout.automationEmpty.hidden = true;
    layout.automationList.hidden = false;
    items.forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-admin-automation-item';

      const head = document.createElement('div');
      head.className = 'a11ytb-admin-automation-head';

      const profile = document.createElement('span');
      profile.className = 'a11ytb-admin-automation-profile';
      profile.textContent = entry.profileName || entry.profileId;

      const badge = document.createElement('span');
      badge.className = 'a11ytb-admin-automation-badge';
      const automationStatus = entry.action || 'automated';
      badge.dataset.status = automationStatus;
      switch (automationStatus) {
        case 'apply-shortcuts':
          badge.textContent = 'Appliqué';
          break;
        case 'update-shortcuts':
          badge.textContent = 'Configuré';
          break;
        default:
          badge.textContent = 'Automatisé';
      }

      head.append(profile, badge);

      const meta = document.createElement('p');
      meta.className = 'a11ytb-admin-automation-meta';
      const presets = Number.isFinite(entry.presets) ? entry.presets : 0;
      const invalid = Number.isFinite(entry.invalid) ? entry.invalid : 0;
      const parts = [];
      parts.push(
        presets ? `${presets} raccourci${presets > 1 ? 's' : ''}` : 'Aucun raccourci personnalisé'
      );
      if (invalid > 0) {
        parts.push(`${invalid} ignoré${invalid > 1 ? 's' : ''}`);
      }
      parts.push(formatDateRelative(entry.timestamp));
      meta.textContent = parts.join(' • ');

      item.append(head, meta);
      layout.automationList.append(item);
    });

    if (layout.automationStatus) {
      setNoticeText(
        layout.automationStatus?.closest('.notice') || layout.automationStatus,
        `Dernière automatisation ${formatDateRelative(items[0].timestamp)}`
      );
    }
  }

  function renderProfileSuggestions(entries, snapshot) {
    if (!layout.suggestionsList || !layout.suggestionsEmpty) return;
    const suggestions = computeProfileCollectionSuggestions(entries, snapshot);
    layout.suggestionsList.innerHTML = '';
    if (!Array.isArray(suggestions) || !suggestions.length) {
      layout.suggestionsEmpty.hidden = false;
      layout.suggestionsList.hidden = true;
      if (layout.suggestionsStatus) {
        setNoticeText(
          layout.suggestionsStatus?.closest('.notice') || layout.suggestionsStatus,
          'Aucune recommandation disponible.'
        );
      }
      return;
    }

    layout.suggestionsEmpty.hidden = true;
    layout.suggestionsList.hidden = false;

    const totalRecommendations = suggestions.reduce(
      (count, entry) => count + ensureArray(entry.suggestions).length,
      0
    );
    if (layout.suggestionsStatus) {
      setNoticeText(
        layout.suggestionsStatus?.closest('.notice') || layout.suggestionsStatus,
        `${totalRecommendations} recommandation${
          totalRecommendations > 1 ? 's' : ''
        } pour ${suggestions.length} profil${suggestions.length > 1 ? 's' : ''}.`
      );
    }

    suggestions.forEach((profileEntry) => {
      const profileCard = document.createElement('article');
      profileCard.className = 'a11ytb-admin-suggestion-profile';
      profileCard.setAttribute('role', 'listitem');
      profileCard.dataset.profileId = profileEntry.profileId;

      const head = document.createElement('header');
      head.className = 'a11ytb-admin-suggestion-head';

      const title = document.createElement('h3');
      title.className = 'a11ytb-admin-suggestion-title';
      title.textContent = profileEntry.profileLabel || profileEntry.profileId;

      const countBadge = createBadge(
        `${profileEntry.suggestions.length} recommandation${
          profileEntry.suggestions.length > 1 ? 's' : ''
        }`,
        'info'
      );
      countBadge.classList.add('a11ytb-admin-suggestion-count');

      head.append(title, countBadge);

      const missingTotal = profileEntry.suggestions.reduce(
        (sum, suggestion) => sum + ensureArray(suggestion.missingModules).length,
        0
      );
      const profileMeta = document.createElement('p');
      profileMeta.className = 'a11ytb-admin-suggestion-meta';
      profileMeta.textContent = missingTotal
        ? `${missingTotal} module${missingTotal > 1 ? 's' : ''} à compléter.`
        : 'Modules à surveiller.';

      const suggestionList = document.createElement('ul');
      suggestionList.className = 'a11ytb-admin-suggestion-items';
      suggestionList.setAttribute('role', 'list');

      profileEntry.suggestions.slice(0, 4).forEach((suggestion) => {
        const item = document.createElement('li');
        item.className = 'a11ytb-admin-suggestion-item';
        item.dataset.tone = suggestion.tone || 'info';

        const itemHead = document.createElement('div');
        itemHead.className = 'a11ytb-admin-suggestion-item-head';

        const name = document.createElement('h4');
        name.className = 'a11ytb-admin-suggestion-name';
        name.textContent = suggestion.label;

        const toneBadge = createBadge(
          suggestion.tone === 'alert'
            ? 'Blocage'
            : suggestion.tone === 'warning'
              ? 'À compléter'
              : 'À vérifier',
          suggestion.tone || 'info'
        );
        toneBadge.classList.add('a11ytb-admin-suggestion-badge');

        const compatBadge = createBadge(
          COMPATIBILITY_LABELS[suggestion.compatStatus] || COMPATIBILITY_LABELS.none,
          COMPATIBILITY_TONES[suggestion.compatStatus] || COMPATIBILITY_TONES.none
        );
        compatBadge.classList.add('a11ytb-admin-suggestion-compat');

        itemHead.append(name, toneBadge, compatBadge);

        const coverage = document.createElement('p');
        coverage.className = 'a11ytb-admin-suggestion-coverage';
        coverage.textContent = `${suggestion.coverage.matched}/${suggestion.coverage.total} modules alignés`;

        item.append(itemHead, coverage);

        if (suggestion.missingModules.length) {
          const missing = document.createElement('p');
          missing.className = 'a11ytb-admin-suggestion-missing';
          const missingNames = suggestion.missingModules
            .slice(0, 3)
            .map((module) => module.label)
            .join(', ');
          const extra = suggestion.missingModules.length > 3 ? '…' : '';
          missing.textContent = `À ajouter : ${missingNames}${extra}`;
          item.append(missing);
        }

        if (suggestion.flags.length) {
          const flagGroup = document.createElement('div');
          flagGroup.className = 'a11ytb-admin-suggestion-flags';
          suggestion.flags.slice(0, 3).forEach((flag) => {
            const flagBadge = createBadge(flag.label, flag.tone || 'info');
            flagBadge.classList.add('a11ytb-admin-suggestion-flag');
            flagGroup.append(flagBadge);
          });
          item.append(flagGroup);
        }

        if (suggestion.requires.length) {
          const requiresList = document.createElement('ul');
          requiresList.className = 'a11ytb-admin-suggestion-requires';
          requiresList.setAttribute('role', 'list');
          suggestion.requires.slice(0, 3).forEach((requirement) => {
            const requireItem = document.createElement('li');
            requireItem.className = 'a11ytb-admin-suggestion-require';
            requireItem.textContent = requirement.label;
            if (requirement.reason) {
              const detail = document.createElement('span');
              detail.className = 'a11ytb-admin-suggestion-require-detail';
              detail.textContent = requirement.reason;
              requireItem.append(detail);
            }
            requiresList.append(requireItem);
          });
          item.append(requiresList);
        }

        if (suggestion.children.length) {
          const childList = document.createElement('ul');
          childList.className = 'a11ytb-admin-suggestion-children';
          childList.setAttribute('role', 'list');
          suggestion.children.slice(0, 2).forEach((child) => {
            const childItem = document.createElement('li');
            childItem.className = 'a11ytb-admin-suggestion-child';
            childItem.textContent = `${child.label} (${child.matched}/${child.total})`;
            if (child.missingModules.length) {
              const detail = document.createElement('span');
              detail.className = 'a11ytb-admin-suggestion-child-missing';
              const childNames = child.missingModules
                .slice(0, 2)
                .map((module) => module.label)
                .join(', ');
              detail.textContent = `Manque : ${childNames}${
                child.missingModules.length > 2 ? '…' : ''
              }`;
              childItem.append(detail);
            }
            childList.append(childItem);
          });
          item.append(childList);
        }

        const actions = document.createElement('div');
        actions.className = 'a11ytb-admin-suggestion-actions';
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'a11ytb-admin-suggestion-button';
        openButton.textContent = 'Afficher ces modules';
        openButton.addEventListener('click', () => {
          applySuggestionFilters(profileEntry.profileId, suggestion.id);
        });
        actions.append(openButton);
        item.append(actions);

        suggestionList.append(item);
      });

      profileCard.append(head, profileMeta, suggestionList);
      layout.suggestionsList.append(profileCard);
    });
  }

  function sync(snapshot) {
    currentSnapshot = snapshot || {};
    const summaries = summarizeStatuses(currentSnapshot);
    renderStatusCards(layout.statusGrid, summaries);
    updateManifestDiffView(summaries);
    currentEntries = buildModuleEntries(currentSnapshot);
    metricsView.update(computeMetricsOverview(currentEntries, currentSnapshot));
    updateRuntimePanel(runtimePanel, currentEntries);
    updateFiltersFromSnapshot(currentSnapshot);
    renderModules(currentEntries);
    const collaboration = currentSnapshot.collaboration || {};
    renderSyncTimeline(collaboration.syncs);
    renderExportTimeline(collaboration.exports);
    renderProfileShareTimeline(collaboration.profileShares);
    renderAutomationTimeline(collaboration.automations);
    renderProfileSuggestions(currentEntries, currentSnapshot);
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
    },
  };

  availabilityController = createModuleAvailabilityPanel(layout.availability, {
    actions,
    onAvailabilityChange(bucketId) {
      filters.availability = bucketId === 'all' ? 'all' : bucketId;
      renderModules(currentEntries);
    },
    onSelectProfile(item) {
      if (!item?.id) return;
      filters.profile = item.id;
      setSelectValue(layout.filters.profile, item.id);
      renderModules(currentEntries);
    },
    onSelectCollection(item) {
      if (!item?.id) return;
      filters.collection = item.id;
      setSelectValue(layout.filters.collection, item.id);
      renderModules(currentEntries);
    },
    onFocusModule(entry) {
      focusModule(entry);
    },
  });

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
      setNoticeText(layout.connectionStatus, 'Aucun aperçu disponible pour synchroniser les données.');
      return;
    }
    try {
      const candidate = previewFrame.contentWindow;
      const api = candidate?.a11ytb?.state;
      if (!api || typeof api.get !== 'function') {
        setNoticeText(layout.connectionStatus, 'Chargement de l’aperçu…');
        window.setTimeout(attemptConnection, 500);
        return;
      }
      previewState = api;
      setNoticeText(layout.connectionStatus, 'Aperçu connecté. Les données sont synchronisées.');
      const snapshot = previewState.get();
      sync(snapshot);
      if (typeof previewState.on === 'function') {
        previewState.on((next) => {
          sync(next);
        });
      }
    } catch (error) {
      setNoticeText(
        layout.connectionStatus,
        'Impossible de lire les données de l’aperçu (origine différente).'
      );
    }
  }

  attemptConnection();
  if (previewFrame) {
    previewFrame.addEventListener('load', attemptConnection);
  }

  sync(currentSnapshot);
}
