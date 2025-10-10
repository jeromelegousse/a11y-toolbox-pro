import { listBlocks, renderBlock, listModuleManifests } from './registry.js';

const DEFAULT_BLOCK_ICON = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 5h7v7H4V5zm9 0h7v7h-7V5zM4 12h7v7H4v-7zm9 0h7v7h-7v-7z"/></svg>';

export function mountUI({ root, state }) {
  const categories = [
    { id: 'all', label: 'Tous' },
    { id: 'vision', label: 'Vision' },
    { id: 'lecture', label: 'Lecture' },
    { id: 'interaction', label: 'Interaction' }
  ];

  const accessibilityProfiles = [
    {
      id: 'custom',
      label: 'Profil personnalisé',
      description: 'Ajustez librement les modules et leurs paramètres.'
    },
    {
      id: 'vision-low',
      label: 'Vision basse',
      description: 'Active le contraste renforcé, agrandit les espacements et met la lecture vocale en avant.',
      apply({ state, ensureEnabled, ensurePinned, ensureVisible }) {
        ensureEnabled(['contrast-controls', 'spacing-controls', 'tts-controls']);
        ensureVisible(['contrast-controls', 'spacing-controls', 'tts-controls']);
        ensurePinned(['contrast-controls', 'tts-controls']);
        state.set('contrast.enabled', true);
        state.set('spacing.lineHeight', 1.8);
        state.set('spacing.letterSpacing', 0.05);
        const currentRate = Number(state.get('tts.rate') ?? 1);
        if (!Number.isNaN(currentRate) && currentRate < 1) {
          state.set('tts.rate', 1);
        }
      }
    },
    {
      id: 'reading-comfort',
      label: 'Confort de lecture',
      description: 'Optimise l’espacement des textes et ralentit légèrement la synthèse vocale.',
      apply({ state, ensureEnabled, ensurePinned, ensureVisible }) {
        ensureEnabled(['spacing-controls', 'tts-controls']);
        ensureVisible(['spacing-controls', 'tts-controls']);
        ensurePinned(['spacing-controls']);
        state.set('contrast.enabled', false);
        state.set('spacing.lineHeight', 1.7);
        state.set('spacing.letterSpacing', 0.12);
        state.set('tts.rate', 0.9);
      }
    }
  ];
  const profileMap = new Map(accessibilityProfiles.map(profile => [profile.id, profile]));

  function arraysEqual(a = [], b = []) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function setListIfChanged(path, next, current = state.get(path)) {
    const reference = Array.isArray(current) ? current : [];
    if (!arraysEqual(next, reference)) {
      state.set(path, next);
    }
  }

  function markProfileAsCustom() {
    if (state.get('ui.activeProfile') !== 'custom') {
      state.set('ui.activeProfile', 'custom');
    }
  }

  const fab = document.createElement('button');
  fab.className = 'a11ytb-fab';
  fab.setAttribute('aria-label', 'Ouvrir la boîte à outils d’accessibilité');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.94 3a8.94 8.94 0 00-.5-1.47l2.06-1.5-2-3.46-2.44 1a9.09 9.09 0 00-2.02-1.17l-.37-2.6h-4l-.37 2.6A9.09 9.09 0 007.93 4.6l-2.44-1-2 3.46 2.06 1.5A8.94 8.94 0 005.06 11H2v4h3.06c.12.51.29 1 .5 1.47l-2.06 1.5 2 3.46 2.44-1c.62.47 1.3.86 2.02 1.17l.37 2.6h4l.37-2.6c.72-.31 1.4-.7 2.02-1.17l2.44 1 2-3.46-2.06-1.5c.21-.47.38-.96.5-1.47H22v-4h-3.06z"/>
  </svg>`;

  const overlay = document.createElement('div');
  overlay.className = 'a11ytb-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.dataset.open = 'false';

  const panel = document.createElement('section');
  panel.className = 'a11ytb-panel';
  panel.dataset.open = 'false';
  panel.setAttribute('aria-hidden', 'true');
  panel.id = 'a11ytb-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'A11y Toolbox Pro');
  panel.tabIndex = -1;
  fab.setAttribute('aria-controls', panel.id);

  const header = document.createElement('div');
  header.className = 'a11ytb-header';
  header.innerHTML = `
    <div class="a11ytb-title">A11y Toolbox Pro</div>
    <div class="a11ytb-actions" role="toolbar" aria-label="Actions d’interface">
      <button class="a11ytb-button" data-action="dock-left">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm8 1H6v12h6V6zm2 0v12h5V6h-5z"/></svg>
        </span>
        Dock gauche
      </button>
      <button class="a11ytb-button" data-action="dock-right">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M5 4a1 1 0 00-1 1v14a1 1 0 001 1h14a1 1 0 001-1V5a1 1 0 00-1-1H5zm11 2h3v12h-3V6zm-2 0H6v12h8V6z"/></svg>
        </span>
        Dock droite
      </button>
      <button class="a11ytb-button" data-action="dock-bottom">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm1 8v5h14v-5H5zm0-2h14V6H5v5z"/></svg>
        </span>
        Dock bas
      </button>
      <button class="a11ytb-button" data-action="reset">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M12 5a7 7 0 015.917 10.777l1.52 1.318A9 9 0 103 12H1l3.5 3.5L8 12H5a7 7 0 017-7z"/></svg>
        </span>
        Réinitialiser
      </button>
      <button class="a11ytb-button" data-action="close" aria-label="Fermer">
        <span class="a11ytb-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M6.343 5.343L5.343 6.343 10.999 12l-5.656 5.657 1 1L12 13l5.657 5.657 1-1L13.001 12l5.656-5.657-1-1L12 11l-5.657-5.657z"/></svg>
        </span>
        <span class="a11ytb-button-label">Fermer</span>
      </button>
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'a11ytb-body';

  const viewToggle = document.createElement('div');
  viewToggle.className = 'a11ytb-view-toggle';
  const viewButtons = new Map();
  [
    { id: 'modules', label: 'Modules' },
    { id: 'options', label: 'Options & Profils' }
  ].forEach((view) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'a11ytb-chip a11ytb-chip--view';
    btn.dataset.view = view.id;
    btn.textContent = view.label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      state.set('ui.view', view.id);
    });
    viewButtons.set(view.id, btn);
    viewToggle.append(btn);
  });

  const viewContainer = document.createElement('div');
  viewContainer.className = 'a11ytb-view-container';

  const modulesView = document.createElement('div');
  modulesView.className = 'a11ytb-view a11ytb-view--modules';
  modulesView.setAttribute('role', 'region');
  modulesView.setAttribute('aria-label', 'Modules d’accessibilité');

  const optionsView = document.createElement('div');
  optionsView.className = 'a11ytb-view a11ytb-view--options';
  optionsView.setAttribute('role', 'region');
  optionsView.setAttribute('aria-label', 'Profils et options avancées');
  optionsView.setAttribute('hidden', '');
  optionsView.tabIndex = -1;

  const filters = document.createElement('div');
  filters.className = 'a11ytb-filters';

  const categoryBar = document.createElement('div');
  categoryBar.className = 'a11ytb-category-bar';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'a11ytb-chip';
    btn.dataset.category = cat.id;
    btn.textContent = cat.label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      state.set('ui.category', cat.id);
    });
    categoryBar.append(btn);
  });

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'a11ytb-search';
  search.placeholder = 'Rechercher un module';
  search.setAttribute('aria-label', 'Rechercher un module');
  search.value = state.get('ui.search') || '';
  search.addEventListener('input', () => {
    state.set('ui.search', search.value);
  });

  const profileWrapper = document.createElement('div');
  profileWrapper.className = 'a11ytb-profile-picker';

  const profileLabel = document.createElement('label');
  profileLabel.className = 'a11ytb-profile-label';
  profileLabel.setAttribute('for', 'a11ytb-profile-select');
  profileLabel.textContent = 'Profil';

  const profileSelect = document.createElement('select');
  profileSelect.className = 'a11ytb-profile-select';
  profileSelect.id = 'a11ytb-profile-select';
  accessibilityProfiles.forEach(profile => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.label;
    profileSelect.append(option);
  });

  const profileDescription = document.createElement('p');
  profileDescription.className = 'a11ytb-profile-description';
  profileDescription.id = 'a11ytb-profile-description';
  profileDescription.setAttribute('aria-live', 'polite');

  profileSelect.setAttribute('aria-describedby', profileDescription.id);
  const initialProfileId = profileMap.has(state.get('ui.activeProfile')) ? state.get('ui.activeProfile') : 'custom';
  profileSelect.value = initialProfileId || 'custom';
  const initialProfile = profileMap.get(profileSelect.value) || profileMap.get('custom');
  profileDescription.textContent = initialProfile?.description || '';
  profileSelect.addEventListener('change', () => {
    applyPresetProfile(profileSelect.value, { viaUser: true });
  });

  profileWrapper.append(profileLabel, profileSelect, profileDescription);

  const hiddenToggle = document.createElement('button');
  hiddenToggle.type = 'button';
  hiddenToggle.className = 'a11ytb-chip a11ytb-chip--ghost';
  hiddenToggle.dataset.action = 'toggle-hidden';
  hiddenToggle.setAttribute('aria-pressed', 'false');
  hiddenToggle.textContent = 'Afficher les modules masqués';
  hiddenToggle.addEventListener('click', () => {
    const showHidden = !!state.get('ui.showHidden');
    state.set('ui.showHidden', !showHidden);
  });

  filters.append(categoryBar, search, profileWrapper, hiddenToggle);

  const modulesContainer = document.createElement('div');
  modulesContainer.className = 'a11ytb-modules';

  modulesView.append(filters, modulesContainer);

  const optionsScroll = document.createElement('div');
  optionsScroll.className = 'a11ytb-options-scroll';

  const profilesSection = document.createElement('section');
  profilesSection.className = 'a11ytb-options-section';
  const profilesHeader = document.createElement('div');
  profilesHeader.className = 'a11ytb-section-header';
  const profilesTitle = document.createElement('h3');
  profilesTitle.className = 'a11ytb-section-title';
  profilesTitle.textContent = 'Profils d’accessibilité';
  const profilesDescription = document.createElement('p');
  profilesDescription.className = 'a11ytb-section-description';
  profilesDescription.textContent = 'Appliquez des réglages combinés en un clic pour différents besoins (vision basse, dyslexie, etc.).';
  profilesHeader.append(profilesTitle, profilesDescription);
  const profilesList = document.createElement('div');
  profilesList.className = 'a11ytb-profile-grid';
  profilesSection.append(profilesHeader, profilesList);

  const configSection = document.createElement('section');
  configSection.className = 'a11ytb-options-section';
  const configHeader = document.createElement('div');
  configHeader.className = 'a11ytb-section-header';
  const configTitle = document.createElement('h3');
  configTitle.className = 'a11ytb-section-title';
  configTitle.textContent = 'Réglages des modules';
  const configDescription = document.createElement('p');
  configDescription.className = 'a11ytb-section-description';
  configDescription.textContent = 'Ajustez finement les options exposées par chaque module.';
  configHeader.append(configTitle, configDescription);
  const configList = document.createElement('div');
  configList.className = 'a11ytb-config-grid';
  configSection.append(configHeader, configList);

  optionsScroll.append(profilesSection, configSection);
  optionsView.append(optionsScroll);

  viewContainer.append(modulesView, optionsView);
  body.append(viewToggle, viewContainer);

  const footer = document.createElement('div');
  footer.className = 'a11ytb-header';
  const footerTitle = document.createElement('div');
  footerTitle.className = 'a11ytb-title';
  footerTitle.textContent = 'Raccourci : Alt+Shift+A';

  const activity = document.createElement('details');
  activity.className = 'a11ytb-activity';
  activity.innerHTML = `
    <summary>Activité récente</summary>
    <div class="a11ytb-activity-actions" role="group" aria-label="Exports du journal">
      <button type="button" class="a11ytb-btn-link" data-action="activity-export-json">Copier JSON</button>
      <button type="button" class="a11ytb-btn-link" data-action="activity-export-csv">Exporter CSV</button>
    </div>
    <ol class="a11ytb-activity-list" data-ref="activity-list"></ol>
  `;

  footer.append(footerTitle, activity);

  panel.append(header, body, footer);

  const blocks = listBlocks();
  const blockInfo = new Map(blocks.map(block => [block.id, block]));
  const blockIds = blocks.map(block => block.id);
  const allowedIds = new Set(blockIds);

  const moduleElements = new Map();
  const adminItems = new Map();
  const adminList = document.createElement('div');
  adminList.className = 'a11ytb-admin-list';
  blocks.forEach(block => {
    const el = renderBlock(block, state, modulesContainer);
    moduleElements.set(block.id, el);
    adminItems.set(block.id, createAdminItem(block));
  });

  const optionBindings = [];
  const manifestsWithConfig = listModuleManifests().filter((manifest) => manifest?.config?.fields?.length);

  if (manifestsWithConfig.length) {
    manifestsWithConfig.forEach((manifest) => {
      const section = document.createElement('article');
      section.className = 'a11ytb-config-card';
      const title = document.createElement('h4');
      title.className = 'a11ytb-config-title';
      title.textContent = manifest.config?.group || manifest.name || manifest.id;
      section.append(title);
      const descText = manifest.config?.description || manifest.description;
      if (descText) {
        const desc = document.createElement('p');
        desc.className = 'a11ytb-config-description';
        desc.textContent = descText;
        section.append(desc);
      }
      const fieldsContainer = document.createElement('div');
      fieldsContainer.className = 'a11ytb-config-fields';
      manifest.config.fields.forEach((field) => {
        const { element, update } = createOptionField(manifest, field);
        fieldsContainer.append(element);
        optionBindings.push(update);
      });
      section.append(fieldsContainer);
      configList.append(section);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'a11ytb-empty-state';
    empty.textContent = 'Aucun module ne propose encore de réglages avancés.';
    configList.append(empty);
  }

  const activityList = activity.querySelector('[data-ref="activity-list"]');
  const exportJsonBtn = activity.querySelector('[data-action="activity-export-json"]');
  const exportCsvBtn = activity.querySelector('[data-action="activity-export-csv"]');

  const SEVERITY_LABELS = {
    success: 'Succès',
    alert: 'Alerte',
    warning: 'Avertissement',
    info: 'Info'
  };

  function toneToSeverity(tone) {
    if (!tone) return null;
    const normalized = tone.toLowerCase();
    if (normalized === 'confirm') return 'success';
    if (normalized === 'alert') return 'alert';
    if (normalized === 'warning') return 'warning';
    return 'info';
  }

  function normalizeSeverity(severity, tone) {
    if (typeof severity === 'string' && SEVERITY_LABELS[severity.toLowerCase()]) {
      return severity.toLowerCase();
    }
    return toneToSeverity(tone) || 'info';
  }

  function normalizeTags(tags, moduleId) {
    const list = Array.isArray(tags) ? tags.filter(Boolean).map(String) : [];
    if (moduleId && !list.some(tag => tag.startsWith('module:'))) {
      return [`module:${moduleId}`, ...list];
    }
    return list;
  }

  function normalizeActivityEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const timestamp = typeof entry.timestamp === 'number'
      ? entry.timestamp
      : typeof entry.time === 'number'
        ? entry.time
        : Date.now();
    const tone = entry.tone || entry.sound || null;
    const moduleId = entry.module || entry.moduleId || null;
    const severity = normalizeSeverity(entry.severity, tone);
    const tags = normalizeTags(entry.tags, moduleId);
    return {
      id: entry.id || `${timestamp}-${Math.random().toString(16).slice(2)}`,
      message: entry.message || '',
      timestamp,
      tone,
      severity,
      module: moduleId,
      tags
    };
  }

  function getActivityEntries() {
    const current = state.get('ui.activity') || [];
    return current
      .map(normalizeActivityEntry)
      .filter(Boolean);
  }

  function readValue(source, path) {
    if (!source || !path) return undefined;
    return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), source);
  }

  function formatFieldValue(field, value) {
    if (typeof field.format === 'function') {
      try {
        return field.format(value);
      } catch (error) {
        console.warn('a11ytb: format de champ invalide.', error);
      }
    }
    if (field.type === 'range') {
      return typeof value === 'number' ? value.toFixed(2) : value ?? '';
    }
    if (field.type === 'toggle') {
      return value ? 'Activé' : 'Désactivé';
    }
    return value ?? '';
  }

  function createOptionField(manifest, field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'a11ytb-option';
    let update = () => {};

    if (field.type === 'range') {
      const label = document.createElement('label');
      label.className = 'a11ytb-option-label';
      const title = document.createElement('span');
      title.className = 'a11ytb-option-title';
      title.textContent = field.label || field.path;
      const valueNode = document.createElement('span');
      valueNode.className = 'a11ytb-option-value';
      label.append(title, valueNode);

      const input = document.createElement('input');
      input.type = 'range';
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      if (field.step !== undefined) input.step = String(field.step);
      input.setAttribute('aria-label', field.label || field.path);

      input.addEventListener('input', () => {
        const raw = input.valueAsNumber;
        const safe = Number.isNaN(raw) ? Number(field.min ?? 0) : raw;
        state.set(field.path, safe);
        valueNode.textContent = formatFieldValue(field, safe);
      });
      input.addEventListener('change', () => {
        const raw = input.valueAsNumber;
        const safe = Number.isNaN(raw) ? Number(field.min ?? 0) : raw;
        state.set(field.path, safe);
        if (typeof field.onChange === 'function') {
          field.onChange(safe, { state: state.get(), field, manifest });
        }
      });

      wrapper.append(label, input);
      if (field.description) {
        const hint = document.createElement('p');
        hint.className = 'a11ytb-option-description';
        hint.textContent = field.description;
        wrapper.append(hint);
      }

      update = (snapshot) => {
        const current = readValue(snapshot, field.path);
        const value = typeof current === 'number' ? current : Number(field.min ?? 0);
        if (document.activeElement !== input) {
          input.value = String(value);
        }
        valueNode.textContent = formatFieldValue(field, value);
      };
    } else if (field.type === 'toggle') {
      const trueValue = field.trueValue !== undefined ? field.trueValue : true;
      const falseValue = field.falseValue !== undefined ? field.falseValue : false;
      const label = document.createElement('label');
      label.className = 'a11ytb-option-toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('aria-label', field.label || field.path);
      const title = document.createElement('span');
      title.className = 'a11ytb-option-title';
      title.textContent = field.label || field.path;

      input.addEventListener('change', () => {
        const value = input.checked ? trueValue : falseValue;
        state.set(field.path, value);
        if (typeof field.onChange === 'function') {
          field.onChange(value, { state: state.get(), field, manifest });
        }
      });

      label.append(input, title);
      wrapper.append(label);
      if (field.description) {
        const hint = document.createElement('p');
        hint.className = 'a11ytb-option-description';
        hint.textContent = field.description;
        wrapper.append(hint);
      }

      update = (snapshot) => {
        const current = readValue(snapshot, field.path);
        const checked = current === trueValue;
        input.checked = checked;
        label.setAttribute('data-value', formatFieldValue(field, current));
      };
    } else if (field.type === 'select') {
      const label = document.createElement('label');
      label.className = 'a11ytb-option-label';
      const title = document.createElement('span');
      title.className = 'a11ytb-option-title';
      title.textContent = field.label || field.path;
      label.append(title);

      const select = document.createElement('select');
      select.className = 'a11ytb-option-select';
      select.setAttribute('aria-label', field.label || field.path);
      label.append(select);

      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'a11ytb-option-empty';
      emptyMessage.textContent = field.emptyLabel || 'Aucune option disponible pour le moment.';
      emptyMessage.hidden = true;

      select.addEventListener('change', () => {
        const value = select.value;
        state.set(field.path, value);
        if (typeof field.onChange === 'function') {
          field.onChange(value, { state: state.get(), field, manifest });
        }
      });

      wrapper.append(label, emptyMessage);
      if (field.description) {
        const hint = document.createElement('p');
        hint.className = 'a11ytb-option-description';
        hint.textContent = field.description;
        wrapper.append(hint);
      }

      let optionSignature = '';
      update = (snapshot) => {
        const options = typeof field.getOptions === 'function'
          ? (field.getOptions(snapshot) || [])
          : (field.options || []);
        const signature = JSON.stringify(options.map((opt) => [opt.value, opt.label]));
        if (signature !== optionSignature) {
          optionSignature = signature;
          select.innerHTML = '';
          options.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value ?? '';
            option.textContent = opt.label ?? opt.value ?? '';
            select.append(option);
          });
        }
        if (!options.length) {
          select.disabled = true;
          emptyMessage.hidden = false;
        } else {
          select.disabled = false;
          emptyMessage.hidden = true;
        }
        const current = readValue(snapshot, field.path);
        const currentValue = current ?? (options[0]?.value ?? '');
        if (document.activeElement !== select) {
          select.value = String(currentValue ?? '');
        }
      };
    }

    return {
      element: wrapper,
      update
    };
  }

  function getPreferences() {
    const ui = state.get('ui') || {};
    return {
      category: ui.category || 'all',
      search: ui.search || '',
      pinned: Array.isArray(ui.pinned) ? ui.pinned : [],
      hidden: Array.isArray(ui.hidden) ? ui.hidden : [],
      showHidden: !!ui.showHidden,
      view: ui.view || 'modules'
    };
  }

  function createAdminItem(block) {
    const li = document.createElement('li');
    li.className = 'a11ytb-admin-item';
    li.dataset.blockId = block.id;
    li.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'a11ytb-admin-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M10 4h4v2h-4V4zm0 7h4v2h-4v-2zm0 7h4v2h-4v-2z"/></svg>';

    const icon = document.createElement('span');
    icon.className = 'a11ytb-admin-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = block.icon || DEFAULT_BLOCK_ICON;

    const label = document.createElement('label');
    label.className = 'a11ytb-admin-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.ref = 'toggle';

    const labelText = document.createElement('span');
    labelText.textContent = block.title || block.id;

    label.append(checkbox, labelText);

    const meta = document.createElement('span');
    meta.className = 'a11ytb-admin-meta';
    const categoryLabel = categories.find(cat => cat.id === block.category)?.label || 'Divers';
    meta.textContent = categoryLabel;

    li.append(handle, icon, label, meta);

    checkbox.addEventListener('change', () => {
      const prefs = getPreferences();
      const disabledSet = new Set(prefs.disabled);
      const hiddenSet = new Set(prefs.hidden);
      const title = block.title || block.id;
      if (checkbox.checked) {
        if (disabledSet.delete(block.id)) {
          setListIfChanged('ui.disabled', Array.from(disabledSet), prefs.disabled);
        }
        if (hiddenSet.delete(block.id)) {
          setListIfChanged('ui.hidden', Array.from(hiddenSet), prefs.hidden);
        }
        logActivity(`Module activé : ${title}`, { tone: 'confirm' });
      } else {
        if (!disabledSet.has(block.id)) {
          disabledSet.add(block.id);
          setListIfChanged('ui.disabled', Array.from(disabledSet), prefs.disabled);
        }
        const pinned = prefs.pinned.filter(id => id !== block.id);
        setListIfChanged('ui.pinned', pinned, prefs.pinned);
        logActivity(`Module désactivé : ${title}`, { tone: 'toggle' });
      }
      markProfileAsCustom();
    });

    return li;
  }

  function syncAdminList() {
    const prefs = getPreferences();
    const disabledSet = new Set(prefs.disabled);
    const order = prefs.moduleOrder.length ? prefs.moduleOrder : blockIds;
    order.forEach(id => {
      const item = adminItems.get(id);
      if (item) adminList.append(item);
    });
    adminItems.forEach((item, id) => {
      const checkbox = item.querySelector('input[type="checkbox"][data-ref="toggle"]');
      const enabled = !disabledSet.has(id);
      if (checkbox && checkbox.checked !== enabled) {
        checkbox.checked = enabled;
      }
      item.classList.toggle('is-disabled', !enabled);
      item.setAttribute('aria-disabled', String(!enabled));
    });
  }

  function applyPresetProfile(profileId, { viaUser = false } = {}) {
    const profile = profileMap.get(profileId) || profileMap.get('custom');
    const targetId = profile?.id || 'custom';
    if (state.get('ui.activeProfile') !== targetId) {
      state.set('ui.activeProfile', targetId);
    }
    if (!profile || targetId === 'custom') {
      if (viaUser) {
        logActivity('Profil personnalisé activé', { tone: 'toggle' });
      }
      return;
    }

    const prefs = getPreferences();
    const working = {
      disabled: new Set(prefs.disabled),
      hidden: new Set(prefs.hidden),
      pinned: [...prefs.pinned]
    };

    const ensureEnabled = (ids = []) => {
      let changed = false;
      ids.forEach(id => {
        if (working.disabled.delete(id)) changed = true;
      });
      if (changed) {
        const next = Array.from(working.disabled);
        setListIfChanged('ui.disabled', next, prefs.disabled);
        prefs.disabled = next;
      }
    };

    const ensureVisible = (ids = []) => {
      let changed = false;
      ids.forEach(id => {
        if (working.hidden.delete(id)) changed = true;
      });
      if (changed) {
        const next = Array.from(working.hidden);
        setListIfChanged('ui.hidden', next, prefs.hidden);
        prefs.hidden = next;
      }
    };

    const ensurePinned = (ids = []) => {
      if (!ids?.length) return;
      const ordered = [];
      const seen = new Set();
      ids.forEach(id => {
        if (!allowedIds.has(id) || seen.has(id)) return;
        seen.add(id);
        ordered.push(id);
      });
      working.pinned.forEach(id => {
        if (seen.has(id)) return;
        seen.add(id);
        ordered.push(id);
      });
      if (!arraysEqual(ordered, working.pinned)) {
        working.pinned = ordered;
        setListIfChanged('ui.pinned', ordered, prefs.pinned);
        prefs.pinned = ordered;
      }
    };

    profile.apply?.({ state, ensureEnabled, ensurePinned, ensureVisible });
    logActivity(`Profil appliqué : ${profile.label}`, { tone: 'confirm' });
  }

  function syncFilters() {
    const prefs = getPreferences();
    categoryBar.querySelectorAll('button[data-category]').forEach(btn => {
      const active = btn.dataset.category === prefs.category;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    if (search !== document.activeElement) {
      const value = prefs.search || '';
      if (search.value !== value) search.value = value;
    }
    hiddenToggle.setAttribute('aria-pressed', String(prefs.showHidden));
    hiddenToggle.classList.toggle('is-active', prefs.showHidden);
    hiddenToggle.textContent = prefs.showHidden ? 'Masquer les modules cachés' : 'Afficher les modules masqués';
    const profileId = profileMap.has(prefs.activeProfile) ? prefs.activeProfile : 'custom';
    if (profileSelect.value !== profileId) profileSelect.value = profileId;
    const profile = profileMap.get(profileId) || profileMap.get('custom');
    profileDescription.textContent = profile?.description || '';
  }

  function applyModuleLayout() {
    const prefs = getPreferences();
    const searchTerm = (prefs.search || '').trim().toLowerCase();
    const pinnedSet = new Set(prefs.pinned);
    const hiddenSet = new Set(prefs.hidden);
    const disabledSet = new Set(prefs.disabled);

    const baseOrder = prefs.moduleOrder.length ? prefs.moduleOrder : blockIds;
    const orderedPinned = prefs.pinned.filter(id => moduleElements.has(id));
    const ordered = [
      ...orderedPinned,
      ...baseOrder.filter(id => !pinnedSet.has(id))
    ];

    ordered.forEach(id => {
      const el = moduleElements.get(id);
      if (el) modulesContainer.append(el);
    });

    moduleElements.forEach((el, id) => {
      const title = el.dataset.title || '';
      const keywords = el.dataset.keywords || title.toLowerCase();
      const matchesCategory = prefs.category === 'all' || el.dataset.category === prefs.category;
      const matchesSearch = !searchTerm || keywords.includes(searchTerm);
      const isHidden = hiddenSet.has(id);
      const isDisabled = disabledSet.has(id);
      const shouldShow = matchesCategory && matchesSearch && (!isHidden && !isDisabled || prefs.showHidden);
      if (shouldShow) {
        el.removeAttribute('hidden');
        el.setAttribute('aria-hidden', 'false');
      } else {
        el.setAttribute('hidden', '');
        el.setAttribute('aria-hidden', 'true');
      }
      el.classList.toggle('is-hidden', isHidden);
      el.classList.toggle('is-disabled', isDisabled);
      el.dataset.disabled = String(isDisabled);
      el.classList.toggle('is-pinned', pinnedSet.has(id));
      const pinBtn = el.querySelector('[data-module-action="toggle-pin"]');
      const hideBtn = el.querySelector('[data-module-action="toggle-hide"]');
      if (pinBtn) {
        const pinned = pinnedSet.has(id);
        pinBtn.setAttribute('aria-pressed', String(pinned));
        pinBtn.setAttribute('aria-label', `${pinned ? 'Retirer l’épingle du' : 'Épingler le'} module ${title}`.trim());
      }
      if (hideBtn) {
        const hidden = hiddenSet.has(id);
        hideBtn.setAttribute('aria-pressed', String(hidden));
        hideBtn.setAttribute('aria-label', `${hidden ? 'Afficher' : 'Masquer'} le module ${title}`.trim());
      }
      const overlay = el.querySelector('.a11ytb-module-overlay');
      const content = el.querySelector('.a11ytb-module-content');
      if (overlay) {
        if (isDisabled && shouldShow) {
          overlay.hidden = false;
        } else {
          overlay.hidden = true;
        }
      }
      if (content) {
        content.setAttribute('aria-hidden', String(isDisabled));
      }
    });
  }

  let lastOptionsFocus = null;
  let releaseOptionsFocusTrap = null;
  let activeViewId = null;

  function focusFirstInOptions() {
    const focusables = collectFocusable(optionsView);
    const toggle = viewButtons.get('options');
    const target = (lastOptionsFocus && optionsView.contains(lastOptionsFocus))
      ? lastOptionsFocus
      : (focusables[0] || toggle || optionsView);
    if (target && typeof target.focus === 'function') {
      requestAnimationFrame(() => {
        target.focus();
      });
    }
  }

  function setupOptionsFocusTrap() {
    const optionsToggle = viewButtons.get('options');

    const getCycle = () => {
      const members = [];
      if (optionsToggle) members.push(optionsToggle);
      members.push(...collectFocusable(optionsView));
      return members;
    };

    const keydownHandler = (event) => {
      if (event.key !== 'Tab') return;
      const focusables = getCycle();
      if (!focusables.length) {
        event.preventDefault();
        optionsView.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const focusInHandler = (event) => {
      if (optionsView.contains(event.target)) {
        lastOptionsFocus = event.target;
        return;
      }
      if (optionsToggle && optionsToggle.contains(event.target)) {
        lastOptionsFocus = optionsToggle;
        return;
      }
      if (!body.contains(event.target)) return;
      const cycle = getCycle();
      const fallback = cycle[0] || optionsView;
      if (fallback && typeof fallback.focus === 'function') {
        fallback.focus();
      }
    };

    optionsView.addEventListener('keydown', keydownHandler, true);
    if (optionsToggle) {
      optionsToggle.addEventListener('keydown', keydownHandler, true);
    }
    document.addEventListener('focusin', focusInHandler);

    releaseOptionsFocusTrap = () => {
      optionsView.removeEventListener('keydown', keydownHandler, true);
      if (optionsToggle) {
        optionsToggle.removeEventListener('keydown', keydownHandler, true);
      }
      document.removeEventListener('focusin', focusInHandler);
    };

    focusFirstInOptions();
  }

  function teardownOptionsFocusTrap() {
    if (typeof releaseOptionsFocusTrap === 'function') {
      releaseOptionsFocusTrap();
    }
    releaseOptionsFocusTrap = null;
  }

  function syncView() {
    const prefs = getPreferences();
    const currentView = prefs.view || 'modules';
    viewButtons.forEach((btn, id) => {
      const active = id === currentView;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    if (currentView === 'options') {
      modulesView.setAttribute('hidden', '');
      modulesView.setAttribute('aria-hidden', 'true');
      optionsView.removeAttribute('hidden');
      optionsView.setAttribute('aria-hidden', 'false');
      if (activeViewId !== 'options') {
        setupOptionsFocusTrap();
      }
    } else {
      optionsView.setAttribute('hidden', '');
      optionsView.setAttribute('aria-hidden', 'true');
      modulesView.removeAttribute('hidden');
      modulesView.setAttribute('aria-hidden', 'false');
      if (activeViewId === 'options') {
        teardownOptionsFocusTrap();
      }
    }
    activeViewId = currentView;
  }

  function renderProfiles(snapshot) {
    if (!profilesList) return;
    const data = snapshot?.profiles ?? state.get('profiles') ?? {};
    const lastProfile = snapshot?.ui?.lastProfile ?? state.get('ui.lastProfile');
    const entries = Object.entries(data);
    profilesList.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'a11ytb-empty-state';
      empty.textContent = 'Aucun profil préconfiguré pour le moment.';
      profilesList.append(empty);
      return;
    }
    entries.forEach(([id, profile]) => {
      const card = document.createElement('article');
      card.className = 'a11ytb-profile-card';
      card.dataset.profileId = id;
      if (id === lastProfile) {
        card.classList.add('is-active');
      }
      const header = document.createElement('div');
      header.className = 'a11ytb-profile-header';
      const title = document.createElement('h4');
      title.className = 'a11ytb-profile-title';
      title.textContent = profile?.name || id;
      header.append(title);
      if (id === lastProfile) {
        const badge = document.createElement('span');
        badge.className = 'a11ytb-profile-badge';
        badge.textContent = 'Dernier profil appliqué';
        header.append(badge);
      }
      card.append(header);

      if (Array.isArray(profile?.tags) && profile.tags.length) {
        const tags = document.createElement('div');
        tags.className = 'a11ytb-profile-tags';
        profile.tags.forEach((tag) => {
          const chip = document.createElement('span');
          chip.className = 'a11ytb-profile-tag';
          chip.textContent = tag;
          tags.append(chip);
        });
        card.append(tags);
      }

      if (profile?.summary) {
        const summary = document.createElement('p');
        summary.className = 'a11ytb-profile-summary';
        summary.textContent = profile.summary;
        card.append(summary);
      }

      if (profile?.description) {
        const description = document.createElement('p');
        description.className = 'a11ytb-profile-description';
        description.textContent = profile.description;
        card.append(description);
      }

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'a11ytb-button a11ytb-button--ghost';
      applyBtn.dataset.profile = id;
      applyBtn.textContent = id === lastProfile ? 'Réappliquer le profil' : 'Appliquer ce profil';
      card.append(applyBtn);

      profilesList.append(card);
    });
  }

  function applyProfile(profileId) {
    const profiles = state.get('profiles') || {};
    const profile = profiles?.[profileId];
    if (!profile) return;
    const settings = profile.settings || {};
    Object.entries(settings).forEach(([path, value]) => {
      state.set(path, value);
    });
    const tone = profile.tone || 'confirm';
    const message = profile.activity || `Profil appliqué : ${profile.name || profileId}`;
    state.set('ui.lastProfile', profileId);
    logActivity(message, { tone });
  }

  function formatTime(ts) {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function updateActivityLog() {
    if (!activityList) return;
    const entries = getActivityEntries();
    const hasEntries = entries.length > 0;
    if (exportJsonBtn) exportJsonBtn.disabled = !hasEntries;
    if (exportCsvBtn) exportCsvBtn.disabled = !hasEntries;
    activityList.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.className = 'a11ytb-activity-empty';
      empty.textContent = 'Aucune activité récente.';
      activityList.append(empty);
      return;
    }
    entries.slice(0, 6).forEach(entry => {
      const li = document.createElement('li');
      const date = new Date(entry.timestamp || Date.now());
      const line = document.createElement('div');
      line.className = 'a11ytb-activity-line';
      const timeEl = document.createElement('time');
      timeEl.setAttribute('datetime', date.toISOString());
      timeEl.textContent = formatTime(date);
      const message = document.createElement('span');
      message.className = 'a11ytb-activity-message';
      message.textContent = entry.message;
      line.append(timeEl, message);
      li.append(line);

      const meta = document.createElement('div');
      meta.className = 'a11ytb-activity-meta';
      const severity = normalizeSeverity(entry.severity, entry.tone);
      if (severity && SEVERITY_LABELS[severity]) {
        const badge = document.createElement('span');
        badge.className = `a11ytb-activity-badge a11ytb-activity-badge--${severity}`;
        badge.textContent = SEVERITY_LABELS[severity];
        meta.append(badge);
      }
      if (entry.module) {
        const moduleTag = document.createElement('span');
        moduleTag.className = 'a11ytb-activity-badge';
        moduleTag.textContent = `Module : ${entry.module}`;
        meta.append(moduleTag);
      }
      const tags = normalizeTags(entry.tags, entry.module).filter(tag => !tag.startsWith('module:'));
      tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'a11ytb-activity-badge';
        tagEl.textContent = tag;
        meta.append(tagEl);
      });
      if (meta.childNodes.length) {
        li.append(meta);
      }
      activityList.append(li);
    });
  }

  function logActivity(message, options = {}) {
    if (!message) return;
    const current = getActivityEntries();
    const now = Date.now();
    const moduleId = options.module || options.moduleId || null;
    const tone = options.tone || null;
    const severity = normalizeSeverity(options.severity, tone);
    const tags = normalizeTags(options.tags, moduleId);
    const entry = {
      id: `${now}-${Math.random().toString(16).slice(2)}`,
      message,
      timestamp: now,
      tone,
      severity,
      module: moduleId,
      tags
    };
    const next = [entry, ...current].slice(0, 50);
    state.set('ui.activity', next);
    if (tone) {
      window.a11ytb?.feedback?.play(options.tone);
    }
    return entry;
  }

  function serializeActivityToJSON(entries) {
    return JSON.stringify(entries.map(entry => ({
      id: entry.id,
      message: entry.message,
      timestamp: entry.timestamp,
      module: entry.module,
      severity: entry.severity,
      tone: entry.tone,
      tags: entry.tags
    })), null, 2);
  }

  function escapeCsvValue(value) {
    const stringValue = Array.isArray(value) ? value.join('|') : value ?? '';
    const text = String(stringValue);
    if (text.includes('"') || text.includes(',') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function serializeActivityToCSV(entries) {
    const header = ['timestamp', 'message', 'module', 'severity', 'tone', 'tags'];
    const rows = entries.map(entry => [
      new Date(entry.timestamp || Date.now()).toISOString(),
      entry.message,
      entry.module || '',
      entry.severity || '',
      entry.tone || '',
      Array.isArray(entry.tags) ? entry.tags.join('|') : ''
    ]);
    return [header.join(','), ...rows.map(row => row.map(escapeCsvValue).join(','))].join('\n');
  }

  function downloadText(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyToClipboard(text) {
    if (!navigator?.clipboard?.writeText) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('a11ytb: échec de copie presse-papiers', error);
      return false;
    }
  }

  if (!window.a11ytb) window.a11ytb = {};
  window.a11ytb.logActivity = logActivity;
  window.a11ytb.activity = {
    getEntries: () => getActivityEntries().map(entry => ({ ...entry })),
    toJSON: () => serializeActivityToJSON(getActivityEntries()),
    toCSV: () => serializeActivityToCSV(getActivityEntries())
  };

  root.append(overlay, fab, panel);

  let lastFocusedElement = null;

  const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function collectFocusable(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS))
      .filter((el) => el.offsetParent !== null && !el.hasAttribute('hidden'));
  }

  function getFocusableElements() {
    return collectFocusable(panel);
  }

  function toggle(open) {
    const shouldOpen = open ?? panel.dataset.open !== 'true';
    panel.dataset.open = String(shouldOpen);
    panel.setAttribute('aria-hidden', String(!shouldOpen));
    fab.setAttribute('aria-expanded', String(shouldOpen));
    overlay.dataset.open = String(shouldOpen);
    overlay.setAttribute('aria-hidden', String(!shouldOpen));
    document.body.classList.toggle('a11ytb-modal-open', shouldOpen);
    if (shouldOpen) {
      lastFocusedElement = document.activeElement;
      const focusables = getFocusableElements();
      (focusables[0] || panel).focus();
    } else {
      const target = (lastFocusedElement && typeof lastFocusedElement.focus === 'function') ? lastFocusedElement : fab;
      target.focus();
      lastFocusedElement = null;
    }
  }

  fab.addEventListener('click', () => toggle(true));
  header.querySelector('[data-action="close"]').addEventListener('click', () => toggle(false));
  header.querySelector('[data-action="reset"]').addEventListener('click', () => {
    state.reset();
    window.a11ytb?.feedback?.play('alert');
    logActivity('Préférences réinitialisées');
  });
  header.querySelector('[data-action="dock-left"]').addEventListener('click', () => state.set('ui.dock', 'left'));
  header.querySelector('[data-action="dock-right"]').addEventListener('click', () => state.set('ui.dock', 'right'));
  header.querySelector('[data-action="dock-bottom"]').addEventListener('click', () => state.set('ui.dock', 'bottom'));

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      toggle();
    }
  });

  overlay.addEventListener('click', () => toggle(false));

  profilesList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-profile]');
    if (!btn) return;
    applyProfile(btn.dataset.profile);
  });

  activity.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'activity-export-json') {
      const entries = getActivityEntries();
      if (!entries.length) return;
      const payload = serializeActivityToJSON(entries);
      const copied = await copyToClipboard(payload);
      if (copied) {
        logActivity('Journal copié au presse-papiers (JSON)', { tone: 'confirm', module: 'activity', tags: ['export', 'json'] });
      } else {
        downloadText('a11ytb-activity.json', payload, 'application/json');
        logActivity('Journal téléchargé (JSON)', { tone: 'warning', module: 'activity', tags: ['export', 'json'] });
      }
    } else if (action.dataset.action === 'activity-export-csv') {
      const entries = getActivityEntries();
      if (!entries.length) return;
      const payload = serializeActivityToCSV(entries);
      downloadText('a11ytb-activity.csv', payload, 'text/csv');
      logActivity('Journal exporté (CSV)', { tone: 'confirm', module: 'activity', tags: ['export', 'csv'] });
    }
  });

  modulesContainer.addEventListener('click', (event) => {
    const openOptions = event.target.closest('[data-action="open-options"]');
    if (openOptions) {
      state.set('ui.view', 'options');
      return;
    }
    const btn = event.target.closest('[data-module-action]');
    if (!btn) return;
    const moduleEl = btn.closest('.a11ytb-module');
    if (!moduleEl) return;
    const id = moduleEl.dataset.blockId;
    if (!id) return;
    const block = blockInfo.get(id);
    const title = block?.title || 'module';
    const prefs = getPreferences();
    if (btn.dataset.moduleAction === 'toggle-pin') {
      const pinned = Array.isArray(prefs.pinned) ? [...prefs.pinned] : [];
      const index = pinned.indexOf(id);
      if (index === -1) {
        pinned.unshift(id);
        state.set('ui.pinned', pinned);
        logActivity(`Module épinglé : ${title}`, { tone: 'confirm' });
      } else {
        pinned.splice(index, 1);
        state.set('ui.pinned', pinned);
        logActivity(`Épingle retirée : ${title}`, { tone: 'toggle' });
      }
      markProfileAsCustom();
    } else if (btn.dataset.moduleAction === 'toggle-hide') {
      const hidden = Array.isArray(prefs.hidden) ? [...prefs.hidden] : [];
      const index = hidden.indexOf(id);
      if (index === -1) {
        hidden.push(id);
        state.set('ui.hidden', hidden);
        const pinned = Array.isArray(prefs.pinned) ? prefs.pinned.filter(x => x !== id) : [];
        state.set('ui.pinned', pinned);
        logActivity(`Module masqué : ${title}`, { tone: 'toggle' });
      } else {
        hidden.splice(index, 1);
        state.set('ui.hidden', hidden);
        logActivity(`Module affiché : ${title}`, { tone: 'confirm' });
      }
      markProfileAsCustom();
    }
  });

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      toggle(false);
      return;
    }
    if (e.key === 'Tab') {
      const focusables = getFocusableElements();
      if (!focusables.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.addEventListener('focusin', (event) => {
    if (panel.dataset.open === 'true') {
      if (!panel.contains(event.target) && event.target !== fab) {
        const focusables = getFocusableElements();
        (focusables[0] || panel).focus();
      }
    }
  });

  window.resetAll = () => state.reset();
  window.stopSpeaking = () => window.a11ytb?.tts?.stop?.();
  window.speakPage = () => window.a11ytb?.tts?.speakPage?.();
  window.speakSelection = () => window.a11ytb?.tts?.speakSelection?.();
  window.brailleSelection = () => {
    window.a11ytb?.braille?.transcribeSelection?.();
    logActivity('Transcription braille demandée', { tone: 'confirm' });
  };
  window.clearBraille = () => {
    window.a11ytb?.braille?.clear?.();
    logActivity('Sortie braille effacée', { tone: 'toggle' });
  };

  Object.defineProperty(window, 'sttStatus', { get() { return state.get('stt.status'); } });
  Object.defineProperty(window, 'brailleOut', { get() { return state.get('braille.output'); } });

  state.on((snapshot) => {
    syncFilters();
    syncAdminList();
    applyModuleLayout();
    updateActivityLog();
    syncView();
    renderProfiles(snapshot);
    optionBindings.forEach((binding) => binding(snapshot));
  });

  const initialSnapshot = state.get();
  syncFilters();
  syncAdminList();
  applyModuleLayout();
  updateActivityLog();
  syncView();
  renderProfiles(initialSnapshot);
  optionBindings.forEach((binding) => binding(initialSnapshot));
}
