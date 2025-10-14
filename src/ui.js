import { listBlocks, renderBlock, listModuleManifests } from './registry.js';
import { moduleCatalog } from './module-catalog.js';
import { applyInertToSiblings } from './utils/inert.js';
import { summarizeStatuses } from './status-center.js';
import { buildGuidedChecklists, toggleManualChecklistStep } from './guided-checklists.js';
import { normalizeAudioEvents } from './audio-config.js';
import { flattenedModuleCollections, moduleCollectionsById } from './module-collections.js';
import { updateDependencyDisplay } from './utils/dependency-display.js';
import { createActivityIntegration } from './integrations/activity.js';

const DEFAULT_BLOCK_ICON = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 5h7v7H4V5zm9 0h7v7h-7V5zM4 12h7v7H4v-7zm9 0h7v7h-7v-7z"/></svg>';

export function mountUI({ root, state, config = {} }) {
  const pluginConfig = config || {};
  const behaviorConfig = pluginConfig.behavior || {};
  const integrationsConfig = pluginConfig.integrations || {};
  const activityIntegrationConfig = integrationsConfig.activity || {};
  const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
  const AUTO_OPEN_STORAGE_KEY = 'a11ytb/auto-opened';
  let activitySync = null;
  const categories = [
    { id: 'all', label: 'Tous' },
    { id: 'vision', label: 'Vision' },
    { id: 'lecture', label: 'Lecture' },
    { id: 'interaction', label: 'Interaction' }
  ];

  const PRIORITY_DEFAULT_WEIGHT = 2;
  const PRIORITY_DEFAULT_DESCRIPTION = 'Utilise l’ordre actuel (ordre + épingles).';
  const PRIORITY_LEVELS = [
    {
      id: 'critical',
      label: 'Critique',
      shortLabel: 'Critique',
      description: 'Toujours afficher en premier et éviter de masquer le module.',
      weight: 0,
      tone: 'alert'
    },
    {
      id: 'focus',
      label: 'À privilégier',
      shortLabel: 'Priorité',
      description: 'Mettre le module en avant dans le panneau principal.',
      weight: 1,
      tone: 'confirm'
    },
    {
      id: 'later',
      label: 'À explorer plus tard',
      shortLabel: 'Secondaire',
      description: 'Module non critique pouvant rester en bas de liste.',
      weight: 3,
      tone: 'info'
    }
  ];
  const PRIORITY_LOOKUP = new Map(PRIORITY_LEVELS.map((level) => [level.id, level]));

  const CUSTOM_SHORTCUT_DEFINITIONS = [
    { id: 'toggle-panel', label: 'Ouvrir ou fermer la boîte à outils.', default: 'Alt+Shift+A' },
    { id: 'view-modules', label: 'Afficher la vue Modules.', default: 'Alt+Shift+M', view: 'modules' },
    { id: 'view-options', label: 'Afficher la vue Options & Profils.', default: 'Alt+Shift+O', view: 'options' },
    { id: 'view-organize', label: 'Afficher la vue Organisation.', default: 'Alt+Shift+G', view: 'organize' },
    { id: 'view-guides', label: 'Afficher la vue Guides.', default: 'Alt+Shift+P', view: 'guides' },
    { id: 'view-shortcuts', label: 'Afficher cette vue Raccourcis.', default: 'Alt+Shift+H', view: 'shortcuts' }
  ];
  const CUSTOM_SHORTCUT_LOOKUP = new Map(CUSTOM_SHORTCUT_DEFINITIONS.map((item) => [item.id, item]));

  const SHORTCUT_KEY_DISPLAY = new Map([
    ['escape', 'Échap'],
    ['esc', 'Échap'],
    ['enter', 'Entrée'],
    ['return', 'Entrée'],
    ['space', 'Espace'],
    [' ', 'Espace'],
    ['arrowup', '↑'],
    ['arrowdown', '↓'],
    ['arrowleft', '←'],
    ['arrowright', '→'],
    ['pageup', 'Page▲'],
    ['pagedown', 'Page▼'],
    ['home', 'Origine'],
    ['end', 'Fin']
  ]);

  const SHORTCUT_KEY_ALIASES = new Map([
    ['échap', 'escape'],
    ['esc', 'escape'],
    ['entrer', 'enter'],
    ['entrée', 'enter'],
    ['return', 'enter'],
    ['space', 'space'],
    ['espace', 'space'],
    ['spacebar', 'space'],
    ['←', 'arrowleft'],
    ['→', 'arrowright'],
    ['↑', 'arrowup'],
    ['↓', 'arrowdown'],
    ['page▲', 'pageup'],
    ['page▼', 'pagedown']
  ]);

  function slugifyProfileId(input) {
    if (!input || typeof input !== 'string') return '';
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function ensureUniqueProfileId(baseId, profiles) {
    const normalized = baseId || 'profil';
    if (!profiles || typeof profiles !== 'object') return normalized;
    if (!profiles[normalized]) return normalized;
    let index = 2;
    let candidate = `${normalized}-${index}`;
    while (profiles[candidate]) {
      index += 1;
      candidate = `${normalized}-${index}`;
    }
    return candidate;
  }

  function cloneProfileDefinition(profile) {
    if (!profile || typeof profile !== 'object') return {};
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(profile);
      } catch (error) {
        // ignore and fallback to JSON strategy
      }
    }
    try {
      return JSON.parse(JSON.stringify(profile));
    } catch (error) {
      return { ...profile };
    }
  }

  function canonicalizeKey(token) {
    if (!token || typeof token !== 'string') return '';
    const trimmed = token.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (SHORTCUT_KEY_ALIASES.has(lower)) {
      return SHORTCUT_KEY_ALIASES.get(lower);
    }
    return lower;
  }

  function describeKey(key) {
    const canonical = canonicalizeKey(key);
    if (!canonical) return '';
    if (SHORTCUT_KEY_DISPLAY.has(canonical)) {
      return SHORTCUT_KEY_DISPLAY.get(canonical);
    }
    if (canonical.length === 1) {
      return canonical.toUpperCase();
    }
    return canonical.charAt(0).toUpperCase() + canonical.slice(1);
  }

  function parseShortcutCombo(input) {
    if (!input || typeof input !== 'string') return null;
    const tokens = input.split('+').map((token) => token.trim()).filter(Boolean);
    if (!tokens.length) return null;
    const combo = { alt: false, shift: false, ctrl: false, meta: false, key: '' };
    tokens.forEach((token) => {
      const normalized = token.toLowerCase();
      if (normalized === 'alt' || normalized === 'option') {
        combo.alt = true;
      } else if (normalized === 'shift') {
        combo.shift = true;
      } else if (normalized === 'ctrl' || normalized === 'control' || normalized === 'ctl') {
        combo.ctrl = true;
      } else if (normalized === 'cmd' || normalized === '⌘' || normalized === 'meta' || normalized === 'command') {
        combo.meta = true;
      } else if (normalized === 'cmdorctrl') {
        combo.meta = true;
        combo.ctrl = true;
      } else {
        combo.key = canonicalizeKey(token);
      }
    });
    if (!combo.key) return null;
    return combo;
  }

  function serializeShortcutCombo(combo) {
    if (!combo || !combo.key) return '';
    const parts = [];
    if (combo.meta) parts.push('Cmd');
    if (combo.ctrl) parts.push('Ctrl');
    if (combo.alt) parts.push('Alt');
    if (combo.shift) parts.push('Shift');
    parts.push(describeKey(combo.key));
    return parts.join('+');
  }

  function shortcutPartsFromCombo(comboString) {
    const parsed = typeof comboString === 'string' ? parseShortcutCombo(comboString) : comboString;
    if (!parsed || !parsed.key) return [];
    const parts = [];
    if (parsed.meta) parts.push('Cmd');
    if (parsed.ctrl) parts.push('Ctrl');
    if (parsed.alt) parts.push('Alt');
    if (parsed.shift) parts.push('Shift');
    parts.push(describeKey(parsed.key));
    return [parts];
  }

  function normalizeEventKey(key) {
    if (typeof key !== 'string') return '';
    if (key === ' ') return 'space';
    return canonicalizeKey(key);
  }

  function buildShortcutFromEvent(event) {
    if (!event) return null;
    const key = normalizeEventKey(event.key || event.code);
    if (!key) return null;
    if (key === 'shift' || key === 'alt' || key === 'control' || key === 'meta' || key === 'cmd') {
      return null;
    }
    const combo = {
      alt: event.altKey || false,
      shift: event.shiftKey || false,
      ctrl: event.ctrlKey || false,
      meta: event.metaKey || false,
      key
    };
    if (!combo.alt && !combo.ctrl && !combo.meta) {
      return null;
    }
    return combo;
  }

  function eventMatchesShortcut(event, combo) {
    if (!combo) return false;
    const normalizedKey = normalizeEventKey(event.key);
    if (!normalizedKey) return false;
    if (normalizedKey !== combo.key) return false;
    if (!!event.altKey !== !!combo.alt) return false;
    if (!!event.shiftKey !== !!combo.shift) return false;
    if (!!event.ctrlKey !== !!combo.ctrl) return false;
    if (!!event.metaKey !== !!combo.meta) return false;
    return true;
  }

  let activeShortcutCombos = new Map();
  const shortcutDisplayElements = new Map();
  const customShortcutDisplays = new Map();
  const shortcutRecordButtons = new Map();
  let shortcutStatusElement = null;
  let recordingShortcutId = null;
  let cancelRecordingHandler = null;

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
        state.set('spacing.lineHeight', 1.9);
        state.set('spacing.letterSpacing', 0.08);
        state.set('tts.rate', 0.9);
        state.set('tts.pitch', 0.9);
        state.set('tts.volume', 1);
        state.set('audio.theme', 'vigilance');
        state.set('audio.masterVolume', 1);
        state.set('audio.events.alert.volume', 1);
        state.set('audio.events.alert.timbre', 'bright');
        state.set('audio.events.confirm.volume', 0.9);
        state.set('audio.events.info.volume', 0.85);
        window.a11ytb?.logActivity?.(
          'Vision basse : paramètres audio appliqués (thème vigilance, volume maître 100 %, alertes renforcées).',
          {
            tone: 'info',
            tags: ['audio', 'profil'],
            profile: 'vision-low',
            audio: {
              theme: 'vigilance',
              masterVolume: 1,
              events: {
                alert: { volume: 1, timbre: 'bright' },
                confirm: { volume: 0.9 },
                info: { volume: 0.85 }
              }
            }
          }
        );
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
        state.set('contrast.enabled', true);
        state.set('spacing.lineHeight', 1.8);
        state.set('spacing.letterSpacing', 0.12);
        state.set('tts.rate', 0.85);
        state.set('tts.pitch', 1);
        state.set('tts.volume', 0.95);
        state.set('audio.theme', 'calm-focus');
        state.set('audio.masterVolume', 0.85);
        state.set('audio.events.alert.volume', 0.85);
        state.set('audio.events.confirm.volume', 0.7);
        state.set('audio.events.info.volume', 0.6);
        window.a11ytb?.logActivity?.(
          'Confort de lecture : paramètres audio appliqués (thème calm-focus, volume maître 85 %, alertes adoucies).',
          {
            tone: 'info',
            tags: ['audio', 'profil'],
            profile: 'reading-comfort',
            audio: {
              theme: 'calm-focus',
              masterVolume: 0.85,
              events: {
                alert: { volume: 0.85 },
                confirm: { volume: 0.7 },
                info: { volume: 0.6 }
              }
            }
          }
        );
      }
    }
  ];
  const profileMap = new Map(accessibilityProfiles.map(profile => [profile.id, profile]));

  function getPriorityEntry(priorityId) {
    if (!priorityId) return null;
    return PRIORITY_LOOKUP.get(priorityId) || null;
  }

  function getPriorityWeight(priorityId) {
    const entry = getPriorityEntry(priorityId);
    return typeof entry?.weight === 'number' ? entry.weight : PRIORITY_DEFAULT_WEIGHT;
  }

  function getPriorityDescription(priorityId) {
    const entry = getPriorityEntry(priorityId);
    return entry?.description || PRIORITY_DEFAULT_DESCRIPTION;
  }

  function getPriorityShortLabel(priorityId) {
    const entry = getPriorityEntry(priorityId);
    return entry?.shortLabel || '';
  }

  function normalizePriorityObject(input) {
    if (!input || typeof input !== 'object') return {};
    const normalized = {};
    Object.entries(input).forEach(([id, priority]) => {
      if (typeof priority === 'string' && PRIORITY_LOOKUP.has(priority)) {
        normalized[id] = priority;
      }
    });
    return normalized;
  }

  function shallowEqualObjects(a = {}, b = {}) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => Object.is(a[key], b[key]));
  }

  function arraysEqual(a = [], b = []) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function getShortcutOverrides(snapshot) {
    return snapshot?.ui?.shortcuts?.overrides || state.get('ui.shortcuts.overrides') || {};
  }

  function resolveShortcutCombo(actionId, snapshot) {
    const definition = CUSTOM_SHORTCUT_LOOKUP.get(actionId);
    if (!definition) return { raw: '', parsed: null };
    const overrides = getShortcutOverrides(snapshot);
    const raw = overrides?.[actionId] || definition.default;
    const parsed = parseShortcutCombo(raw) || parseShortcutCombo(definition.default);
    if (!parsed) {
      return { raw: '', parsed: null };
    }
    return {
      raw: serializeShortcutCombo(parsed),
      parsed
    };
  }

  function updateActiveShortcuts(snapshot) {
    const next = new Map();
    CUSTOM_SHORTCUT_DEFINITIONS.forEach((definition) => {
      const resolved = resolveShortcutCombo(definition.id, snapshot);
      if (resolved.parsed) {
        next.set(definition.id, resolved);
      }
    });
    activeShortcutCombos = next;
  }

  function getShortcutDisplayParts(actionId, snapshot) {
    const resolved = resolveShortcutCombo(actionId, snapshot);
    return shortcutPartsFromCombo(resolved.parsed);
  }

  function renderShortcutDisplay(actionId, element, snapshot) {
    if (!element) return;
    const parts = getShortcutDisplayParts(actionId, snapshot);
    element.innerHTML = '';
    if (!parts.length) {
      element.textContent = 'Non défini';
      element.dataset.empty = 'true';
      return;
    }
    element.dataset.empty = 'false';
    element.append(createShortcutComboElement(parts));
  }

  function refreshShortcutDisplays(snapshot) {
    shortcutDisplayElements.forEach((element, actionId) => {
      renderShortcutDisplay(actionId, element, snapshot);
    });
    customShortcutDisplays.forEach((element, actionId) => {
      renderShortcutDisplay(actionId, element, snapshot);
    });
  }

  function buildShortcutSummary(snapshot) {
    const highlightOrder = ['toggle-panel', 'view-options', 'view-shortcuts'];
    const parts = highlightOrder
      .map((id) => resolveShortcutCombo(id, snapshot).raw)
      .filter(Boolean);
    if (!parts.length) {
      return 'Raccourcis : définissez vos propres combinaisons.';
    }
    return `Raccourcis : ${parts.join(' • ')}`;
  }

  function setShortcutStatus(message, tone = 'info') {
    if (!shortcutStatusElement) return;
    shortcutStatusElement.textContent = message || '';
    shortcutStatusElement.dataset.tone = tone;
  }

  function stopShortcutRecording({ cancelled = false } = {}) {
    if (cancelRecordingHandler) {
      window.removeEventListener('keydown', cancelRecordingHandler, true);
      cancelRecordingHandler = null;
    }
    if (recordingShortcutId && shortcutRecordButtons.has(recordingShortcutId)) {
      shortcutRecordButtons.get(recordingShortcutId).classList.remove('is-recording');
      shortcutRecordButtons.get(recordingShortcutId).removeAttribute('aria-live');
    }
    if (cancelled) {
      setShortcutStatus('Enregistrement annulé.', 'info');
    }
    recordingShortcutId = null;
  }

  function startShortcutRecording(actionId) {
    const definition = CUSTOM_SHORTCUT_LOOKUP.get(actionId);
    if (!definition) return;
    stopShortcutRecording();
    recordingShortcutId = actionId;
    const button = shortcutRecordButtons.get(actionId);
    if (button) {
      button.classList.add('is-recording');
      button.setAttribute('aria-live', 'assertive');
      button.focus();
    }
    setShortcutStatus(`Appuyez sur la nouvelle combinaison pour « ${definition.label} » (Échap pour annuler).`, 'info');
    cancelRecordingHandler = (event) => {
      if (!recordingShortcutId) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        stopShortcutRecording({ cancelled: true });
        return;
      }
      const combo = buildShortcutFromEvent(event);
      if (!combo) {
        if (!event.metaKey && !event.ctrlKey && !event.altKey) {
          setShortcutStatus('Utilisez au moins Alt, Ctrl ou Cmd pour définir le raccourci.', 'warning');
        }
        return;
      }
      event.preventDefault();
      const serialized = serializeShortcutCombo(combo);
      const overrides = { ...getShortcutOverrides() };
      overrides[actionId] = serialized;
      state.set('ui.shortcuts.overrides', overrides);
      state.set('ui.shortcuts.lastRecorded', { id: actionId, combo: serialized, timestamp: Date.now() });
      logActivity(`Raccourci mis à jour : ${definition.label}`, { tone: 'confirm', tags: ['raccourcis', actionId] });
      stopShortcutRecording();
      setShortcutStatus(`Nouveau raccourci enregistré : ${serialized}`, 'confirm');
    };
    window.addEventListener('keydown', cancelRecordingHandler, true);
  }

  function resetShortcut(actionId) {
    const definition = CUSTOM_SHORTCUT_LOOKUP.get(actionId);
    if (!definition) return;
    const overrides = { ...getShortcutOverrides() };
    if (overrides[actionId]) {
      delete overrides[actionId];
      state.set('ui.shortcuts.overrides', overrides);
      logActivity(`Raccourci réinitialisé : ${definition.label}`, { tone: 'info', tags: ['raccourcis', actionId] });
    }
    stopShortcutRecording();
    const restored = serializeShortcutCombo(parseShortcutCombo(definition.default));
    setShortcutStatus(`Raccourci restauré : ${restored || definition.default}`, 'info');
  }

  function setListIfChanged(path, next, current = state.get(path)) {
    const reference = Array.isArray(current) ? current : [];
    if (!arraysEqual(next, reference)) {
      state.set(path, next);
    }
  }

  const MODAL_FOCUSABLE = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function getProfilesState() {
    return state.get('profiles') || {};
  }

  function saveProfilesState(next) {
    state.set('profiles', next);
  }

  function getFocusableIn(container) {
    return Array.from(container.querySelectorAll(MODAL_FOCUSABLE))
      .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
  }

  function openModalDialog(options = {}) {
    const mode = options.mode || 'alert';
    const ownerDocument = root?.ownerDocument || document;
    const overlay = ownerDocument.createElement('div');
    overlay.className = 'a11ytb-modal-backdrop';

    const dialog = ownerDocument.createElement('form');
    dialog.className = 'a11ytb-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.noValidate = true;

    const body = ownerDocument.body;
    const host = body || ownerDocument.documentElement || ownerDocument;
    const stamp = Date.now();
    let labelledBy = null;
    let describedBy = null;
    const titleId = `a11ytb-modal-title-${stamp}`;
    if (options.title) {
      const heading = ownerDocument.createElement('h3');
      heading.className = 'a11ytb-modal-title';
      heading.id = titleId;
      heading.textContent = options.title;
      dialog.append(heading);
      labelledBy = heading.id;
    } else if (options.ariaLabel) {
      dialog.setAttribute('aria-label', options.ariaLabel);
    }

    if (options.description) {
      const description = ownerDocument.createElement('p');
      description.className = 'a11ytb-modal-description';
      description.id = `a11ytb-modal-description-${stamp}`;
      description.textContent = options.description;
      dialog.append(description);
      describedBy = description.id;
    }

    let input = null;
    let error = null;
    if (mode === 'prompt') {
      const field = ownerDocument.createElement('div');
      field.className = 'a11ytb-modal-field';
      const inputId = `a11ytb-modal-input-${stamp}`;
      const label = ownerDocument.createElement('label');
      label.className = 'a11ytb-modal-label';
      label.setAttribute('for', inputId);
      label.textContent = options.inputLabel || 'Valeur';

      if (options.multiline) {
        input = ownerDocument.createElement('textarea');
        input.rows = options.rows || 6;
      } else {
        input = ownerDocument.createElement('input');
        input.type = options.inputType || 'text';
      }
      input.className = 'a11ytb-modal-input';
      input.id = inputId;
      input.value = options.defaultValue || '';
      if (options.placeholder) {
        input.placeholder = options.placeholder;
      }
      field.append(label, input);
      dialog.append(field);

      error = ownerDocument.createElement('p');
      error.className = 'a11ytb-modal-error';
      error.hidden = true;
      dialog.append(error);
    }

    if (labelledBy) {
      dialog.setAttribute('aria-labelledby', labelledBy);
    }
    if (describedBy) {
      dialog.setAttribute('aria-describedby', describedBy);
    }

    const actions = ownerDocument.createElement('div');
    actions.className = 'a11ytb-modal-actions';
    const confirmBtn = ownerDocument.createElement('button');
    confirmBtn.type = 'submit';
    confirmBtn.className = 'a11ytb-button';
    confirmBtn.textContent = options.confirmLabel || 'Valider';
    actions.append(confirmBtn);

    let cancelBtn = null;
    if (mode !== 'alert') {
      cancelBtn = ownerDocument.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'a11ytb-button a11ytb-button--ghost';
      cancelBtn.textContent = options.cancelLabel || 'Annuler';
      actions.append(cancelBtn);
    }

    dialog.append(actions);
    overlay.append(dialog);
    host.append(overlay);

    const releaseInert = applyInertToSiblings(overlay, { ownerDocument });
    if (body) {
      body.classList.add('a11ytb-modal-open');
    }

    const previouslyFocused = ownerDocument.activeElement;
    let resolveDialog;
    const promise = new Promise((resolve) => {
      resolveDialog = resolve;
    });

    function cleanup(result) {
      dialog.removeEventListener('keydown', onKeyDown, true);
      overlay.removeEventListener('click', onBackdropClick);
      overlay.remove();
      if (typeof releaseInert === 'function') {
        releaseInert();
      }
      if (!ownerDocument.querySelector('.a11ytb-modal-backdrop') && body) {
        body.classList.remove('a11ytb-modal-open');
      }
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try {
          previouslyFocused.focus({ preventScroll: true });
        } catch (error) {
          previouslyFocused.focus();
        }
      }
      resolveDialog(result);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (mode === 'alert') {
          cleanup(undefined);
        } else {
          cleanup(null);
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusableIn(dialog);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey) {
        if (ownerDocument.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (ownerDocument.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onBackdropClick(event) {
      if (event.target === overlay && mode !== 'alert') {
        event.preventDefault();
        cleanup(null);
      }
    }

    dialog.addEventListener('keydown', onKeyDown, true);
    overlay.addEventListener('click', onBackdropClick);

    dialog.addEventListener('submit', (event) => {
      event.preventDefault();
      if (mode === 'prompt') {
        const rawValue = input.value;
        const value = options.trimValue === false ? rawValue : rawValue.trim();
        if (!value && options.requireValue !== false) {
          if (error) {
            error.hidden = false;
            error.textContent = options.emptyMessage || 'Veuillez renseigner une valeur.';
          }
          try {
            input.focus({ preventScroll: true });
          } catch (focusError) {
            input.focus();
          }
          return;
        }
        cleanup(value);
      } else {
        cleanup(true);
      }
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', (event) => {
        event.preventDefault();
        cleanup(null);
      });
    }

    setTimeout(() => {
      const focusTarget = mode === 'prompt' && input ? input : confirmBtn;
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (error) {
        focusTarget.focus();
      }
    }, 0);

    return promise;
  }

  async function duplicateProfile(profileId) {
    const profiles = getProfilesState();
    const original = profiles?.[profileId];
    if (!original) return;
    const defaultName = `${original.name || profileId} (copie)`;
    const nameInput = await openModalDialog({
      mode: 'prompt',
      title: 'Dupliquer le profil',
      description: `Créer une copie de « ${original.name || profileId} ».`,
      defaultValue: defaultName,
      confirmLabel: 'Créer',
      cancelLabel: 'Annuler',
      inputLabel: 'Nom du nouveau profil',
      requireValue: true
    });
    if (!nameInput) return;
    const trimmedName = nameInput;
    const clone = cloneProfileDefinition(original);
    clone.name = trimmedName;
    clone.preset = false;
    clone.createdAt = Date.now();
    clone.source = profileId;
    const baseId = slugifyProfileId(trimmedName) || `profil-${Date.now()}`;
    const newId = ensureUniqueProfileId(baseId, profiles);
    const next = { ...profiles, [newId]: clone };
    saveProfilesState(next);
    logActivity(`Profil dupliqué : ${trimmedName}`, { tone: 'confirm', tags: ['profils', 'duplication'] });
  }

  async function exportProfile(profileId) {
    const profiles = getProfilesState();
    const profile = profiles?.[profileId];
    if (!profile) return;
    const payload = JSON.stringify({ id: profileId, ...profile }, null, 2);
    const copied = await copyToClipboard(payload);
    if (copied) {
      logActivity(`Profil copié : ${profile.name || profileId}`, { tone: 'confirm', tags: ['profils', 'export'] });
    } else {
      downloadText(`a11ytb-profile-${profileId}.json`, payload, 'application/json');
      logActivity(`Profil exporté : ${profile.name || profileId}`, { tone: 'info', tags: ['profils', 'export'] });
    }
  }

  async function deleteProfile(profileId) {
    const profiles = getProfilesState();
    const profile = profiles?.[profileId];
    if (!profile || profile.preset) return;
    const name = profile.name || profileId;
    const confirmed = await openModalDialog({
      mode: 'confirm',
      title: 'Supprimer le profil',
      description: `Confirmez la suppression de « ${name} ».`,
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler'
    });
    if (!confirmed) return;
    const next = { ...profiles };
    delete next[profileId];
    saveProfilesState(next);
    if (state.get('ui.lastProfile') === profileId) {
      state.set('ui.lastProfile', null);
    }
    logActivity(`Profil supprimé : ${name}`, { tone: 'warning', tags: ['profils', 'suppression'] });
  }

  async function renameProfile(profileId) {
    const profiles = getProfilesState();
    const profile = profiles?.[profileId];
    if (!profile || profile.preset) return;
    const currentName = profile.name || profileId;
    const nameInput = await openModalDialog({
      mode: 'prompt',
      title: 'Renommer le profil',
      description: `Renommer « ${currentName} ».`,
      defaultValue: currentName,
      confirmLabel: 'Renommer',
      cancelLabel: 'Annuler',
      inputLabel: 'Nouveau nom',
      requireValue: true
    });
    if (!nameInput || nameInput === currentName) return;
    const trimmed = nameInput;
    const next = { ...profiles, [profileId]: { ...profile, name: trimmed } };
    saveProfilesState(next);
    logActivity(`Profil renommé : ${trimmed}`, { tone: 'info', tags: ['profils', 'renommage'] });
  }

  function normalizeImportedProfile(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const settings = raw.settings && typeof raw.settings === 'object' ? { ...raw.settings } : {};
    const normalized = {
      name: typeof raw.name === 'string' ? raw.name.trim() : undefined,
      summary: typeof raw.summary === 'string' ? raw.summary : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.filter(Boolean).map(String) : undefined,
      tone: typeof raw.tone === 'string' ? raw.tone : undefined,
      activity: typeof raw.activity === 'string' ? raw.activity : undefined,
      settings,
      preset: false,
      source: raw.source || null,
      createdAt: Date.now()
    };
    return normalized;
  }

  async function importProfileFromPrompt() {
    const input = await openModalDialog({
      mode: 'prompt',
      title: 'Importer un profil',
      description: 'Collez le JSON du profil à importer.',
      confirmLabel: 'Importer',
      cancelLabel: 'Annuler',
      inputLabel: 'JSON du profil',
      multiline: true,
      trimValue: false,
      requireValue: true,
      emptyMessage: 'Veuillez coller un JSON valide.'
    });
    if (!input) return;
    try {
      const parsed = JSON.parse(input);
      const normalized = normalizeImportedProfile(parsed);
      if (!normalized) {
        await openModalDialog({
          mode: 'alert',
          title: 'Import impossible',
          description: 'Profil invalide : paramètres manquants.'
        });
        return;
      }
      const profiles = getProfilesState();
      const baseId = slugifyProfileId(parsed.id || normalized.name) || `profil-${Date.now()}`;
      const profileId = ensureUniqueProfileId(baseId, profiles);
      const next = { ...profiles, [profileId]: normalized };
      saveProfilesState(next);
      const label = normalized.name || profileId;
      logActivity(`Profil importé : ${label}`, { tone: 'confirm', tags: ['profils', 'import'] });
    } catch (error) {
      console.warn('a11ytb: profil importé invalide.', error);
      await openModalDialog({
        mode: 'alert',
        title: 'Import impossible',
        description: 'Impossible de lire ce profil. Vérifiez le format JSON.'
      });
    }
  }

  function createBadge(label, variant, { title, ariaLabel } = {}) {
    const badge = document.createElement('span');
    badge.className = 'a11ytb-module-badge';
    if (variant) {
      badge.classList.add(`a11ytb-module-badge--${variant}`);
    }
    badge.textContent = label;
    if (title) {
      badge.title = title;
    }
    if (ariaLabel) {
      badge.setAttribute('aria-label', ariaLabel);
    }
    return badge;
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

  const fullscreenIcons = {
    expand: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 4h7v2H6v5H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h5v2H4v-6zm12 4v-4h2v6h-6v-2z"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 4v2H6v4H4V4h4zm14 4h-4V6h-2V4h6v4zM4 20v-6h2v4h2v2H4zm18-6v6h-6v-2h4v-4h2z"/></svg>'
  };

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
  panel.dataset.fullscreen = String(!!state.get('ui.fullscreen'));
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
      <button class="a11ytb-button" data-action="toggle-fullscreen" aria-pressed="false">
        <span class="a11ytb-button-icon" data-ref="fullscreen-icon" aria-hidden="true">${fullscreenIcons.expand}</span>
        <span class="a11ytb-button-label" data-ref="fullscreen-label">Plein écran</span>
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

  const fullscreenToggle = header.querySelector('[data-action="toggle-fullscreen"]');
  const fullscreenIcon = fullscreenToggle?.querySelector('[data-ref="fullscreen-icon"]');
  const fullscreenLabel = fullscreenToggle?.querySelector('[data-ref="fullscreen-label"]');

  const body = document.createElement('div');
  body.className = 'a11ytb-body';

  const shell = document.createElement('div');
  shell.className = 'a11ytb-shell';

  const shellNav = document.createElement('div');
  shellNav.className = 'a11ytb-shell-nav';

  const shellMain = document.createElement('div');
  shellMain.className = 'a11ytb-shell-main';

  const statusCenter = document.createElement('section');
  statusCenter.className = 'a11ytb-status-center';
  statusCenter.setAttribute('role', 'region');
  statusCenter.setAttribute('aria-label', 'État en temps réel des modules vocaux, braille et vision');

  const statusHeader = document.createElement('div');
  statusHeader.className = 'a11ytb-status-header';
  const statusTitle = document.createElement('h2');
  statusTitle.className = 'a11ytb-status-title';
  statusTitle.textContent = 'État en temps réel';
  const statusDescription = document.createElement('p');
  statusDescription.className = 'a11ytb-status-description';
  statusDescription.textContent = 'Consultez l’indice global de conformité et l’état des modules Lecture vocale, Dictée, Braille, Contraste et Espacements.';
  statusHeader.append(statusTitle, statusDescription);

  const statusGrid = document.createElement('div');
  statusGrid.className = 'a11ytb-status-grid';

  const aggregationSection = document.createElement('section');
  aggregationSection.className = 'a11ytb-status-aggregations';
  aggregationSection.setAttribute('role', 'region');
  aggregationSection.setAttribute('aria-label', 'Synthèse agrégée des métriques');

  const aggregationHeader = document.createElement('div');
  aggregationHeader.className = 'a11ytb-status-header';
  const aggregationTitle = document.createElement('h3');
  aggregationTitle.className = 'a11ytb-status-title';
  aggregationTitle.textContent = 'Tendances consolidées';
  const aggregationDescription = document.createElement('p');
  aggregationDescription.className = 'a11ytb-status-description';
  aggregationDescription.textContent = 'Comparez les performances des modules par profil ou collection.';
  aggregationHeader.append(aggregationTitle, aggregationDescription);

  const aggregationFilters = document.createElement('div');
  aggregationFilters.className = 'a11ytb-status-filters';

  const profileFilterId = 'a11ytb-status-filter-profile';
  const aggregationProfileLabel = document.createElement('label');
  aggregationProfileLabel.setAttribute('for', profileFilterId);
  aggregationProfileLabel.textContent = 'Profil';
  const aggregationProfileSelect = document.createElement('select');
  aggregationProfileSelect.id = profileFilterId;
  aggregationProfileSelect.setAttribute('aria-label', 'Filtrer les métriques agrégées par profil');

  const collectionFilterId = 'a11ytb-status-filter-collection';
  const aggregationCollectionLabel = document.createElement('label');
  aggregationCollectionLabel.setAttribute('for', collectionFilterId);
  aggregationCollectionLabel.textContent = 'Collection';
  const aggregationCollectionSelect = document.createElement('select');
  aggregationCollectionSelect.id = collectionFilterId;
  aggregationCollectionSelect.setAttribute('aria-label', 'Filtrer les métriques agrégées par collection');

  aggregationFilters.append(
    aggregationProfileLabel,
    aggregationProfileSelect,
    aggregationCollectionLabel,
    aggregationCollectionSelect
  );

  const aggregationList = document.createElement('div');
  aggregationList.className = 'a11ytb-aggregation-list';
  aggregationList.setAttribute('role', 'list');

  const aggregationLive = document.createElement('p');
  aggregationLive.className = 'a11ytb-sr-only';
  aggregationLive.setAttribute('aria-live', 'assertive');

  aggregationSection.append(aggregationHeader, aggregationFilters, aggregationList, aggregationLive);

  statusCenter.append(statusHeader, statusGrid, aggregationSection);

  let collectionDefinitions = [];
  let collectionById = new Map();
  let moduleCollectionsIndex = new Map();
  let collectionBlockIds = new Map();

  const statusCards = new Map();

  const aggregationFilterState = { profile: 'all', collection: 'all' };
  const aggregationTimeFormatter = typeof Intl?.DateTimeFormat === 'function'
    ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const aggregationDayFormatter = typeof Intl?.DateTimeFormat === 'function'
    ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })
    : null;

  function setAggregationSelectOptions(select, options, preferredValue = 'all') {
    const allowedValues = new Set(options.map((option) => option.value));
    select.innerHTML = '';
    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      if (option.ariaLabel) {
        opt.setAttribute('aria-label', option.ariaLabel);
      }
      select.append(opt);
    });
    const nextValue = allowedValues.has(preferredValue)
      ? preferredValue
      : (options[0]?.value || 'all');
    select.value = nextValue;
    return nextValue;
  }

  function formatAggregationWindow(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return 'Fenêtre temporelle indisponible';
    }
    if (aggregationTimeFormatter && aggregationDayFormatter) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const sameDay = startDate.toDateString() === endDate.toDateString();
      const dayLabel = sameDay
        ? aggregationDayFormatter.format(startDate)
        : `${aggregationDayFormatter.format(startDate)} → ${aggregationDayFormatter.format(endDate)}`;
      const timeLabel = `${aggregationTimeFormatter.format(startDate)} → ${aggregationTimeFormatter.format(endDate)}`;
      return `${dayLabel} · ${timeLabel}`;
    }
    return `Fenêtre ${new Date(start).toLocaleString()} → ${new Date(end).toLocaleString()}`;
  }

  function toneFromAggregatedScore(score) {
    const normalized = typeof score === 'string' ? score.trim().toUpperCase() : 'AAA';
    if (normalized === 'C' || normalized === 'B') return 'alert';
    if (normalized === 'A') return 'warning';
    if (normalized === 'AA') return 'active';
    return 'info';
  }

  function createAggregationChart(successes = 0, failures = 0) {
    const total = Math.max(0, Number(successes) + Number(failures));
    const successRatio = total > 0 ? Math.max(0, Math.min(100, (Number(successes) / total) * 100)) : 0;
    const failureRatio = total > 0 ? Math.max(0, Math.min(100, (Number(failures) / total) * 100)) : 0;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 12');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('role', 'img');
    const labelParts = [];
    if (total > 0) {
      labelParts.push(`${Math.round(successRatio)} % succès`);
      labelParts.push(`${Math.round(failureRatio)} % échecs`);
    } else {
      labelParts.push('Aucun échantillon');
    }
    svg.setAttribute('aria-label', labelParts.join(' · '));
    const successRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    successRect.setAttribute('x', '0');
    successRect.setAttribute('y', '0');
    successRect.setAttribute('height', '12');
    successRect.setAttribute('width', String(successRatio));
    successRect.setAttribute('fill', '#1b873f');
    const failureRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    failureRect.setAttribute('x', String(successRatio));
    failureRect.setAttribute('y', '0');
    failureRect.setAttribute('height', '12');
    failureRect.setAttribute('width', String(failureRatio));
    failureRect.setAttribute('fill', '#d1345b');
    svg.append(successRect, failureRect);
    return svg;
  }

  function handleAggregationKeyNav(event) {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
    const cards = Array.from(aggregationList.querySelectorAll('[data-aggregation-card="true"]'));
    const currentIndex = cards.indexOf(event.currentTarget);
    if (currentIndex === -1 || cards.length === 0) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % cards.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + cards.length) % cards.length;
    }
    cards[nextIndex]?.focus();
  }

  function createAggregationCard(windowData, runtimeEntry) {
    const card = document.createElement('article');
    card.className = 'a11ytb-status-card a11ytb-status-card--aggregation';
    card.dataset.aggregationCard = 'true';
    card.dataset.tone = toneFromAggregatedScore(windowData.score || 'AAA');
    card.setAttribute('role', 'listitem');
    card.tabIndex = 0;

    const header = document.createElement('div');
    header.className = 'a11ytb-status-card-header';
    const label = document.createElement('span');
    const labelId = `a11ytb-aggregation-label-${windowData.moduleId}`;
    label.id = labelId;
    label.className = 'a11ytb-status-label';
    label.textContent = windowData.moduleLabel || runtimeEntry?.manifestName || windowData.moduleId;
    header.append(label);

    const scoreBadge = document.createElement('span');
    scoreBadge.className = 'a11ytb-status-risk';
    scoreBadge.dataset.score = windowData.score || 'AAA';
    scoreBadge.textContent = windowData.score || 'AAA';
    scoreBadge.setAttribute('aria-label', `Indice ${windowData.score || 'AAA'}`);
    header.append(scoreBadge);

    const chart = createAggregationChart(windowData.successes, windowData.failures);
    chart.setAttribute('aria-labelledby', labelId);

    const counters = document.createElement('p');
    counters.className = 'a11ytb-status-detail';
    const sampleCount = windowData.samples || 0;
    const sampleLabel = sampleCount === 1 ? '1 échantillon' : `${sampleCount} échantillons`;
    counters.textContent = `${windowData.successes || 0} succès · ${windowData.failures || 0} échecs · ${sampleLabel}`;

    const timeframe = document.createElement('p');
    timeframe.className = 'a11ytb-status-detail';
    timeframe.textContent = formatAggregationWindow(windowData.windowStart, windowData.windowEnd);

    const meta = document.createElement('dl');
    meta.className = 'a11ytb-status-meta';
    const latencyTerm = document.createElement('dt');
    latencyTerm.textContent = 'Latence combinée';
    const latencyValue = document.createElement('dd');
    const combinedAverage = windowData.latency?.combinedAverage;
    latencyValue.textContent = Number.isFinite(combinedAverage)
      ? `${Math.round(combinedAverage)} ms`
      : 'Non mesuré';
    const retryTerm = document.createElement('dt');
    retryTerm.textContent = 'Retentatives';
    const retryValue = document.createElement('dd');
    retryValue.textContent = String(windowData.retryCount ?? 0);
    meta.append(latencyTerm, latencyValue, retryTerm, retryValue);

    card.append(header, chart, counters, timeframe, meta);
    card.addEventListener('keydown', handleAggregationKeyNav);
    return card;
  }

  const namespaceToModule = new Map([
    ['contrast', 'contrast'],
    ['spacing', 'spacing'],
    ['tts', 'tts'],
    ['stt', 'stt'],
    ['braille', 'braille'],
    ['audio', 'audio-feedback'],
    ['audit', 'audit']
  ]);

  function extractModulesFromProfile(settings = {}) {
    const modules = new Set();
    Object.keys(settings).forEach((path) => {
      if (typeof path !== 'string') return;
      const namespace = path.split('.')[0];
      if (!namespace) return;
      const moduleId = namespaceToModule.get(namespace);
      if (moduleId) {
        modules.add(moduleId);
      }
    });
    return Array.from(modules);
  }

  function updateAggregationPanel(snapshot = state.get()) {
    const data = snapshot || state.get();
    const filterPrefs = data?.ui?.statusFilters || {};
    const preferredProfile = filterPrefs.profile || 'all';
    const preferredCollection = filterPrefs.collection || 'all';

    const profileOptions = [{ value: 'all', label: 'Tous les profils' }];
    const moduleProfileIndex = new Map();
    const profilesData = data?.profiles || {};
    Object.entries(profilesData).forEach(([profileId, profile]) => {
      const modules = extractModulesFromProfile(profile?.settings || {});
      if (!modules.length) return;
      profileOptions.push({ value: profileId, label: profile?.name || profileId });
      modules.forEach((moduleId) => {
        if (!moduleProfileIndex.has(moduleId)) {
          moduleProfileIndex.set(moduleId, new Set());
        }
        moduleProfileIndex.get(moduleId).add(profileId);
      });
    });

    const nextProfile = setAggregationSelectOptions(aggregationProfileSelect, profileOptions, preferredProfile);
    aggregationFilterState.profile = nextProfile;
    if (preferredProfile !== nextProfile) {
      state.set('ui.statusFilters.profile', nextProfile);
    }

    const collectionOptions = [{ value: 'all', label: 'Toutes les collections' }];
    collectionDefinitions.forEach((definition) => {
      collectionOptions.push(formatCollectionOption(definition));
    });
    const nextCollection = setAggregationSelectOptions(aggregationCollectionSelect, collectionOptions, preferredCollection);
    aggregationFilterState.collection = nextCollection;
    if (preferredCollection !== nextCollection) {
      state.set('ui.statusFilters.collection', nextCollection);
    }

    const metricsSyncState = data?.runtime?.metricsSync || {};
    const windows = Array.isArray(metricsSyncState.activeWindows) ? metricsSyncState.activeWindows : [];
    aggregationList.innerHTML = '';

    if (!windows.length) {
      const empty = document.createElement('p');
      empty.className = 'a11ytb-empty-state';
      empty.textContent = 'Aucune mesure agrégée pour les filtres sélectionnés.';
      aggregationList.append(empty);
      aggregationLive.textContent = 'Aucune alerte consolidée.';
      return;
    }

    const runtimeModules = data?.runtime?.modules || {};
    let criticalCount = 0;
    let warningCount = 0;

    const filteredWindows = windows.filter((windowData) => {
      const moduleId = windowData.moduleId;
      const profileSet = moduleProfileIndex.get(moduleId) || new Set();
      const matchesProfile = aggregationFilterState.profile === 'all'
        || profileSet.has(aggregationFilterState.profile);
      if (!matchesProfile) return false;
      const collectionCandidates = new Set(Array.isArray(windowData.collections) ? windowData.collections : []);
      const indexedCollections = moduleCollectionsIndex.get(moduleId);
      if (indexedCollections && typeof indexedCollections.forEach === 'function') {
        indexedCollections.forEach((id) => collectionCandidates.add(id));
      }
      const matchesCollection = aggregationFilterState.collection === 'all'
        || collectionCandidates.has(aggregationFilterState.collection);
      return matchesCollection;
    }).sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

    if (!filteredWindows.length) {
      const empty = document.createElement('p');
      empty.className = 'a11ytb-empty-state';
      empty.textContent = 'Aucune mesure agrégée pour les filtres sélectionnés.';
      aggregationList.append(empty);
      aggregationLive.textContent = 'Aucune alerte consolidée.';
      return;
    }

    filteredWindows.forEach((windowData) => {
      const runtimeEntry = runtimeModules[windowData.moduleId] || {};
      const card = createAggregationCard(windowData, runtimeEntry);
      aggregationList.append(card);
      const incidents = Array.isArray(windowData.incidents) ? windowData.incidents : [];
      incidents.forEach((incident) => {
        if (incident.severity === 'warning') {
          warningCount += 1;
        } else if (incident.severity === 'error') {
          criticalCount += 1;
        }
      });
    });

    const alertParts = [];
    if (criticalCount > 0) {
      alertParts.push(`${criticalCount} alerte${criticalCount > 1 ? 's' : ''} critiques`);
    }
    if (warningCount > 0) {
      alertParts.push(`${warningCount} avertissement${warningCount > 1 ? 's' : ''}`);
    }
    aggregationLive.textContent = alertParts.length
      ? `Alertes consolidées : ${alertParts.join(' · ')}.`
      : 'Aucune alerte consolidée.';
  }

  aggregationProfileSelect.addEventListener('change', () => {
    aggregationFilterState.profile = aggregationProfileSelect.value || 'all';
    state.set('ui.statusFilters.profile', aggregationFilterState.profile);
  });

  aggregationCollectionSelect.addEventListener('change', () => {
    aggregationFilterState.collection = aggregationCollectionSelect.value || 'all';
    state.set('ui.statusFilters.collection', aggregationFilterState.collection);
  });

  function ensureStatusCard(summary) {
    let entry = statusCards.get(summary.id);
    if (!entry) {
      const card = document.createElement('article');
      card.className = 'a11ytb-status-card';
      card.dataset.statusId = summary.id;
      card.setAttribute('role', 'group');

      const headerRow = document.createElement('div');
      headerRow.className = 'a11ytb-status-card-header';

      const label = document.createElement('span');
      label.className = 'a11ytb-status-label';
      label.id = `a11ytb-status-label-${summary.id}`;
      label.textContent = summary.label;

      const badge = document.createElement('span');
      badge.className = 'a11ytb-badge';

      const risk = document.createElement('span');
      risk.className = 'a11ytb-status-risk';
      risk.dataset.ref = 'risk';
      risk.setAttribute('role', 'status');
      risk.setAttribute('aria-live', 'polite');
      risk.hidden = true;

      headerRow.append(label, badge, risk);

      const value = document.createElement('p');
      value.className = 'a11ytb-status-value';
      value.dataset.ref = 'value';
      value.setAttribute('role', 'status');
      value.setAttribute('aria-live', summary.live || 'polite');
      value.setAttribute('aria-labelledby', label.id);

      const detail = document.createElement('p');
      detail.className = 'a11ytb-status-detail';
      detail.dataset.ref = 'detail';

      const meta = document.createElement('dl');
      meta.className = 'a11ytb-status-meta';

      const latencyTerm = document.createElement('dt');
      latencyTerm.textContent = 'Latence moyenne';
      const latencyValue = document.createElement('dd');
      latencyValue.dataset.ref = 'latency';
      latencyValue.textContent = 'Non mesuré';

      const compatTerm = document.createElement('dt');
      compatTerm.textContent = 'Compatibilité';
      const compatValue = document.createElement('dd');
      compatValue.dataset.ref = 'compat';
      compatValue.textContent = 'Pré-requis non déclarés';

      meta.append(latencyTerm, latencyValue, compatTerm, compatValue);

      const announcement = document.createElement('span');
      announcement.className = 'a11ytb-sr-only';
      announcement.dataset.ref = 'announcement';
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');

      card.append(headerRow, value, detail, meta, announcement);
      statusGrid.append(card);
      entry = { card, badge, risk, value, detail, label, latencyValue, compatValue, latencyTerm, compatTerm, announcement };
      statusCards.set(summary.id, entry);
    }
    return entry;
  }

  function updateStatusCards(snapshot) {
    const summaries = summarizeStatuses(snapshot || state.get());
    summaries.forEach((summary) => {
      const entry = ensureStatusCard(summary);
      entry.card.dataset.tone = summary.tone || 'info';
      if (summary.badge) {
        entry.badge.textContent = summary.badge;
        entry.badge.hidden = false;
      } else {
        entry.badge.textContent = '';
        entry.badge.hidden = true;
      }
      entry.value.textContent = summary.value || '';
      entry.value.setAttribute('aria-live', summary.live || 'polite');
      entry.value.setAttribute('aria-labelledby', entry.label.id);
      if (summary.detail) {
        entry.detail.textContent = summary.detail;
        entry.detail.hidden = false;
      } else {
        entry.detail.textContent = '';
        entry.detail.hidden = true;
      }
      const insights = summary.insights || {};
      if (entry.risk) {
        if (insights.riskLevel) {
          entry.risk.textContent = insights.riskLevel;
          entry.risk.dataset.score = insights.riskLevel;
          entry.risk.setAttribute('aria-label', insights.riskDescription || '');
          entry.risk.hidden = false;
        } else {
          entry.risk.textContent = '';
          entry.risk.dataset.score = '';
          entry.risk.setAttribute('aria-label', '');
          entry.risk.hidden = true;
        }
      }
      if (entry.latencyTerm && summary.metaLabels?.latency) {
        entry.latencyTerm.textContent = summary.metaLabels.latency;
      }
      if (entry.latencyValue) {
        entry.latencyValue.textContent = insights.latencyLabel || 'Non mesuré';
      }
      if (entry.compatTerm && summary.metaLabels?.compat) {
        entry.compatTerm.textContent = summary.metaLabels.compat;
      }
      if (entry.compatValue) {
        entry.compatValue.textContent = insights.compatLabel || 'Pré-requis non déclarés';
      }
      if (entry.announcement) {
        entry.announcement.textContent = insights.announcement || '';
      }
    });
  }

  updateStatusCards(state.get());
  updateAggregationPanel(state.get());
  state.on(updateStatusCards);
  state.on(updateAggregationPanel);

  const viewToggle = document.createElement('div');
  viewToggle.className = 'a11ytb-view-toggle';
  const viewButtons = new Map();
  const viewDefinitions = [
    {
      id: 'modules',
      label: 'Modules',
      icon: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M5 5h6v6H5zm8 0h6v6h-6zm0 8h6v6h-6zm-8 0h6v6H5z"/></svg>'
    },
    {
      id: 'options',
      label: 'Options & Profils',
      icon: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M5 6h14v2H5zm0 5h10v2H5zm0 5h14v2H5z"/></svg>'
    },
    {
      id: 'organize',
      label: 'Organisation',
      icon: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 5h9v4H4zm0 5h6v4H4zm0 5h11v4H4zm12-5l4-3v10z"/></svg>'
    },
    {
      id: 'guides',
      label: 'Guides',
      icon: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M6 4h9l3 3v13H6zm2 4v2h8V8zm0 4v2h5v-2z"/></svg>'
    },
    {
      id: 'shortcuts',
      label: 'Raccourcis',
      icon: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 7a3 3 0 013-3h10a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3zm5 2v6h2V9zm4 0v6h2V9z"/></svg>'
    }
  ];
  viewDefinitions.forEach((view) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'a11ytb-chip a11ytb-chip--view';
    btn.dataset.view = view.id;
    btn.innerHTML = `
      <span class="a11ytb-view-icon" aria-hidden="true">${view.icon}</span>
      <span class="a11ytb-view-label">${view.label}</span>
    `;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      state.set('ui.view', view.id);
      syncView();
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

  const organizeView = document.createElement('div');
  organizeView.className = 'a11ytb-view a11ytb-view--organize';
  organizeView.setAttribute('role', 'region');
  organizeView.setAttribute('aria-label', 'Organisation des modules');
  organizeView.setAttribute('hidden', '');
  organizeView.tabIndex = -1;

  const guidesView = document.createElement('div');
  guidesView.className = 'a11ytb-view a11ytb-view--guides';
  guidesView.setAttribute('role', 'region');
  guidesView.setAttribute('aria-label', 'Parcours guidés et checklists');
  guidesView.setAttribute('hidden', '');
  guidesView.tabIndex = -1;

  const shortcutsView = document.createElement('div');
  shortcutsView.className = 'a11ytb-view a11ytb-view--shortcuts';
  shortcutsView.setAttribute('role', 'region');
  shortcutsView.setAttribute('aria-label', 'Raccourcis clavier et navigation');
  shortcutsView.setAttribute('hidden', '');
  shortcutsView.tabIndex = -1;

  const viewElements = new Map([
    ['modules', modulesView],
    ['options', optionsView],
    ['organize', organizeView],
    ['guides', guidesView],
    ['shortcuts', shortcutsView]
  ]);

  const layoutPresets = [
    {
      id: 'double-column',
      label: 'Double colonne',
      description: 'Catégories à gauche, modules détaillés à droite.',
      tone: 'confirm'
    },
    {
      id: 'mosaic',
      label: 'Mosaïque filtrable',
      description: 'Groupes expansibles en grille responsive pour comparer rapidement.',
      tone: 'info'
    },
    {
      id: 'compact-flyout',
      label: 'Barre compacte + panneau',
      description: 'Barre iconique minimaliste avec panneau flottant temporaire.',
      tone: 'focus'
    }
  ];
  const layoutPresetMap = new Map(layoutPresets.map((preset) => [preset.id, preset]));
  const layoutControls = new Map();

  const filters = document.createElement('div');
  filters.className = 'a11ytb-filters';
  filters.classList.add('a11ytb-modules-toolbar');

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

  filters.append(search, profileWrapper, hiddenToggle);

  const modulesContainer = document.createElement('div');
  modulesContainer.className = 'a11ytb-modules';

  const modulesLayout = document.createElement('div');
  modulesLayout.className = 'a11ytb-modules-layout';

  const modulesSidebar = document.createElement('aside');
  modulesSidebar.className = 'a11ytb-modules-sidebar';
  modulesSidebar.setAttribute('aria-label', 'Catégories et dispositions de modules');

  const sidebarInner = document.createElement('div');
  sidebarInner.className = 'a11ytb-modules-sidebar-scroll';

  const categoryPanel = document.createElement('section');
  categoryPanel.className = 'a11ytb-category-panel';
  const categoryTitle = document.createElement('h3');
  categoryTitle.className = 'a11ytb-panel-title';
  categoryTitle.textContent = 'Catégories';
  categoryPanel.append(categoryTitle);

  const categoryList = document.createElement('ul');
  categoryList.className = 'a11ytb-category-list';
  categoryList.setAttribute('role', 'list');
  const categoryButtons = new Map();
  const categoryCountRefs = new Map();
  categories.forEach((cat) => {
    const item = document.createElement('li');
    item.className = 'a11ytb-category-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'a11ytb-category-chip';
    button.dataset.category = cat.id;
    button.setAttribute('aria-pressed', 'false');
    const label = document.createElement('span');
    label.className = 'a11ytb-category-label';
    label.textContent = cat.label;
    const count = document.createElement('span');
    count.className = 'a11ytb-category-count';
    count.textContent = '0';
    count.setAttribute('aria-hidden', 'true');
    button.append(label, count);
    button.addEventListener('click', () => {
      state.set('ui.category', cat.id);
    });
    categoryButtons.set(cat.id, button);
    categoryCountRefs.set(cat.id, count);
    item.append(button);
    categoryList.append(item);
  });
  categoryPanel.append(categoryList);

  const layoutPanel = document.createElement('section');
  layoutPanel.className = 'a11ytb-layout-panel';
  const layoutTitle = document.createElement('h3');
  layoutTitle.className = 'a11ytb-panel-title';
  layoutTitle.textContent = 'Affichage';
  layoutPanel.append(layoutTitle);
  const layoutHint = document.createElement('p');
  layoutHint.className = 'a11ytb-panel-description';
  layoutHint.textContent = 'Choisissez un préréglage visuel adapté à votre mode de navigation.';
  layoutPanel.append(layoutHint);

  const layoutList = document.createElement('div');
  layoutList.className = 'a11ytb-layout-presets';
  layoutPanel.append(layoutList);

  layoutPresets.forEach((preset) => {
    const option = document.createElement('label');
    option.className = 'a11ytb-layout-option';
    option.dataset.layoutId = preset.id;
    if (preset.tone) {
      option.dataset.tone = preset.tone;
    }
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'a11ytb-layout-preset';
    input.value = preset.id;
    input.className = 'a11ytb-layout-radio';
    layoutControls.set(preset.id, input);
    const body = document.createElement('div');
    body.className = 'a11ytb-layout-body';
    const title = document.createElement('span');
    title.className = 'a11ytb-layout-label';
    title.textContent = preset.label;
    const desc = document.createElement('span');
    desc.className = 'a11ytb-layout-description';
    desc.textContent = preset.description;
    body.append(title, desc);
    option.append(input, body);
    layoutList.append(option);
    input.addEventListener('change', () => {
      if (input.checked) {
        state.set('ui.moduleLayout', preset.id);
        logActivity(`Affichage modules : ${preset.label}`, { tone: preset.tone || 'info', tags: ['navigation'] });
      }
    });
  });

  sidebarInner.append(categoryPanel, layoutPanel);
  modulesSidebar.append(sidebarInner);

  const modulesMain = document.createElement('div');
  modulesMain.className = 'a11ytb-modules-main';

  const helperBanner = document.createElement('div');
  helperBanner.className = 'a11ytb-modules-helper';
  const helperTitle = document.createElement('h2');
  helperTitle.className = 'a11ytb-helper-title';
  helperTitle.textContent = 'Comment choisir ?';
  const helperText = document.createElement('p');
  helperText.className = 'a11ytb-helper-text';
  helperText.textContent = 'Comparez les préréglages selon votre besoin (vision, lecture ou interaction).';
  helperBanner.append(helperTitle, helperText);

  modulesMain.append(helperBanner, filters, modulesContainer);

  modulesLayout.append(modulesSidebar, modulesMain);

  const modulesInline = document.createElement('div');
  modulesInline.className = 'a11ytb-modules-inline';
  modulesInline.append(modulesLayout);

  const flyoutLauncher = document.createElement('button');
  flyoutLauncher.type = 'button';
  flyoutLauncher.className = 'a11ytb-flyout-launcher';
  flyoutLauncher.innerHTML = '<span aria-hidden="true">☰</span><span>Ouvrir la bibliothèque</span>';
  flyoutLauncher.hidden = true;
  flyoutLauncher.setAttribute('aria-expanded', 'false');
  flyoutLauncher.addEventListener('click', () => {
    state.set('ui.moduleFlyoutOpen', true);
  });

  const flyoutOverlay = document.createElement('div');
  flyoutOverlay.className = 'a11ytb-modules-flyout';
  flyoutOverlay.setAttribute('role', 'dialog');
  flyoutOverlay.setAttribute('aria-modal', 'true');
  flyoutOverlay.setAttribute('aria-label', 'Gestion des modules');
  flyoutOverlay.hidden = true;
  flyoutOverlay.setAttribute('aria-labelledby', 'a11ytb-flyout-title');
  flyoutOverlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      state.set('ui.moduleFlyoutOpen', false);
    }
  });

  const flyoutHeader = document.createElement('div');
  flyoutHeader.className = 'a11ytb-flyout-header';
  const flyoutTitle = document.createElement('h2');
  flyoutTitle.textContent = 'Bibliothèque de modules';
  flyoutTitle.id = 'a11ytb-flyout-title';
  flyoutHeader.append(flyoutTitle);

  const flyoutClose = document.createElement('button');
  flyoutClose.type = 'button';
  flyoutClose.className = 'a11ytb-flyout-close';
  flyoutClose.textContent = 'Fermer';
  flyoutClose.addEventListener('click', () => {
    state.set('ui.moduleFlyoutOpen', false);
  });
  flyoutHeader.append(flyoutClose);

  const flyoutBody = document.createElement('div');
  flyoutBody.className = 'a11ytb-flyout-body';

  flyoutOverlay.append(flyoutHeader, flyoutBody);

  const flyoutScrim = document.createElement('div');
  flyoutScrim.className = 'a11ytb-flyout-scrim';
  flyoutScrim.hidden = true;
  flyoutScrim.addEventListener('click', () => {
    state.set('ui.moduleFlyoutOpen', false);
  });

  modulesView.append(flyoutLauncher, modulesInline, flyoutOverlay, flyoutScrim);

  let releaseFlyoutInert = null;
  let lastFlyoutFocus = null;

  shellNav.append(statusCenter, viewToggle);
  shellMain.append(viewContainer);
  shell.append(shellNav, shellMain);
  body.append(shell);

  const optionsScroll = document.createElement('div');
  optionsScroll.className = 'a11ytb-options-scroll';
  optionsScroll.classList.add('a11ytb-options-scroll--panel');

  const profilesSection = document.createElement('section');
  profilesSection.className = 'a11ytb-options-section';
  profilesSection.classList.add('a11ytb-options-section--profiles');
  const profilesHeader = document.createElement('div');
  profilesHeader.className = 'a11ytb-section-header';
  const profilesTitle = document.createElement('h3');
  profilesTitle.className = 'a11ytb-section-title';
  profilesTitle.textContent = 'Profils d’accessibilité';
  const profilesDescription = document.createElement('p');
  profilesDescription.className = 'a11ytb-section-description';
  profilesDescription.textContent = 'Appliquez des réglages combinés en un clic pour différents besoins (vision basse, dyslexie, etc.).';
  profilesHeader.append(profilesTitle, profilesDescription);
  const profilesToolbar = document.createElement('div');
  profilesToolbar.className = 'a11ytb-profile-toolbar';
  const importProfileButton = document.createElement('button');
  importProfileButton.type = 'button';
  importProfileButton.className = 'a11ytb-button a11ytb-button--ghost';
  importProfileButton.dataset.profileAction = 'import';
  importProfileButton.textContent = 'Importer un profil';
  importProfileButton.setAttribute('aria-label', 'Importer un profil (coller un JSON)');
  profilesToolbar.append(importProfileButton);
  profilesToolbar.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-profile-action]');
    if (!button) return;
    if (button.dataset.profileAction === 'import') {
      await importProfileFromPrompt();
    }
  });
  const profilesList = document.createElement('div');
  profilesList.className = 'a11ytb-profile-grid';
  profilesSection.append(profilesHeader, profilesToolbar, profilesList);

  const configSection = document.createElement('section');
  configSection.className = 'a11ytb-options-section';
  configSection.classList.add('a11ytb-options-section--config');
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

  const guidesScroll = document.createElement('div');
  guidesScroll.className = 'a11ytb-options-scroll';
  const guidesSection = document.createElement('section');
  guidesSection.className = 'a11ytb-options-section';
  guidesSection.classList.add('a11ytb-options-section--guides');
  const guidesHeader = document.createElement('div');
  guidesHeader.className = 'a11ytb-section-header';
  const guidesTitle = document.createElement('h3');
  guidesTitle.className = 'a11ytb-section-title';
  guidesTitle.textContent = 'Parcours guidés';
  const guidesDescription = document.createElement('p');
  guidesDescription.className = 'a11ytb-section-description';
  guidesDescription.textContent = 'Suivez les checklists d’onboarding pour valider les réglages essentiels et surveiller vos services.';
  guidesHeader.append(guidesTitle, guidesDescription);
  const guidesLayout = document.createElement('div');
  guidesLayout.className = 'a11ytb-guides-layout';
  const guidesList = document.createElement('div');
  guidesList.className = 'a11ytb-guides-scenarios';
  guidesList.setAttribute('aria-label', 'Parcours disponibles');
  const guideDetail = document.createElement('div');
  guideDetail.className = 'a11ytb-guide-detail';
  guideDetail.setAttribute('role', 'region');
  guideDetail.setAttribute('aria-label', 'Détails du guide sélectionné');
  const guideDetailContent = document.createElement('div');
  guideDetailContent.className = 'a11ytb-guide-detail-content';
  guideDetailContent.tabIndex = -1;
  const guidesLiveRegion = document.createElement('div');
  guidesLiveRegion.className = 'a11ytb-sr-only';
  guidesLiveRegion.setAttribute('role', 'status');
  guidesLiveRegion.setAttribute('aria-live', 'polite');
  guidesLiveRegion.setAttribute('aria-atomic', 'true');
  guideDetail.append(guidesLiveRegion, guideDetailContent);
  guidesLayout.append(guidesList, guideDetail);
  guidesSection.append(guidesHeader, guidesLayout);
  guidesScroll.append(guidesSection);
  guidesView.append(guidesScroll);

  let currentGuideMap = new Map();
  let currentGuideId = null;
  let currentGuideStepIndex = 0;

  function renderGuideOptions(scenarios, selectedId) {
    guidesList.innerHTML = '';
    guidesList.setAttribute('role', 'list');
    if (!scenarios.length) {
      const empty = document.createElement('p');
      empty.className = 'a11ytb-empty-state';
      empty.textContent = 'Aucun parcours disponible pour le moment.';
      guidesList.append(empty);
      return;
    }
    scenarios.forEach((scenario) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'a11ytb-guide-option';
      button.dataset.scenarioId = scenario.id;
      if (scenario.tone) button.dataset.tone = scenario.tone;
      const stateLabel = scenario.blocked
        ? 'blocked'
        : (scenario.completedCount === scenario.total ? 'done' : 'active');
      button.dataset.state = stateLabel;
      button.setAttribute('aria-pressed', scenario.id === selectedId ? 'true' : 'false');

      const head = document.createElement('div');
      head.className = 'a11ytb-guide-option-head';
      const title = document.createElement('span');
      title.className = 'a11ytb-guide-option-title';
      title.textContent = scenario.title;
      const status = document.createElement('span');
      status.className = 'a11ytb-guide-option-status';
      status.textContent = scenario.statusLabel || '';
      head.append(title, status);

      button.append(head);

      if (scenario.description) {
        const desc = document.createElement('p');
        desc.className = 'a11ytb-guide-option-description';
        desc.textContent = scenario.description;
        button.append(desc);
      }

      const progress = document.createElement('div');
      progress.className = 'a11ytb-guide-option-progress';
      const count = document.createElement('span');
      count.className = 'a11ytb-guide-option-count';
      count.textContent = `${scenario.completedCount}/${scenario.total}`;
      const progressTrack = document.createElement('div');
      progressTrack.className = 'a11ytb-guide-progress-track';
      const progressFill = document.createElement('span');
      progressFill.className = 'a11ytb-guide-progress-fill';
      progressFill.style.width = `${Math.round((scenario.progress || 0) * 100)}%`;
      progressFill.setAttribute('aria-hidden', 'true');
      progressTrack.append(progressFill);
      progress.append(count, progressTrack);
      button.append(progress);

      guidesList.append(button);
    });
  }

  function renderGuideDetail(scenarioId, focusDetail = false) {
    guideDetailContent.innerHTML = '';
    guideDetail.removeAttribute('data-tone');
    if (!scenarioId) {
      const empty = document.createElement('p');
      empty.className = 'a11ytb-empty-state';
      empty.textContent = 'Sélectionnez un parcours pour afficher ses étapes.';
      guideDetailContent.append(empty);
      guidesLiveRegion.textContent = '';
      return;
    }
    const scenario = currentGuideMap.get(scenarioId);
    if (!scenario) {
      const missing = document.createElement('p');
      missing.className = 'a11ytb-empty-state';
      missing.textContent = 'Ce parcours n’est plus disponible.';
      guideDetailContent.append(missing);
      guidesLiveRegion.textContent = '';
      return;
    }

    if (scenario.tone) {
      guideDetail.dataset.tone = scenario.tone;
    }

    const cursors = state.get('ui.guides.cursors') || {};
    const storedIndex = Number.isInteger(cursors[scenarioId]) ? cursors[scenarioId] : null;
    const validIndex = Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < scenario.steps.length
      ? storedIndex
      : null;
    if (validIndex === null) {
      const fallbackIndex = Math.max(0, scenario.recommendedStepIndex ?? 0);
      state.set(`ui.guides.cursors.${scenarioId}`, fallbackIndex);
      return;
    }
    currentGuideStepIndex = validIndex;

    const header = document.createElement('div');
    header.className = 'a11ytb-guide-detail-header';
    const title = document.createElement('h4');
    title.className = 'a11ytb-guide-title';
    title.textContent = scenario.title;
    header.append(title);

    if (scenario.summary) {
      const summary = document.createElement('p');
      summary.className = 'a11ytb-guide-summary';
      summary.textContent = scenario.summary;
      header.append(summary);
    }

    const progress = document.createElement('div');
    progress.className = 'a11ytb-guide-progress';
    const progressLabel = document.createElement('span');
    progressLabel.className = 'a11ytb-guide-progress-label';
    progressLabel.textContent = `${scenario.completedCount}/${scenario.total} étapes terminées`;
    const progressTrack = document.createElement('div');
    progressTrack.className = 'a11ytb-guide-progress-track';
    const progressFill = document.createElement('span');
    progressFill.className = 'a11ytb-guide-progress-fill';
    progressFill.style.width = `${Math.round((scenario.progress || 0) * 100)}%`;
    progressFill.setAttribute('aria-hidden', 'true');
    progressTrack.append(progressFill);
    progress.append(progressLabel, progressTrack);
    header.append(progress);

    guideDetailContent.append(header);

    if (scenario.prerequisites?.length) {
      const prereqList = document.createElement('ul');
      prereqList.className = 'a11ytb-guide-prerequisites';
      scenario.prerequisites.forEach((prerequisite) => {
        const item = document.createElement('li');
        item.className = 'a11ytb-guide-prerequisite';
        item.dataset.status = prerequisite.status || (prerequisite.met ? 'met' : 'missing');
        const label = document.createElement('span');
        label.className = 'a11ytb-guide-prerequisite-label';
        label.textContent = prerequisite.label;
        item.append(label);
        if (prerequisite.detail) {
          const detail = document.createElement('span');
          detail.className = 'a11ytb-guide-prerequisite-detail';
          detail.textContent = prerequisite.detail;
          item.append(detail);
        }
        prereqList.append(item);
      });
      guideDetailContent.append(prereqList);
    }

    if (scenario.assistance?.microcopy) {
      const micro = document.createElement('p');
      micro.className = 'a11ytb-guide-microcopy';
      micro.textContent = scenario.assistance.microcopy;
      guideDetailContent.append(micro);
    }

    if (scenario.assistance?.examples?.length) {
      const examples = document.createElement('div');
      examples.className = 'a11ytb-guide-examples';
      scenario.assistance.examples.forEach((example) => {
        const card = document.createElement('article');
        card.className = 'a11ytb-guide-example';
        if (example.title) {
          const heading = document.createElement('h5');
          heading.className = 'a11ytb-guide-example-title';
          heading.textContent = example.title;
          card.append(heading);
        }
        if (example.description) {
          const desc = document.createElement('p');
          desc.className = 'a11ytb-guide-example-description';
          desc.textContent = example.description;
          card.append(desc);
        }
        examples.append(card);
      });
      guideDetailContent.append(examples);
    }

    if (scenario.assistance?.resources?.length) {
      const resources = document.createElement('ul');
      resources.className = 'a11ytb-guide-resources';
      scenario.assistance.resources.forEach((resource) => {
        const item = document.createElement('li');
        item.className = 'a11ytb-guide-resource';
        const link = document.createElement('a');
        link.href = resource.href;
        link.target = resource.external ? '_blank' : '_self';
        if (resource.external) link.rel = 'noopener noreferrer';
        link.textContent = resource.label;
        item.append(link);
        resources.append(item);
      });
      guideDetailContent.append(resources);
    }

    const stepsList = document.createElement('ol');
    stepsList.className = 'a11ytb-guide-steps';
    const stepsListId = `${scenario.id}-steps`;
    stepsList.id = stepsListId;
    stepsList.setAttribute('aria-label', `Étapes pour ${scenario.title}`);
    scenario.steps.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-guide-step';
      item.dataset.state = step.completed ? 'done' : 'todo';
      item.dataset.mode = step.mode;
      item.dataset.active = index === currentGuideStepIndex ? 'true' : 'false';
      item.dataset.stepIndex = String(index);
      item.setAttribute('aria-current', index === currentGuideStepIndex ? 'step' : 'false');
      item.tabIndex = index === currentGuideStepIndex ? 0 : -1;

      const status = document.createElement('span');
      status.className = 'a11ytb-guide-step-status';
      status.setAttribute('aria-hidden', 'true');
      status.textContent = step.completed ? '✓' : index + 1;

      const body = document.createElement('div');
      body.className = 'a11ytb-guide-step-body';

      const srStatus = document.createElement('span');
      srStatus.className = 'a11ytb-sr-only';
      srStatus.textContent = step.completed
        ? 'Statut : étape terminée.'
        : `Statut : étape ${index + 1} sur ${scenario.steps.length}, à réaliser.`;
      body.append(srStatus);

      const label = document.createElement('span');
      label.className = 'a11ytb-guide-step-label';
      label.textContent = step.label;
      body.append(label);

      let detailId = '';
      if (step.detail) {
        const detail = document.createElement('p');
        detail.className = 'a11ytb-guide-step-detail';
        detail.textContent = step.detail;
        detailId = `${scenario.id}-step-${step.id}-detail`;
        detail.id = detailId;
        body.append(detail);
      }

      item.append(status, body);

      if (step.mode === 'manual') {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'a11ytb-guide-step-toggle';
        toggle.dataset.guideAction = 'toggle-step';
        toggle.dataset.stepKey = step.key;
        toggle.dataset.stepLabel = step.label;
        toggle.dataset.scenarioId = scenario.id;
        toggle.dataset.toggleComplete = step.toggleLabels.complete;
        toggle.dataset.toggleReset = step.toggleLabels.reset;
        toggle.setAttribute('aria-pressed', String(step.completed));
        if (detailId) toggle.setAttribute('aria-describedby', detailId);
        toggle.textContent = step.completed ? step.toggleLabels.reset : step.toggleLabels.complete;
        item.append(toggle);
      } else if (step.tag) {
        const badge = document.createElement('span');
        badge.className = 'a11ytb-guide-step-tag';
        badge.textContent = step.tag;
        item.append(badge);
      }

      stepsList.append(item);
    });
    guideDetailContent.append(stepsList);

    const navigation = document.createElement('div');
    navigation.className = 'a11ytb-guide-step-nav';
    const position = document.createElement('span');
    position.className = 'a11ytb-guide-step-position';
    position.textContent = `Étape ${currentGuideStepIndex + 1} sur ${scenario.steps.length}`;
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'a11ytb-button a11ytb-button--ghost';
    prevBtn.dataset.guideNav = 'prev';
    prevBtn.textContent = 'Étape précédente';
    prevBtn.disabled = currentGuideStepIndex <= 0;
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'a11ytb-button';
    nextBtn.dataset.guideNav = 'next';
    nextBtn.textContent = 'Étape suivante';
    nextBtn.disabled = currentGuideStepIndex >= scenario.steps.length - 1;
    navigation.append(prevBtn, position, nextBtn);
    guideDetailContent.append(navigation);

    const activeStep = scenario.steps[currentGuideStepIndex];
    if (activeStep) {
      const messageParts = [
        `Étape ${currentGuideStepIndex + 1} sur ${scenario.steps.length} : ${activeStep.label}`
      ];
      if (activeStep.detail) messageParts.push(activeStep.detail);
      const progressMessage = `Progression : ${scenario.completedCount}/${scenario.total} étape${scenario.total > 1 ? 's' : ''} complétée${scenario.completedCount > 1 ? 's' : ''}.`;
      const announcement = activeStep.announcement || messageParts.join('. ');
      guidesLiveRegion.textContent = `${announcement} ${progressMessage}`.trim();
    } else {
      guidesLiveRegion.textContent = '';
    }

    if (!focusDetail) {
      const activeElement = stepsList.querySelector('[data-active="true"]');
      if (activeElement && guideDetail.contains(document.activeElement)) {
        try {
          activeElement.focus({ preventScroll: true });
        } catch (error) {
          activeElement.focus();
        }
      }
    }

    if (focusDetail) {
      try {
        guideDetailContent.focus({ preventScroll: true });
      } catch (error) {
        guideDetailContent.focus();
      }
    }
  }

  function renderGuidedChecklists(snapshot) {
    const source = snapshot || state.get();
    const scenarios = buildGuidedChecklists(source);
    currentGuideMap = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

    if (!scenarios.length) {
      renderGuideOptions([], null);
      guideDetailContent.innerHTML = '';
      guidesLiveRegion.textContent = '';
      const empty = document.createElement('p');
      empty.className = 'a11ytb-empty-state';
      empty.textContent = 'Aucun parcours n’est disponible avec les modules actuels.';
      guideDetailContent.append(empty);
      currentGuideId = null;
      currentGuideStepIndex = 0;
      return;
    }

    let selectedScenarioId = state.get('ui.guides.selectedScenario');
    if (!selectedScenarioId || !currentGuideMap.has(selectedScenarioId)) {
      const fallback = scenarios.find((scenario) => !scenario.blocked) || scenarios[0];
      if (fallback && fallback.id !== selectedScenarioId) {
        state.set('ui.guides.selectedScenario', fallback.id);
        return;
      }
      selectedScenarioId = fallback?.id ?? scenarios[0].id;
    }

    const previousGuideId = currentGuideId;
    currentGuideId = selectedScenarioId;
    renderGuideOptions(scenarios, selectedScenarioId);
    renderGuideDetail(selectedScenarioId, previousGuideId !== selectedScenarioId);
  }

  renderGuidedChecklists(state.get());
  state.on(renderGuidedChecklists);

  guidesList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-scenario-id]');
    if (!button) return;
    const scenarioId = button.dataset.scenarioId;
    if (!scenarioId || !currentGuideMap.has(scenarioId)) return;
    const current = state.get('ui.guides.selectedScenario');
    if (current === scenarioId) return;
    state.set('ui.guides.selectedScenario', scenarioId);
  });

  guideDetail.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-guide-action="toggle-step"]');
    if (toggle) {
      const stepKey = toggle.dataset.stepKey;
      if (!stepKey) return;
      const wasCompleted = toggle.getAttribute('aria-pressed') === 'true';
      const changed = toggleManualChecklistStep(state, stepKey);
      if (!changed) return;
      const nowCompleted = !wasCompleted;
      const label = toggle.dataset.stepLabel || stepKey;
      const scenarioId = toggle.dataset.scenarioId || currentGuideId || 'guides';
      toggle.setAttribute('aria-pressed', String(nowCompleted));
      const completeLabel = toggle.dataset.toggleComplete || 'Marquer comme fait';
      const resetLabel = toggle.dataset.toggleReset || 'Marquer à refaire';
      toggle.textContent = nowCompleted ? resetLabel : completeLabel;
      const scenario = currentGuideMap.get(scenarioId);
      const guideLabel = scenario ? scenario.title : 'Guide';
      logActivity(`${guideLabel} — ${nowCompleted ? 'étape validée' : 'étape réinitialisée'} : ${label}`, {
        tone: nowCompleted ? 'confirm' : 'info',
        tags: ['guides', stepKey]
      });
      return;
    }

    const navButton = event.target.closest('[data-guide-nav]');
    if (navButton) {
      if (!currentGuideId) return;
      const scenario = currentGuideMap.get(currentGuideId);
      if (!scenario) return;
      let nextIndex = currentGuideStepIndex;
      if (navButton.dataset.guideNav === 'next') {
        nextIndex = Math.min(scenario.steps.length - 1, currentGuideStepIndex + 1);
      } else if (navButton.dataset.guideNav === 'prev') {
        nextIndex = Math.max(0, currentGuideStepIndex - 1);
      }
      if (nextIndex !== currentGuideStepIndex) {
        state.set(`ui.guides.cursors.${scenario.id}`, nextIndex);
      }
      return;
    }

    const stepCard = event.target.closest('[data-step-index]');
    if (stepCard && currentGuideId) {
      const index = Number.parseInt(stepCard.dataset.stepIndex, 10);
      const scenario = currentGuideMap.get(currentGuideId);
      if (!scenario || Number.isNaN(index)) return;
      const bounded = Math.min(scenario.steps.length - 1, Math.max(0, index));
      if (bounded !== currentGuideStepIndex) {
        state.set(`ui.guides.cursors.${scenario.id}`, bounded);
      }
    }
  });

  guideDetail.addEventListener('keydown', (event) => {
    const stepItem = event.target.closest('[data-step-index]');
    if (!stepItem) return;
    const scenario = currentGuideId ? currentGuideMap.get(currentGuideId) : null;
    if (!scenario) return;
    let nextIndex = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = Math.min(scenario.steps.length - 1, currentGuideStepIndex + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = Math.max(0, currentGuideStepIndex - 1);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = scenario.steps.length - 1;
    }
    if (nextIndex !== null && nextIndex !== currentGuideStepIndex) {
      event.preventDefault();
      state.set(`ui.guides.cursors.${scenario.id}`, nextIndex);
    }
  });

  function createShortcutComboElement(variants) {
    const container = document.createElement('span');
    container.className = 'a11ytb-shortcut-combo';
    variants.forEach((keys, variantIndex) => {
      keys.forEach((key, keyIndex) => {
        const kbd = document.createElement('kbd');
        kbd.className = 'a11ytb-shortcut-key';
        kbd.textContent = key;
        container.append(kbd);
        if (keyIndex < keys.length - 1) {
          const join = document.createElement('span');
          join.className = 'a11ytb-shortcut-join';
          join.setAttribute('aria-hidden', 'true');
          join.textContent = '+';
          container.append(join);
        }
      });
      if (variantIndex < variants.length - 1) {
        const or = document.createElement('span');
        or.className = 'a11ytb-shortcut-or';
        or.textContent = 'ou';
        container.append(or);
      }
    });
    return container;
  }

  const shortcutsScroll = document.createElement('div');
  shortcutsScroll.className = 'a11ytb-options-scroll';
  const shortcutsSection = document.createElement('section');
  shortcutsSection.className = 'a11ytb-options-section';
  const shortcutsHeader = document.createElement('div');
  shortcutsHeader.className = 'a11ytb-section-header';
  const shortcutsTitle = document.createElement('h3');
  shortcutsTitle.className = 'a11ytb-section-title';
  shortcutsTitle.textContent = 'Raccourcis clavier';
  const shortcutsDescription = document.createElement('p');
  shortcutsDescription.className = 'a11ytb-section-description';
  shortcutsDescription.textContent = 'Accédez rapidement aux vues du panneau et maîtrisez les déplacements au clavier.';
  shortcutsHeader.append(shortcutsTitle, shortcutsDescription);

  const shortcutsGrid = document.createElement('div');
  shortcutsGrid.className = 'a11ytb-shortcuts-grid';

  const customShortcutsPanel = document.createElement('div');
  customShortcutsPanel.className = 'a11ytb-shortcuts-custom-panel';
  const customShortcutsTitle = document.createElement('h4');
  customShortcutsTitle.className = 'a11ytb-shortcuts-custom-title';
  customShortcutsTitle.textContent = 'Personnalisez les raccourcis globaux';
  const customShortcutsIntro = document.createElement('p');
  customShortcutsIntro.className = 'a11ytb-shortcuts-custom-intro';
  customShortcutsIntro.textContent = 'Définissez vos propres combinaisons pour ouvrir la boîte à outils et naviguer entre les vues.';
  shortcutStatusElement = document.createElement('p');
  shortcutStatusElement.className = 'a11ytb-shortcuts-status';
  shortcutStatusElement.dataset.tone = 'info';
  shortcutStatusElement.textContent = 'Cliquez sur « Définir » puis saisissez la nouvelle combinaison (Alt/Ctrl/Cmd requis).';

  const customShortcutsList = document.createElement('ul');
  customShortcutsList.className = 'a11ytb-shortcuts-custom-list';

  CUSTOM_SHORTCUT_DEFINITIONS.forEach((definition) => {
    const item = document.createElement('li');
    item.className = 'a11ytb-shortcuts-custom-item';
    const label = document.createElement('span');
    label.className = 'a11ytb-shortcuts-custom-label';
    label.textContent = definition.label;
    const combo = document.createElement('span');
    combo.className = 'a11ytb-shortcuts-custom-combo';
    customShortcutDisplays.set(definition.id, combo);
    renderShortcutDisplay(definition.id, combo, state.get());

    const actions = document.createElement('div');
    actions.className = 'a11ytb-shortcuts-custom-actions';

    const recordBtn = document.createElement('button');
    recordBtn.type = 'button';
    recordBtn.className = 'a11ytb-button a11ytb-button--ghost';
    recordBtn.dataset.shortcutAction = 'record';
    recordBtn.dataset.shortcutId = definition.id;
    recordBtn.textContent = 'Définir…';
    shortcutRecordButtons.set(definition.id, recordBtn);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'a11ytb-button a11ytb-button--ghost';
    resetBtn.dataset.shortcutAction = 'reset';
    resetBtn.dataset.shortcutId = definition.id;
    resetBtn.textContent = 'Réinitialiser';

    actions.append(recordBtn, resetBtn);
    item.append(label, combo, actions);
    customShortcutsList.append(item);
  });

  customShortcutsPanel.append(customShortcutsTitle, customShortcutsIntro, customShortcutsList, shortcutStatusElement);

  customShortcutsPanel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-shortcut-action]');
    if (!button) return;
    const action = button.dataset.shortcutAction;
    const shortcutId = button.dataset.shortcutId;
    if (!shortcutId) return;
    if (action === 'record') {
      startShortcutRecording(shortcutId);
    } else if (action === 'reset') {
      resetShortcut(shortcutId);
    }
  });

  const shortcutGroups = [
    {
      title: 'Navigation du panneau',
      description: 'Raccourcis globaux accessibles depuis toute la page.',
      shortcuts: [
        { id: 'toggle-panel', description: 'Ouvrir ou fermer la boîte à outils.' },
        { id: 'view-modules', description: 'Afficher la vue Modules.' },
        { id: 'view-options', description: 'Afficher la vue Options & Profils.' },
        { id: 'view-organize', description: 'Afficher la vue Organisation.' },
        { id: 'view-guides', description: 'Afficher la vue Guides.' },
        { id: 'view-shortcuts', description: 'Afficher cette vue Raccourcis.' }
      ]
    },
    {
      title: 'Gestion du panneau',
      description: 'Disponible lorsque la boîte à outils est ouverte.',
      shortcuts: [
        { combo: [['Tab'], ['Shift', 'Tab']], description: 'Parcourir les commandes disponibles.' },
        { combo: [['Échap']], description: 'Fermer le panneau en conservant le focus précédent.' }
      ]
    },
    {
      title: 'Réorganisation des modules',
      description: 'Raccourcis utilisables dans la vue Organisation.',
      shortcuts: [
        { combo: [['Entrée'], ['Espace']], description: 'Saisir ou déposer la carte sélectionnée.' },
        { combo: [['↑'], ['↓']], description: 'Déplacer la carte saisie vers le haut ou vers le bas.' },
        { combo: [['Échap']], description: 'Annuler la saisie et replacer la carte.' }
      ]
    }
  ];

  shortcutGroups.forEach((group) => {
    const card = document.createElement('article');
    card.className = 'a11ytb-config-card a11ytb-shortcuts-card';
    const heading = document.createElement('h4');
    heading.className = 'a11ytb-shortcuts-heading';
    heading.textContent = group.title;
    card.append(heading);
    if (group.description) {
      const copy = document.createElement('p');
      copy.className = 'a11ytb-shortcuts-description';
      copy.textContent = group.description;
      card.append(copy);
    }
    const list = document.createElement('dl');
    list.className = 'a11ytb-shortcuts-list';
    group.shortcuts.forEach((shortcut) => {
      const dt = document.createElement('dt');
      dt.className = 'a11ytb-shortcut-keys';
      if (shortcut.id) {
        shortcutDisplayElements.set(shortcut.id, dt);
        renderShortcutDisplay(shortcut.id, dt, state.get());
      } else if (shortcut.combo) {
        dt.append(createShortcutComboElement(shortcut.combo));
      }
      const dd = document.createElement('dd');
      dd.className = 'a11ytb-shortcut-description';
      dd.textContent = shortcut.description;
      list.append(dt, dd);
    });
    card.append(list);
    shortcutsGrid.append(card);
  });

  shortcutsSection.append(shortcutsHeader, customShortcutsPanel, shortcutsGrid);
  shortcutsScroll.append(shortcutsSection);
  shortcutsView.append(shortcutsScroll);

  viewContainer.append(modulesView, optionsView, organizeView, guidesView, shortcutsView);

  const footer = document.createElement('div');
  footer.className = 'a11ytb-header';
  const footerTitle = document.createElement('div');
  footerTitle.className = 'a11ytb-title';
  footerTitle.textContent = buildShortcutSummary(state.get());

  const activity = document.createElement('details');
  activity.className = 'a11ytb-activity';
  activity.innerHTML = `
    <summary>Activité récente</summary>
    <div class="a11ytb-activity-actions" role="group" aria-label="Exports du journal">
      <button type="button" class="a11ytb-btn-link" data-action="activity-export-json">Copier JSON</button>
      <button type="button" class="a11ytb-btn-link" data-action="activity-send-sync">Envoyer aux connecteurs</button>
      <button type="button" class="a11ytb-btn-link" data-action="activity-export-csv">Exporter CSV</button>
    </div>
    <section class="a11ytb-activity-syncs" aria-labelledby="a11ytb-activity-syncs-title">
      <h3 id="a11ytb-activity-syncs-title" class="a11ytb-activity-syncs-title">Connecteurs & synchronisations</h3>
      <p id="a11ytb-activity-syncs-help" class="a11ytb-activity-syncs-help">Configurez les intégrations dans l’admin pour activer l’envoi automatique des tickets (Jira, Linear, Slack ou webhook personnalisé).</p>
      <ul class="a11ytb-activity-connectors" role="list" aria-describedby="a11ytb-activity-syncs-help" data-ref="activity-connectors"></ul>
    </section>
    <ol class="a11ytb-activity-list" data-ref="activity-list"></ol>
  `;

  footer.append(footerTitle, activity);

  panel.append(header, body, footer);

  const blocks = listBlocks();
  const blockInfo = new Map(blocks.map(block => [block.id, block]));
  const blockIds = blocks.map(block => block.id);
  const allowedIds = new Set(blockIds);
  const blockIndex = new Map(blockIds.map((id, index) => [id, index]));
  const moduleToBlockIds = new Map();

  blocks.forEach((block) => {
    const moduleId = block.moduleId;
    if (!moduleId) return;
    if (!moduleToBlockIds.has(moduleId)) {
      moduleToBlockIds.set(moduleId, []);
    }
    moduleToBlockIds.get(moduleId).push(block.id);
  });

  const allManifests = listModuleManifests();
  const manifestByModuleId = new Map(allManifests.map((manifest) => [manifest.id, manifest]));
  const catalogModuleIds = Array.from(new Set([
    ...moduleCatalog.map((entry) => entry.id),
    ...manifestByModuleId.keys()
  ]));

  const baseCollectionDefinitions = flattenedModuleCollections
    .filter((entry) => entry && entry.id && Array.isArray(entry.modules))
    .map((entry) => ({
      id: entry.id,
      label: entry.label || entry.id,
      description: entry.description || '',
      modules: Array.from(new Set((entry.modules || []).filter(Boolean))),
      depth: entry.depth || 0,
      parentId: entry.parentId || null,
      pathLabel: entry.pathLabel || entry.label || entry.id,
      ancestors: Array.isArray(entry.ancestors) ? entry.ancestors.slice() : [],
      descendants: Array.isArray(entry.descendants) ? entry.descendants.slice() : [],
      directModules: Array.isArray(entry.directModules) ? entry.directModules.slice() : []
    }))
    .filter((entry) => entry.modules.length);

  function buildCollectionStructures(snapshot) {
    const overrides = snapshot?.ui?.collections?.presets || {};
    const resolved = [];
    const seen = new Set();

    baseCollectionDefinitions.forEach((entry) => {
      const override = overrides?.[entry.id];
      const overrideModules = Array.isArray(override?.modules)
        ? Array.from(new Set(override.modules.filter(Boolean)))
        : null;
      const definition = {
        id: entry.id,
        label: override?.label || entry.label,
        description: override?.description ?? entry.description ?? '',
        modules: overrideModules && overrideModules.length ? overrideModules : entry.modules.slice(),
        depth: entry.depth || 0,
        parentId: entry.parentId || null,
        ancestors: Array.isArray(entry.ancestors) ? entry.ancestors.slice() : [],
        descendants: Array.isArray(entry.descendants) ? entry.descendants.slice() : [],
        pathLabel: entry.pathLabel || entry.label || entry.id,
        directModules: entry.directModules && entry.directModules.length ? entry.directModules.slice() : []
      };
      resolved.push(definition);
      seen.add(entry.id);
    });

    if (overrides && typeof overrides === 'object') {
      Object.entries(overrides).forEach(([id, override]) => {
        if (seen.has(id)) return;
        const modules = Array.isArray(override?.modules)
          ? Array.from(new Set(override.modules.filter(Boolean)))
          : [];
        if (!modules.length) return;
        resolved.push({
          id,
          label: override?.label || id,
          description: override?.description || '',
          modules,
          depth: Number.isFinite(override?.depth) ? override.depth : 0,
          parentId: override?.parentId || null,
          ancestors: Array.isArray(override?.ancestors) ? override.ancestors.slice() : [],
          descendants: Array.isArray(override?.descendants) ? override.descendants.slice() : [],
          pathLabel: override?.pathLabel || override?.label || id,
          directModules: modules.slice()
        });
        seen.add(id);
      });
    }

    const byId = new Map();
    const moduleIndex = new Map();
    const blockIds = new Map();
    const normalized = resolved.map((definition) => {
      const members = definition.modules.filter((moduleId) => moduleToBlockIds.has(moduleId));
      const next = {
        id: definition.id,
        label: definition.label,
        description: definition.description,
        modules: members,
        depth: Number.isFinite(definition.depth) ? definition.depth : 0,
        parentId: definition.parentId || null,
        ancestors: Array.isArray(definition.ancestors) ? definition.ancestors.slice() : [],
        descendants: Array.isArray(definition.descendants) ? definition.descendants.slice() : [],
        pathLabel: definition.pathLabel || definition.label,
        directModules: Array.isArray(definition.directModules)
          ? definition.directModules.filter((moduleId) => moduleToBlockIds.has(moduleId))
          : members
      };
      byId.set(next.id, next);
      blockIds.set(next.id, members.flatMap((moduleId) => moduleToBlockIds.get(moduleId) ?? []));
      members.forEach((moduleId) => {
        if (!moduleIndex.has(moduleId)) {
          moduleIndex.set(moduleId, new Set());
        }
        moduleIndex.get(moduleId).add(next.id);
      });
      return next;
    });

    normalized.forEach((definition) => {
      const ancestorLabels = Array.isArray(definition.ancestors)
        ? definition.ancestors
            .map((ancestorId) => byId.get(ancestorId)?.label || moduleCollectionsById.get(ancestorId)?.label || ancestorId)
        : [];
      if (ancestorLabels.length) {
        definition.pathLabel = `${ancestorLabels.join(' › ')} › ${definition.label}`;
      } else {
        definition.pathLabel = definition.label;
      }
    });

    return {
      definitions: normalized,
      byId,
      moduleIndex,
      blockIds
    };
  }

  function syncCollectionStructures(snapshot = state.get()) {
    const structures = buildCollectionStructures(snapshot);
    collectionDefinitions = structures.definitions;
    collectionById = structures.byId;
    moduleCollectionsIndex = structures.moduleIndex;
    collectionBlockIds = structures.blockIds;
    rebuildCollectionsPanel();
    updateCollectionFilterOptions();
  }

  const moduleElements = new Map();
  const adminItems = new Map();
  const dependencyViews = new Map();
  const adminToolbarCounts = { active: null, hidden: null, pinned: null };
  const organizeFilterToggles = new Map();
  const collectionButtons = new Map();
  const availableFilterSelects = {};
  let collectionsPanel = null;
  let collectionsSummary = null;
  let collectionsListRoot = null;
  const builderElements = {
    section: null,
    select: null,
    createButton: null,
    labelInput: null,
    descriptionInput: null,
    catalogList: null,
    selectionList: null,
    previewList: null,
    saveButton: null,
    resetButton: null,
    emptyNotice: null,
    helper: null
  };
  const builderState = {
    activeId: '',
    workingModules: [],
    label: '',
    description: ''
  };
  let builderDragState = null;

  syncCollectionStructures(state.get());

  const presetProfiles = state.get('profiles') || {};
  const profileFilterEntries = Object.entries(presetProfiles)
    .map(([id, profile]) => {
      const modules = extractModulesFromProfile(profile?.settings || {});
      return {
        id,
        label: profile?.name || id,
        modules
      };
    })
    .filter((entry) => entry.modules.length);

  const moduleToProfiles = new Map();
  profileFilterEntries.forEach((profile) => {
    profile.modules.forEach((moduleId) => {
      if (!moduleToProfiles.has(moduleId)) {
        moduleToProfiles.set(moduleId, new Set());
      }
      moduleToProfiles.get(moduleId).add(profile.id);
    });
  });

  const profileDisplayById = new Map(profileFilterEntries.map((entry) => [entry.id, entry.label]));

  function getCollectionsForBlock(blockId) {
    const block = blockInfo.get(blockId);
    if (!block?.moduleId) return [];
    const memberships = moduleCollectionsIndex.get(block.moduleId);
    return memberships ? Array.from(memberships) : [];
  }

  function getBlocksDisabledByCollections(disabledCollections) {
    const disabled = new Set();
    disabledCollections.forEach((collectionId) => {
      const blocksForCollection = collectionBlockIds.get(collectionId) || [];
      blocksForCollection.forEach((blockId) => disabled.add(blockId));
    });
    return disabled;
  }

  function refreshDependencyViews(snapshot) {
    const runtimeModules = snapshot?.runtime?.modules || state.get('runtime.modules') || {};
    dependencyViews.forEach((views, moduleId) => {
      const runtimeInfo = runtimeModules[moduleId] || {};
      const dependencies = Array.isArray(runtimeInfo.dependencies) ? runtimeInfo.dependencies : [];
      const moduleName = runtimeInfo.manifestName || views?.[0]?.moduleName;
      views.forEach((view) => {
        updateDependencyDisplay(view, dependencies, { moduleName });
      });
    });
  }

  function focusModuleCard(moduleId) {
    if (!moduleId) return;
    const blockEntry = blocks.find((block) => block.moduleId === moduleId);
    if (!blockEntry) return;
    const element = moduleElements.get(blockEntry.id);
    if (!element) return;
    if (!element.hasAttribute('tabindex')) {
      element.setAttribute('tabindex', '-1');
    }
    element.classList.add('is-highlighted');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }
    setTimeout(() => {
      element.classList.remove('is-highlighted');
    }, 1600);
  }

  const organizeScroll = document.createElement('div');
  organizeScroll.className = 'a11ytb-organize-scroll';

  const availableSection = document.createElement('section');
  availableSection.className = 'a11ytb-options-section a11ytb-options-section--available';
  const availableHeader = document.createElement('div');
  availableHeader.className = 'a11ytb-section-header';
  const availableTitle = document.createElement('h3');
  availableTitle.className = 'a11ytb-section-title';
  availableTitle.textContent = 'Modules disponibles';
  const availableDescription = document.createElement('p');
  availableDescription.className = 'a11ytb-section-description';
  availableDescription.textContent = 'Filtrez le catalogue interne, vérifiez la compatibilité et identifiez rapidement les dépendances avant activation.';
  availableHeader.append(availableTitle, availableDescription);

  const availableFiltersBar = document.createElement('div');
  availableFiltersBar.className = 'a11ytb-available-filters';

  function createFilterControl(key, id, labelText, options) {
    const select = document.createElement('select');
    select.className = 'a11ytb-available-filter-select';
    select.id = id;
    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      if (option.ariaLabel) {
        opt.setAttribute('aria-label', option.ariaLabel);
      }
      select.append(opt);
    });
    availableFilterSelects[key] = select;
    const container = document.createElement('div');
    container.className = 'a11ytb-available-filter-field';
    const label = document.createElement('span');
    label.className = 'a11ytb-available-filter-label';
    label.textContent = labelText;
    label.id = `${id}-label`;
    select.setAttribute('aria-labelledby', label.id);
    container.append(label, select);
    return container;
  }

  function formatCollectionOption(collection) {
    const indent = collection.depth > 0 ? `${' '.repeat(collection.depth * 2)}⤷ ` : '';
    const label = collection.label || collection.id;
    const optionLabel = `${indent}${label}`.trim();
    const aria = collection.pathLabel || label;
    return { value: collection.id, label: optionLabel, ariaLabel: aria };
  }

  function updateCollectionFilterOptions() {
    const select = availableFilterSelects.collection;
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    const options = [
      { value: 'all', label: 'Toutes les collections' },
      ...collectionDefinitions.map((collection) => formatCollectionOption(collection))
    ];
    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      if (option.ariaLabel) {
        opt.setAttribute('aria-label', option.ariaLabel);
      }
      select.append(opt);
    });
    ensureSelectValue(select, current);
  }

  const profileFilterChoices = [
    { value: 'all', label: 'Tous les profils' },
    ...profileFilterEntries.map((entry) => ({ value: entry.id, label: entry.label }))
  ];

  const collectionFilterChoices = [
    { value: 'all', label: 'Toutes les collections' },
    ...collectionDefinitions.map((collection) => formatCollectionOption(collection))
  ];

  const compatibilityFilterChoices = [
    { value: 'all', label: 'Compatibilité : toutes' },
    { value: 'full', label: 'Compatibles' },
    { value: 'partial', label: 'Partielles' },
    { value: 'unknown', label: 'À vérifier' },
    { value: 'none', label: 'Non déclarées' }
  ];

  const profileFilterField = createFilterControl('profile', 'a11ytb-available-filter-profile', 'Profils', profileFilterChoices);
  const collectionFilterField = createFilterControl('collection', 'a11ytb-available-filter-collection', 'Collections', collectionFilterChoices);
  const compatibilityFilterField = createFilterControl('compatibility', 'a11ytb-available-filter-compat', 'Compatibilité', compatibilityFilterChoices);

  availableFiltersBar.append(profileFilterField, collectionFilterField, compatibilityFilterField);
  updateCollectionFilterOptions();

  [['profile', availableFilterSelects.profile], ['collection', availableFilterSelects.collection], ['compatibility', availableFilterSelects.compatibility]].forEach(([key, select]) => {
    if (!select) return;
    select.addEventListener('change', () => {
      state.set(`ui.availableModules.${key}`, select.value);
    });
  });

  const availableGrid = document.createElement('div');
  availableGrid.className = 'a11ytb-available-grid';

  availableSection.append(availableHeader, availableFiltersBar, availableGrid);

  const organizeSection = document.createElement('section');
  organizeSection.className = 'a11ytb-options-section';
  const organizeHeader = document.createElement('div');
  organizeHeader.className = 'a11ytb-section-header';
  const organizeTitle = document.createElement('h3');
  organizeTitle.className = 'a11ytb-section-title';
  organizeTitle.id = 'a11ytb-organize-title';
  organizeTitle.textContent = 'Organisation des modules';
  const organizeDescription = document.createElement('p');
  organizeDescription.className = 'a11ytb-section-description';
  organizeDescription.textContent = 'Réordonnez les cartes pour prioriser les modules affichés dans le panneau principal.';
  organizeHeader.append(organizeTitle, organizeDescription);

  const organizeKeyboardHint = document.createElement('p');
  organizeKeyboardHint.className = 'a11ytb-admin-help';
  organizeKeyboardHint.id = 'a11ytb-organize-help';
  organizeKeyboardHint.textContent = 'Au clavier : appuyez sur Espace ou Entrée pour saisir une carte, utilisez ↑ ou ↓ pour la déplacer, Échap pour annuler.';

  const organizePointerHint = document.createElement('p');
  organizePointerHint.className = 'a11ytb-admin-help';
  organizePointerHint.id = 'a11ytb-organize-pointer';
  organizePointerHint.textContent = 'À la souris ou au tactile : maintenez la carte enfoncée pour la déplacer, relâchez pour déposer.';

  if (collectionDefinitions.length) {
    collectionsPanel = document.createElement('details');
    collectionsPanel.className = 'a11ytb-collections-panel';
    collectionsPanel.setAttribute('data-ref', 'collections-panel');
    collectionsPanel.innerHTML = '';

    const summary = document.createElement('summary');
    summary.className = 'a11ytb-collections-summary';
    summary.textContent = 'Collections de modules';
    collectionsSummary = summary;
    collectionsPanel.append(summary);

    const intro = document.createElement('p');
    intro.className = 'a11ytb-admin-help';
    intro.textContent = 'Activez ou désactivez plusieurs modules en une action.';
    collectionsPanel.append(intro);

    const list = document.createElement('div');
    list.className = 'a11ytb-collections-list';
    collectionsListRoot = list;

    collectionsPanel.append(list);
    rebuildCollectionsPanel();
  }

  const builderSection = document.createElement('section');
  builderSection.className = 'a11ytb-options-section a11ytb-options-section--builder';
  const builderHeader = document.createElement('div');
  builderHeader.className = 'a11ytb-section-header';
  const builderTitle = document.createElement('h3');
  builderTitle.className = 'a11ytb-section-title';
  builderTitle.textContent = 'Composer des collections';
  const builderDescription = document.createElement('p');
  builderDescription.className = 'a11ytb-section-description';
  builderDescription.textContent = 'Glissez-déposez les modules pour organiser des packs adaptés à vos profils utilisateurs. Utilisez les boutons pour ajouter ou réordonner au clavier.';
  builderHeader.append(builderTitle, builderDescription);

  const builderControls = document.createElement('div');
  builderControls.className = 'a11ytb-builder-controls';

  const builderSelectLabel = document.createElement('label');
  builderSelectLabel.className = 'a11ytb-builder-label';
  builderSelectLabel.setAttribute('for', 'a11ytb-builder-select');
  builderSelectLabel.textContent = 'Collection en cours';

  const builderSelect = document.createElement('select');
  builderSelect.className = 'a11ytb-builder-select';
  builderSelect.id = 'a11ytb-builder-select';
  builderSelect.setAttribute('aria-describedby', 'a11ytb-builder-helper');
  builderControls.append(builderSelectLabel, builderSelect);

  const builderHelper = document.createElement('p');
  builderHelper.className = 'a11ytb-admin-help';
  builderHelper.id = 'a11ytb-builder-helper';
  builderHelper.textContent = 'Sélectionnez une collection existante ou créez-en une nouvelle pour préparer un préréglage.';

  const builderActions = document.createElement('div');
  builderActions.className = 'a11ytb-builder-action-bar';

  const builderCreateButton = document.createElement('button');
  builderCreateButton.type = 'button';
  builderCreateButton.className = 'a11ytb-button a11ytb-button--ghost';
  builderCreateButton.textContent = 'Nouvelle collection';
  builderCreateButton.dataset.builderAction = 'new';

  builderActions.append(builderCreateButton);

  const builderMeta = document.createElement('div');
  builderMeta.className = 'a11ytb-builder-meta';

  const nameField = document.createElement('div');
  nameField.className = 'a11ytb-builder-field';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'a11ytb-builder-field-label';
  nameLabel.setAttribute('for', 'a11ytb-builder-name');
  nameLabel.textContent = 'Nom public';
  const nameInput = document.createElement('input');
  nameInput.id = 'a11ytb-builder-name';
  nameInput.className = 'a11ytb-builder-input';
  nameInput.type = 'text';
  nameInput.placeholder = 'Ex. Profil vision + audio';
  nameField.append(nameLabel, nameInput);

  const descField = document.createElement('div');
  descField.className = 'a11ytb-builder-field';
  const descLabel = document.createElement('label');
  descLabel.className = 'a11ytb-builder-field-label';
  descLabel.setAttribute('for', 'a11ytb-builder-description');
  descLabel.textContent = 'Description';
  const descTextarea = document.createElement('textarea');
  descTextarea.id = 'a11ytb-builder-description';
  descTextarea.className = 'a11ytb-builder-textarea';
  descTextarea.rows = 2;
  descTextarea.placeholder = 'Précisez pour quels besoins cette collection est idéale.';
  descField.append(descLabel, descTextarea);

  builderMeta.append(nameField, descField);

  const builderGrid = document.createElement('div');
  builderGrid.className = 'a11ytb-builder-grid';

  const catalogColumn = document.createElement('section');
  catalogColumn.className = 'a11ytb-builder-column a11ytb-builder-column--catalog';
  const catalogTitle = document.createElement('h4');
  catalogTitle.className = 'a11ytb-builder-column-title';
  catalogTitle.textContent = 'Modules disponibles';
  const catalogHint = document.createElement('p');
  catalogHint.className = 'a11ytb-builder-hint';
  catalogHint.textContent = 'Glissez un module vers la colonne centrale ou utilisez Ajouter.';
  const catalogList = document.createElement('ul');
  catalogList.className = 'a11ytb-builder-list';
  catalogList.dataset.builderList = 'catalog';
  catalogColumn.append(catalogTitle, catalogHint, catalogList);

  const selectionColumn = document.createElement('section');
  selectionColumn.className = 'a11ytb-builder-column a11ytb-builder-column--selection';
  const selectionTitle = document.createElement('h4');
  selectionTitle.className = 'a11ytb-builder-column-title';
  selectionTitle.textContent = 'Modules de la collection';
  const selectionHint = document.createElement('p');
  selectionHint.className = 'a11ytb-builder-hint';
  selectionHint.textContent = 'Réordonnez ou supprimez les modules selon la priorité d’activation.';
  const selectionList = document.createElement('ul');
  selectionList.className = 'a11ytb-builder-list';
  selectionList.dataset.builderList = 'selection';
  selectionColumn.append(selectionTitle, selectionHint, selectionList);

  const previewColumn = document.createElement('section');
  previewColumn.className = 'a11ytb-builder-column a11ytb-builder-column--preview';
  const previewTitle = document.createElement('h4');
  previewTitle.className = 'a11ytb-builder-column-title';
  previewTitle.textContent = 'Aperçu rapide';
  const previewList = document.createElement('ul');
  previewList.className = 'a11ytb-builder-preview';
  previewColumn.append(previewTitle, previewList);

  builderGrid.append(catalogColumn, selectionColumn, previewColumn);

  const builderFooter = document.createElement('div');
  builderFooter.className = 'a11ytb-builder-footer';
  const builderSave = document.createElement('button');
  builderSave.type = 'button';
  builderSave.className = 'a11ytb-button';
  builderSave.dataset.builderAction = 'save';
  builderSave.textContent = 'Enregistrer la collection';
  const builderReset = document.createElement('button');
  builderReset.type = 'button';
  builderReset.className = 'a11ytb-button a11ytb-button--ghost';
  builderReset.dataset.builderAction = 'reset';
  builderReset.textContent = 'Réinitialiser';
  builderFooter.append(builderSave, builderReset);

  const builderEmpty = document.createElement('p');
  builderEmpty.className = 'a11ytb-builder-empty';
  builderEmpty.textContent = 'Aucune collection disponible pour le moment. Créez-en une pour commencer.';
  builderEmpty.hidden = true;

  builderSection.append(
    builderHeader,
    builderControls,
    builderHelper,
    builderActions,
    builderMeta,
    builderGrid,
    builderFooter,
    builderEmpty
  );

  builderElements.section = builderSection;
  builderElements.select = builderSelect;
  builderElements.createButton = builderCreateButton;
  builderElements.labelInput = nameInput;
  builderElements.descriptionInput = descTextarea;
  builderElements.catalogList = catalogList;
  builderElements.selectionList = selectionList;
  builderElements.previewList = previewList;
  builderElements.saveButton = builderSave;
  builderElements.resetButton = builderReset;
  builderElements.emptyNotice = builderEmpty;
  builderElements.helper = builderHelper;

  builderSelect.addEventListener('change', () => {
    loadBuilderState(builderSelect.value);
    renderBuilder();
  });

  builderCreateButton.addEventListener('click', createNewBuilderCollection);
  nameInput.addEventListener('input', () => {
    builderState.label = nameInput.value;
    storeBuilderDraft();
  });
  descTextarea.addEventListener('input', () => {
    builderState.description = descTextarea.value;
    storeBuilderDraft();
  });
  builderSave.addEventListener('click', persistBuilderCollection);
  builderReset.addEventListener('click', resetBuilderCollection);
  catalogList.addEventListener('click', handleBuilderCatalogClick);
  selectionList.addEventListener('click', handleBuilderSelectionClick);
  catalogList.addEventListener('dragover', handleBuilderDragOver);
  catalogList.addEventListener('dragleave', handleBuilderDragLeave);
  catalogList.addEventListener('drop', handleBuilderDrop);
  selectionList.addEventListener('dragover', handleBuilderDragOver);
  selectionList.addEventListener('dragleave', handleBuilderDragLeave);
  selectionList.addEventListener('drop', handleBuilderDrop);

  const organizeToolbar = document.createElement('div');
  organizeToolbar.className = 'a11ytb-admin-toolbar';

  const toolbarMetrics = document.createElement('div');
  toolbarMetrics.className = 'a11ytb-admin-toolbar-metrics';

  const makeMetric = (label, ref) => {
    const metric = document.createElement('span');
    metric.className = 'a11ytb-admin-toolbar-count';
    const value = document.createElement('span');
    value.className = 'a11ytb-admin-toolbar-count-value';
    value.dataset.ref = ref;
    value.textContent = '0';
    const text = document.createElement('span');
    text.className = 'a11ytb-admin-toolbar-count-label';
    text.textContent = label;
    metric.append(value, text);
    toolbarMetrics.append(metric);
    return value;
  };

  adminToolbarCounts.active = makeMetric('Actifs', 'count-active');
  adminToolbarCounts.hidden = makeMetric('Masqués', 'count-hidden');
  adminToolbarCounts.pinned = makeMetric('Épinglés', 'count-pinned');

  const toolbarFilters = document.createElement('div');
  toolbarFilters.className = 'a11ytb-admin-toolbar-filters';

  const makeFilterToggle = (filter, label, description) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'a11ytb-admin-toolbar-toggle';
    button.dataset.organizeFilter = filter;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', description);
    button.title = description;
    button.dataset.defaultAria = description;
    button.dataset.defaultTitle = description;
    button.textContent = label;
    organizeFilterToggles.set(filter, button);
    toolbarFilters.append(button);
    return button;
  };

  makeFilterToggle('pinned', 'Épinglés', 'Afficher uniquement les modules épinglés');
  makeFilterToggle('hidden', 'Masqués', 'Afficher uniquement les modules masqués');

  toolbarFilters.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-organize-filter]');
    if (!toggle) return;
    const filter = toggle.dataset.organizeFilter;
    if (!filter) return;
    const prefs = getPreferences();
    const current = prefs.organizeFilter;
    const next = current === filter ? 'all' : filter;
    if (next !== current) {
      state.set('ui.organizeFilter', next);
    }
  });

  organizeToolbar.append(toolbarMetrics, toolbarFilters);

  const adminList = document.createElement('ol');
  adminList.className = 'a11ytb-admin-list';
  adminList.setAttribute('aria-labelledby', organizeTitle.id);
  adminList.setAttribute('aria-describedby', `${organizeKeyboardHint.id} ${organizePointerHint.id}`);

  const organizeLive = document.createElement('p');
  organizeLive.className = 'a11ytb-sr-only';
  organizeLive.id = 'a11ytb-organize-live';
  organizeLive.setAttribute('role', 'status');
  organizeLive.setAttribute('aria-live', 'polite');

  const organizeChildren = [organizeHeader, organizeKeyboardHint, organizePointerHint];
  if (collectionsPanel) {
    organizeChildren.push(collectionsPanel);
  }
  if (builderElements.section) {
    organizeChildren.push(builderElements.section);
  }
  organizeChildren.push(organizeToolbar, adminList);
  organizeSection.append(...organizeChildren);
  organizeScroll.append(availableSection, organizeSection);
  organizeView.append(organizeScroll, organizeLive);
  const COMPAT_STATUS_LABELS = {
    none: 'Non déclarée',
    full: 'Compatible',
    partial: 'Partielle',
    unknown: 'À vérifier'
  };

  const COMPAT_STATUS_DESCRIPTIONS = {
    none: 'Aucune information de compatibilité n’est fournie.',
    full: 'Compatibilité annoncée avec les plateformes ciblées.',
    partial: 'Certaines fonctionnalités requises manquent sur cet environnement.',
    unknown: 'Compatibilité non vérifiée automatiquement.'
  };

  function ensureSelectValue(select, value) {
    if (!select) return;
    const allowed = Array.from(select.options).some((option) => option.value === value);
    const next = allowed ? value : (select.options[0]?.value ?? 'all');
    if (select.value !== next) {
      select.value = next;
    }
  }

  function formatCategoryLabel(category) {
    if (!category) return 'Divers';
    const match = categories.find((entry) => entry.id === category);
    if (match) return match.label;
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  function createReferenceTag(label) {
    const tag = document.createElement('span');
    tag.className = 'a11ytb-available-tag';
    tag.textContent = label;
    return tag;
  }

  function renderAvailableModules(snapshot) {
    if (!availableGrid) return;
    const data = snapshot || state.get();
    const prefs = data?.ui?.availableModules || {};
    const profileFilter = prefs.profile || 'all';
    const collectionFilter = prefs.collection || 'all';
    const compatibilityFilter = prefs.compatibility || 'all';

    ensureSelectValue(availableFilterSelects.profile, profileFilter);
    ensureSelectValue(availableFilterSelects.collection, collectionFilter);
    ensureSelectValue(availableFilterSelects.compatibility, compatibilityFilter);

    const runtime = data?.runtime?.modules || {};
    const modules = [];

    catalogModuleIds.forEach((moduleId) => {
      const manifest = manifestByModuleId.get(moduleId);
      if (!manifest) return;
      const runtimeEntry = runtime[moduleId] || {};
      const compat = runtimeEntry.metrics?.compat || {};
      const compatStatus = compat.status || 'none';
      const profileIds = Array.from(moduleToProfiles.get(moduleId) ?? []);
      const collectionIds = Array.from(moduleCollectionsIndex.get(moduleId) ?? []);
      const matchesProfile = profileFilter === 'all' || profileIds.includes(profileFilter);
      const matchesCollection = collectionFilter === 'all' || collectionIds.includes(collectionFilter);
      const matchesCompat = compatibilityFilter === 'all' || (compatStatus || 'none') === compatibilityFilter;
      if (!matchesProfile || !matchesCollection || !matchesCompat) return;
      const dependencies = Array.isArray(runtimeEntry.dependencies) ? runtimeEntry.dependencies : [];
      modules.push({
        id: moduleId,
        manifest,
        runtime: runtimeEntry,
        compat,
        compatStatus,
        dependencies,
        profileIds,
        collectionIds
      });
    });

    modules.sort((a, b) => {
      const nameA = a.manifest.name || a.id;
      const nameB = b.manifest.name || b.id;
      return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
    });

    availableGrid.innerHTML = '';

    if (!modules.length) {
      const empty = document.createElement('p');
      empty.className = 'a11ytb-empty-state';
      empty.textContent = 'Aucun module ne correspond aux filtres sélectionnés.';
      availableGrid.append(empty);
      return;
    }

    modules.forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'a11ytb-available-card';
      card.dataset.moduleId = entry.id;

      const header = document.createElement('header');
      header.className = 'a11ytb-available-card-header';

      const title = document.createElement('h4');
      title.className = 'a11ytb-available-card-title';
      title.textContent = entry.manifest.name || entry.id;

      const version = document.createElement('span');
      version.className = 'a11ytb-available-card-version';
      version.textContent = `v${entry.manifest.version || '0.0.0'}`;

      header.append(title, version);
      card.append(header);

      if (entry.manifest.description) {
        const description = document.createElement('p');
        description.className = 'a11ytb-available-card-description';
        description.textContent = entry.manifest.description;
        card.append(description);
      }

      const meta = document.createElement('div');
      meta.className = 'a11ytb-available-card-meta';
      meta.append(createBadge(formatCategoryLabel(entry.manifest.category), 'category', { title: 'Catégorie du module' }));

      const quality = entry.manifest.metadataQuality;
      if (quality) {
        const qualityLevel = typeof quality.level === 'string' ? quality.level.toLowerCase() : 'c';
        const coverageLabel = Number.isFinite(quality.coveragePercent)
          ? `${quality.coveragePercent} %`
          : null;
        const badgeLabel = quality.levelLabel
          ? `Métadonnées ${quality.levelLabel}`
          : `Métadonnées ${quality.level || ''}`.trim();
        const badgeTitleParts = [quality.summary, quality.detail];
        const badge = createBadge(badgeLabel, `quality-${qualityLevel}`, {
          title: badgeTitleParts.filter(Boolean).join(' '),
          ariaLabel: coverageLabel
            ? `${badgeLabel}. Couverture ${coverageLabel}. ${quality.detail || ''}`.trim()
            : `${badgeLabel}. ${quality.detail || ''}`.trim()
        });
        badge.dataset.level = quality.level || '';
        if (coverageLabel) {
          badge.dataset.coverage = coverageLabel;
        }
        meta.append(badge);
      }

      const compatLabel = COMPAT_STATUS_LABELS[entry.compatStatus] || COMPAT_STATUS_LABELS.none;
      const compatBadge = createBadge(`Compatibilité : ${compatLabel}`, `compat-${entry.compatStatus}`, {
        title: COMPAT_STATUS_DESCRIPTIONS[entry.compatStatus] || COMPAT_STATUS_DESCRIPTIONS.none
      });
      meta.append(compatBadge);

      if (entry.runtime.enabled) {
        meta.append(createBadge('Actif', 'active', { title: 'Module chargé dans la configuration actuelle.' }));
      }

      if (entry.dependencies.length) {
        meta.append(createBadge('Requis', 'required', { title: 'Ce module dépend d’autres modules pour fonctionner.' }));
      }

      if (entry.dependencies.some((dep) => dep.status && dep.status !== 'ok')) {
        meta.append(createBadge('En conflit', 'conflict', { title: 'Certaines dépendances signalent un conflit.' }));
      }

      card.append(meta);

      if (entry.dependencies.length) {
        const depsTitle = document.createElement('p');
        depsTitle.className = 'a11ytb-available-subtitle';
        depsTitle.textContent = 'Dépendances';
        card.append(depsTitle);

        const depList = document.createElement('ul');
        depList.className = 'a11ytb-available-deps';
        entry.dependencies.forEach((dep) => {
          const item = document.createElement('li');
          item.className = 'a11ytb-available-dep';

          const name = document.createElement('span');
          name.className = 'a11ytb-available-dep-name';
          name.textContent = dep.label || dep.id;

          const statusBadge = createBadge(dep.statusLabel || 'Requis', `dependency-${dep.status || 'ok'}`, {
            title: dep.message || ''
          });
          statusBadge.dataset.status = dep.status || 'ok';

          const headerRow = document.createElement('div');
          headerRow.className = 'a11ytb-available-dep-header';
          headerRow.append(name, statusBadge);

          item.append(headerRow);

          if (dep.message) {
            const detail = document.createElement('p');
            detail.className = 'a11ytb-available-dep-detail';
            detail.textContent = dep.message;
            item.append(detail);
          }

          depList.append(item);
        });
        card.append(depList);
      }

      const compatMessages = [];
      const missingFeatures = Array.isArray(entry.compat?.missing?.features) ? entry.compat.missing.features : [];
      const missingBrowsers = Array.isArray(entry.compat?.missing?.browsers) ? entry.compat.missing.browsers : [];
      const unknownFeatures = Array.isArray(entry.compat?.unknown?.features) ? entry.compat.unknown.features : [];
      const unknownBrowsers = Array.isArray(entry.compat?.unknown?.browsers) ? entry.compat.unknown.browsers : [];

      if (missingFeatures.length) {
        compatMessages.push(`Fonctionnalités manquantes : ${missingFeatures.join(', ')}`);
      }
      if (missingBrowsers.length) {
        compatMessages.push(`Navigateurs manquants : ${missingBrowsers.join(', ')}`);
      }
      if (!missingFeatures.length && unknownFeatures.length) {
        compatMessages.push(`Fonctionnalités à vérifier : ${unknownFeatures.join(', ')}`);
      }
      if (!missingBrowsers.length && unknownBrowsers.length) {
        compatMessages.push(`Navigateurs à confirmer : ${unknownBrowsers.join(', ')}`);
      }

      if (compatMessages.length) {
        const compatNote = document.createElement('p');
        compatNote.className = 'a11ytb-available-compat-note';
        compatNote.textContent = compatMessages.join(' · ');
        card.append(compatNote);
      }

      if (quality) {
        if (quality.summary) {
          const qualitySummary = document.createElement('p');
          qualitySummary.className = 'a11ytb-available-quality-summary';
          qualitySummary.dataset.level = quality.level || '';
          qualitySummary.textContent = quality.summary;
          card.append(qualitySummary);
        }
        if (quality.detail && Array.isArray(quality.missing) && quality.missing.length) {
          const qualityDetail = document.createElement('p');
          qualityDetail.className = 'a11ytb-available-quality-detail';
          qualityDetail.dataset.level = quality.level || '';
          qualityDetail.textContent = quality.detail;
          card.append(qualityDetail);
        }
        if (Array.isArray(quality.recommendations) && quality.recommendations.length) {
          const recos = document.createElement('ul');
          recos.className = 'a11ytb-available-quality-recos';
          quality.recommendations.forEach((recommendation, index) => {
            const item = document.createElement('li');
            item.textContent = recommendation;
            item.dataset.index = String(index);
            recos.append(item);
          });
          card.append(recos);
        }
      }

      if (entry.profileIds.length || entry.collectionIds.length) {
        const references = document.createElement('div');
        references.className = 'a11ytb-available-references';

        if (entry.profileIds.length) {
          const group = document.createElement('div');
          group.className = 'a11ytb-available-reference-group';
          const label = document.createElement('span');
          label.className = 'a11ytb-available-reference-label';
          label.textContent = 'Profils :';
          group.append(label);
          entry.profileIds.forEach((profileId) => {
            const tag = createReferenceTag(profileDisplayById.get(profileId) || profileId);
            group.append(tag);
          });
          references.append(group);
        }

        if (entry.collectionIds.length) {
          const group = document.createElement('div');
          group.className = 'a11ytb-available-reference-group';
          const label = document.createElement('span');
          label.className = 'a11ytb-available-reference-label';
          label.textContent = 'Collections :';
          group.append(label);
          entry.collectionIds.forEach((collectionId) => {
            const collection = collectionById.get(collectionId);
            const labelText = collection?.label || collectionId;
            const tag = createReferenceTag(labelText);
            group.append(tag);
          });
          references.append(group);
        }

        card.append(references);
      }

      availableGrid.append(card);
    });
  }

  renderAvailableModules(state.get());
  state.on(renderAvailableModules);

  blocks.forEach(block => {
    const el = renderBlock(block, state, modulesContainer);
    moduleElements.set(block.id, el);
    adminItems.set(block.id, createAdminItem(block));
  });

  const optionBindings = [];
  const manifestsWithConfig = allManifests.filter((manifest) => manifest?.config?.fields?.length);

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
  const activityConnectorsList = activity.querySelector('[data-ref="activity-connectors"]');
  const exportJsonBtn = activity.querySelector('[data-action="activity-export-json"]');
  const exportCsvBtn = activity.querySelector('[data-action="activity-export-csv"]');
  const sendSyncBtn = activity.querySelector('[data-action="activity-send-sync"]');

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
      tags,
      payload: entry.payload || null
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
      if (typeof value === 'number') {
        let decimals = 0;
        if (typeof field.step === 'number') {
          const stepString = String(field.step);
          const fraction = stepString.split('.')[1];
          decimals = fraction ? fraction.length : 0;
        } else if (!Number.isInteger(value)) {
          decimals = 2;
        }
        const formatted = decimals > 0 ? value.toFixed(decimals) : value.toString();
        return decimals > 0 ? Number.parseFloat(formatted).toString() : formatted;
      }
      return value ?? '';
    }
    if (field.type === 'toggle') {
      return value ? 'Activé' : 'Désactivé';
    }
    return value ?? '';
  }

  function createOptionField(manifest, field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'a11ytb-option';
    if (field?.type) {
      wrapper.classList.add(`a11ytb-option--${field.type}`);
    }
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

      const minValueRaw = Number(field.min ?? 0);
      const maxValueRaw = Number(field.max ?? 100);
      const sliderMin = Number.isFinite(minValueRaw) ? minValueRaw : 0;
      const sliderMax = Number.isFinite(maxValueRaw) ? maxValueRaw : sliderMin + 100;
      const sliderLow = Math.min(sliderMin, sliderMax);
      const sliderHigh = Math.max(sliderMin, sliderMax);
      const sliderSpan = sliderHigh - sliderLow || 1;

      const updateSliderVisual = (value) => {
        if (!Number.isFinite(value)) return;
        const clamped = Math.min(sliderHigh, Math.max(sliderLow, value));
        const ratio = (clamped - sliderLow) / sliderSpan;
        input.style.setProperty('--a11ytb-slider-progress', `${ratio * 100}%`);
      };

      input.addEventListener('input', () => {
        const raw = input.valueAsNumber;
        const safe = Number.isNaN(raw) ? Number(field.min ?? 0) : raw;
        state.set(field.path, safe);
        valueNode.textContent = formatFieldValue(field, safe);
        updateSliderVisual(safe);
      });
      input.addEventListener('change', () => {
        const raw = input.valueAsNumber;
        const safe = Number.isNaN(raw) ? Number(field.min ?? 0) : raw;
        state.set(field.path, safe);
        if (typeof field.onChange === 'function') {
          field.onChange(safe, { state: state.get(), field, manifest });
        }
        updateSliderVisual(safe);
      });

      wrapper.append(label, input);

      if (field.min !== undefined || field.max !== undefined) {
        const scale = document.createElement('div');
        scale.className = 'a11ytb-option-scale';
        const minLabel = document.createElement('span');
        minLabel.className = 'a11ytb-option-scale-label';
        if (field.min !== undefined) {
          minLabel.textContent = Number.isFinite(sliderMin)
            ? formatFieldValue(field, sliderMin)
            : `${field.min}`;
        } else {
          minLabel.textContent = '';
        }
        const maxLabel = document.createElement('span');
        maxLabel.className = 'a11ytb-option-scale-label';
        if (field.max !== undefined) {
          maxLabel.textContent = Number.isFinite(sliderMax)
            ? formatFieldValue(field, sliderMax)
            : `${field.max}`;
        } else {
          maxLabel.textContent = '';
        }
        scale.append(minLabel, maxLabel);
        wrapper.append(scale);
      }
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
        updateSliderVisual(value);
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
      const status = document.createElement('span');
      status.className = 'a11ytb-option-status';

      const syncToggleVisual = (value) => {
        const formatted = formatFieldValue(field, value);
        label.setAttribute('data-value', formatted);
        label.dataset.state = value === trueValue ? 'on' : 'off';
        status.textContent = formatted;
      };

      input.addEventListener('change', () => {
        const value = input.checked ? trueValue : falseValue;
        state.set(field.path, value);
        if (typeof field.onChange === 'function') {
          field.onChange(value, { state: state.get(), field, manifest });
        }
        syncToggleVisual(value);
      });

      label.append(input, title, status);
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
        syncToggleVisual(current);
      };
    } else if (field.type === 'time') {
      const label = document.createElement('label');
      label.className = 'a11ytb-option-label';
      const title = document.createElement('span');
      title.className = 'a11ytb-option-title';
      title.textContent = field.label || field.path;
      label.append(title);

      const input = document.createElement('input');
      input.type = 'time';
      input.className = 'a11ytb-option-input';
      input.setAttribute('aria-label', field.label || field.path);
      if (field.step !== undefined) {
        input.step = String(field.step);
      }
      label.append(input);
      wrapper.append(label);

      if (field.description) {
        const hint = document.createElement('p');
        hint.className = 'a11ytb-option-description';
        hint.textContent = field.description;
        wrapper.append(hint);
      }

      const normalizeTimeValue = (value, fallbackValue = '00:00') => {
        if (typeof value !== 'string') return fallbackValue;
        const trimmed = value.trim();
        if (!trimmed) return fallbackValue;
        const match = /^([0-2]?\d)(?::([0-5]\d))?$/.exec(trimmed);
        if (!match) return fallbackValue;
        let hours = Number.parseInt(match[1], 10);
        let minutes = match[2] !== undefined ? Number.parseInt(match[2], 10) : 0;
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallbackValue;
        if (hours < 0) hours = 0;
        if (hours > 23) hours = 23;
        if (minutes < 0) minutes = 0;
        if (minutes > 59) minutes = 59;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      };

      const fallback = normalizeTimeValue(typeof field.defaultValue === 'string' ? field.defaultValue : '', '00:00');

      const commitValue = (raw) => {
        const safe = normalizeTimeValue(raw, fallback);
        state.set(field.path, safe);
        if (typeof field.onChange === 'function') {
          field.onChange(safe, { state: state.get(), field, manifest });
        }
        return safe;
      };

      input.addEventListener('change', () => {
        input.value = commitValue(input.value);
      });

      input.addEventListener('blur', () => {
        input.value = normalizeTimeValue(input.value, fallback);
      });

      update = (snapshot) => {
        const current = readValue(snapshot, field.path);
        const safe = normalizeTimeValue(typeof current === 'string' ? current : '', fallback);
        if (document.activeElement !== input) {
          input.value = safe;
        }
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
      pinned: Array.isArray(ui.pinned) ? [...ui.pinned] : [],
      hidden: Array.isArray(ui.hidden) ? [...ui.hidden] : [],
      disabled: Array.isArray(ui.disabled) ? [...ui.disabled] : [],
      moduleOrder: Array.isArray(ui.moduleOrder) ? [...ui.moduleOrder] : [],
      showHidden: !!ui.showHidden,
      organizeFilter: ui.organizeFilter === 'pinned' || ui.organizeFilter === 'hidden' ? ui.organizeFilter : 'all',
      view: ui.view || 'modules',
      activeProfile: ui.activeProfile || 'custom',
      priorities: normalizePriorityObject(ui.priorities),
      collections: {
        disabled: Array.isArray(ui.collections?.disabled) ? [...ui.collections.disabled] : []
      }
    };
  }

  function getCurrentPriorities() {
    return normalizePriorityObject(state.get('ui.priorities'));
  }

  function getCurrentAdminOrder() {
    return Array.from(adminList.querySelectorAll('.a11ytb-admin-item'))
      .map(item => item.dataset.blockId)
      .filter(Boolean);
  }

  function updateAdminPositions() {
    const items = Array.from(adminList.querySelectorAll('.a11ytb-admin-item'));
    const visible = items.filter(item => !item.hasAttribute('hidden'));
    const total = visible.length;
    visible.forEach((item, index) => {
      item.setAttribute('aria-posinset', String(index + 1));
      item.setAttribute('aria-setsize', String(total));
      const badge = item.querySelector('[data-ref="position"]');
      if (badge) badge.textContent = String(index + 1);
    });
    items
      .filter(item => item.hasAttribute('hidden'))
      .forEach((item) => {
        item.removeAttribute('aria-posinset');
        item.setAttribute('aria-setsize', String(total));
      });
  }

  function announceOrganize(message) {
    if (!organizeLive) return;
    organizeLive.textContent = '';
    if (message) {
      organizeLive.textContent = message;
    }
  }

  function commitModuleOrder(nextOrder, { moduleId, position, total } = {}) {
    const sanitized = Array.isArray(nextOrder) ? nextOrder.filter(id => allowedIds.has(id)) : [];
    if (!sanitized.length) return false;
    const prefs = getPreferences();
    const storedOrder = Array.isArray(prefs.moduleOrder) ? prefs.moduleOrder : [];
    const baseline = storedOrder.length ? storedOrder : blockIds;
    if (arraysEqual(sanitized, baseline)) {
      return false;
    }
    const defaultOrder = blockIds;
    if (arraysEqual(sanitized, defaultOrder)) {
      if (storedOrder.length) {
        state.set('ui.moduleOrder', []);
        logActivity('Ordre des modules réinitialisé', { tone: 'info', tags: ['organisation'] });
        return true;
      }
      return false;
    }
    state.set('ui.moduleOrder', sanitized);
    markProfileAsCustom();
    if (moduleId) {
      const block = blockInfo.get(moduleId);
      const title = block?.title || moduleId;
      const count = total ?? sanitized.length;
      const pos = position ?? sanitized.indexOf(moduleId) + 1;
      const message = `Module déplacé : ${title} (position ${pos}/${count})`;
      logActivity(message, { tone: 'info', module: moduleId, tags: ['organisation'] });
    } else {
      logActivity('Ordre des modules mis à jour', { tone: 'info', tags: ['organisation'] });
    }
    return true;
  }

  let keyboardDragId = null;

  function finishKeyboardDrag({ commit = false, silent = false } = {}) {
    if (!keyboardDragId) return;
    const currentId = keyboardDragId;
    const item = adminItems.get(currentId);
    keyboardDragId = null;
    if (item) {
      item.setAttribute('aria-grabbed', 'false');
      item.classList.remove('is-grabbed');
    }
    adminList.classList.remove('is-keyboard-dragging');
    if (commit) {
      const order = getCurrentAdminOrder();
      const index = order.indexOf(currentId);
      const total = order.length;
      const block = blockInfo.get(currentId);
      const title = block?.title || currentId;
      if (commitModuleOrder(order, { moduleId: currentId, position: index + 1, total })) {
        if (!silent) announceOrganize(`${title} placé en position ${index + 1} sur ${total}.`);
      } else {
        syncAdminList();
        if (!silent) announceOrganize('Ordre inchangé.');
      }
    } else {
      syncAdminList();
      if (!silent) announceOrganize('Réorganisation annulée.');
    }
    const refreshed = adminItems.get(currentId);
    if (refreshed && typeof refreshed.focus === 'function') {
      requestAnimationFrame(() => {
        try {
          refreshed.focus({ preventScroll: true });
        } catch (error) {
          refreshed.focus();
        }
      });
    }
  }

  function cancelKeyboardDrag(options = {}) {
    if (!keyboardDragId) return;
    finishKeyboardDrag({ commit: false, ...options });
  }

  function startKeyboardDrag(item) {
    if (!item?.dataset?.blockId) return;
    if (keyboardDragId && keyboardDragId !== item.dataset.blockId) {
      finishKeyboardDrag({ commit: false, silent: true });
    }
    keyboardDragId = item.dataset.blockId;
    item.classList.add('is-grabbed');
    item.setAttribute('aria-grabbed', 'true');
    adminList.classList.add('is-keyboard-dragging');
    const title = item.dataset.title || item.dataset.blockId;
    announceOrganize(`${title} sélectionné. Utilisez les flèches pour déplacer, appuyez de nouveau sur Entrée pour déposer.`);
  }

  function moveKeyboardItem(direction) {
    if (!keyboardDragId) return;
    const item = adminItems.get(keyboardDragId);
    if (!item) return;
    const siblings = Array.from(adminList.querySelectorAll('.a11ytb-admin-item:not([hidden])'));
    const index = siblings.indexOf(item);
    if (index === -1) return;
    const targetIndex = direction < 0 ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      const block = blockInfo.get(keyboardDragId);
      const title = block?.title || keyboardDragId;
      announceOrganize(`${title} est déjà ${direction < 0 ? 'en première position' : 'en dernière position'}.`);
      return;
    }
    const reference = siblings[targetIndex];
    if (direction > 0) {
      adminList.insertBefore(item, reference.nextSibling);
    } else {
      adminList.insertBefore(item, reference);
    }
    updateAdminPositions();
    if (typeof item.focus === 'function') {
      try {
        item.focus({ preventScroll: true });
      } catch (error) {
        item.focus();
      }
    }
    const total = siblings.length;
    const visibleSiblings = Array.from(adminList.querySelectorAll('.a11ytb-admin-item:not([hidden])'));
    const newIndex = visibleSiblings.indexOf(item);
    const block = blockInfo.get(keyboardDragId);
    const title = block?.title || keyboardDragId;
    if (newIndex !== -1) {
      announceOrganize(`${title} position ${newIndex + 1} sur ${total}.`);
    }
  }

  let pointerDragState = null;

  function finalizePointerDrag({ cancelled = false, silent = false } = {}) {
    if (!pointerDragState) return;
    const { item, pointerId, id } = pointerDragState;
    pointerDragState = null;
    try {
      item.releasePointerCapture?.(pointerId);
    } catch (error) {
      // ignore pointer capture release errors
    }
    item.classList.remove('is-grabbed');
    item.setAttribute('aria-grabbed', 'false');
    adminList.classList.remove('is-pointer-dragging');
    updateAdminPositions();
    if (cancelled) {
      syncAdminList();
      if (!silent) announceOrganize('Réorganisation annulée.');
      return;
    }
    const order = getCurrentAdminOrder();
    const index = order.indexOf(id);
    const total = order.length;
    const block = blockInfo.get(id);
    const title = block?.title || id;
    if (commitModuleOrder(order, { moduleId: id, position: index + 1, total })) {
      if (!silent) announceOrganize(`${title} déplacé en position ${index + 1} sur ${total}.`);
    } else {
      syncAdminList();
      if (!silent) announceOrganize('Ordre inchangé.');
    }
    const refreshed = adminItems.get(id);
    if (refreshed && typeof refreshed.focus === 'function') {
      requestAnimationFrame(() => {
        try {
          refreshed.focus({ preventScroll: true });
        } catch (error) {
          refreshed.focus();
        }
      });
    }
  }

  function onAdminItemPointerDown(event) {
    const item = event.currentTarget;
    if (!item?.dataset?.blockId) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('input, button, select, textarea')) return;
    event.preventDefault();
    cancelKeyboardDrag({ silent: true });
    pointerDragState = {
      id: item.dataset.blockId,
      item,
      pointerId: event.pointerId
    };
    adminList.classList.add('is-pointer-dragging');
    item.classList.add('is-grabbed');
    item.setAttribute('aria-grabbed', 'true');
    item.setPointerCapture?.(event.pointerId);
    const title = item.dataset.title || item.dataset.blockId;
    announceOrganize(`${title} sélectionné. Glissez pour modifier la position, relâchez pour déposer.`);
  }

  function onAdminItemPointerMove(event) {
    if (!pointerDragState || event.pointerId !== pointerDragState.pointerId) return;
    event.preventDefault();
    const { item } = pointerDragState;
    const siblings = Array.from(adminList.querySelectorAll('.a11ytb-admin-item:not([hidden])')).filter(el => el !== item);
    const clientY = event.clientY;
    let inserted = false;
    for (const sibling of siblings) {
      const rect = sibling.getBoundingClientRect();
      const midpoint = rect.top + (rect.height / 2);
      if (clientY < midpoint) {
        adminList.insertBefore(item, sibling);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      adminList.append(item);
    }
    updateAdminPositions();
  }

  function onAdminItemPointerUp(event) {
    if (!pointerDragState || event.pointerId !== pointerDragState.pointerId) return;
    event.preventDefault();
    finalizePointerDrag({ cancelled: false });
  }

  function onAdminItemPointerCancel(event) {
    if (!pointerDragState || event.pointerId !== pointerDragState.pointerId) return;
    event.preventDefault();
    finalizePointerDrag({ cancelled: true });
  }

  function onAdminItemKeydown(event) {
    const item = event.currentTarget;
    if (!item?.dataset?.blockId) return;
    if (event.target !== item) {
      if (event.key === 'Escape' && keyboardDragId === item.dataset.blockId) {
        event.preventDefault();
        finishKeyboardDrag({ commit: false });
      }
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (keyboardDragId === item.dataset.blockId) {
        finishKeyboardDrag({ commit: true });
      } else {
        startKeyboardDrag(item);
      }
      return;
    }
    if (keyboardDragId !== item.dataset.blockId) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finishKeyboardDrag({ commit: false });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveKeyboardItem(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveKeyboardItem(1);
    }
  }

  function createAdminItem(block) {
    const li = document.createElement('li');
    li.className = 'a11ytb-admin-item';
    li.dataset.blockId = block.id;
    li.dataset.moduleId = block.moduleId || block.id;
    li.dataset.title = block.title || block.id;
    if (block.category) {
      li.dataset.category = block.category;
    }
    li.tabIndex = 0;
    li.setAttribute('role', 'listitem');
    li.setAttribute('aria-grabbed', 'false');

    const handle = document.createElement('span');
    handle.className = 'a11ytb-admin-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M10 4h4v2h-4V4zm0 7h4v2h-4v-2zm0 7h4v2h-4v-2z"/></svg>';

    const order = document.createElement('span');
    order.className = 'a11ytb-admin-order';
    order.dataset.ref = 'position';
    order.setAttribute('aria-hidden', 'true');
    order.textContent = '1';

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
    const labelId = `a11ytb-admin-label-${block.id}`;
    labelText.id = labelId;
    li.setAttribute('aria-labelledby', labelId);

    label.append(checkbox, labelText);

    const status = document.createElement('div');
    status.className = 'a11ytb-admin-status';
    status.hidden = true;
    status.setAttribute('aria-hidden', 'true');

    const pinnedBadge = document.createElement('span');
    pinnedBadge.className = 'a11ytb-admin-badge a11ytb-admin-badge--pinned';
    pinnedBadge.dataset.ref = 'badge-pinned';
    pinnedBadge.textContent = 'Épinglé';
    pinnedBadge.hidden = true;

    const hiddenBadge = document.createElement('span');
    hiddenBadge.className = 'a11ytb-admin-badge a11ytb-admin-badge--hidden';
    hiddenBadge.dataset.ref = 'badge-hidden';
    hiddenBadge.textContent = 'Masqué';
    hiddenBadge.hidden = true;

    const disabledBadge = document.createElement('span');
    disabledBadge.className = 'a11ytb-admin-badge a11ytb-admin-badge--disabled';
    disabledBadge.dataset.ref = 'badge-disabled';
    disabledBadge.textContent = 'Désactivé';
    disabledBadge.hidden = true;

    status.append(pinnedBadge, hiddenBadge, disabledBadge);

    const actions = document.createElement('div');
    actions.className = 'a11ytb-admin-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Actions d’organisation du module');

    const pinButton = document.createElement('button');
    pinButton.type = 'button';
    pinButton.className = 'a11ytb-admin-action';
    pinButton.dataset.adminAction = 'pin';
    pinButton.setAttribute('aria-pressed', 'false');
    const pinLabel = `Épingler le module ${block.title || block.id}`.trim();
    pinButton.setAttribute('aria-label', pinLabel);
    pinButton.title = pinLabel;
    pinButton.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 2l3 3-2.29 2.29 2 2L19 12l-3-1-2-2L6 17l-2-2 8-8-2-2 1-1h4z"/></svg>';

    const hideButton = document.createElement('button');
    hideButton.type = 'button';
    hideButton.className = 'a11ytb-admin-action';
    hideButton.dataset.adminAction = 'hide';
    hideButton.setAttribute('aria-pressed', 'false');
    const hideLabel = `Masquer le module ${block.title || block.id}`.trim();
    hideButton.setAttribute('aria-label', hideLabel);
    hideButton.title = hideLabel;
    hideButton.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 5c4.73 0 8.74 3.11 10 7-1.26 3.89-5.27 7-10 7s-8.74-3.11-10-7c1.26-3.89 5.27-7 10-7zm0 2c-3.05 0-6.17 2.09-7.27 5 1.1 2.91 4.22 5 7.27 5s6.17-2.09 7.27-5C18.17 9.09 15.05 7 12 7zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>';

    actions.append(pinButton, hideButton);

    const meta = document.createElement('div');
    meta.className = 'a11ytb-admin-meta';

    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'a11ytb-admin-category';
    categoryBadge.textContent = categories.find(cat => cat.id === block.category)?.label || 'Divers';
    meta.append(categoryBadge);

    const priorityWrapper = document.createElement('div');
    priorityWrapper.className = 'a11ytb-admin-priority';

    const prioritySelectId = `a11ytb-priority-select-${block.id}`;
    const priorityLabel = document.createElement('label');
    priorityLabel.className = 'a11ytb-admin-priority-label';
    priorityLabel.setAttribute('for', prioritySelectId);
    priorityLabel.textContent = 'Priorité';

    const prioritySelect = document.createElement('select');
    prioritySelect.className = 'a11ytb-admin-priority-select';
    prioritySelect.dataset.ref = 'priority';
    prioritySelect.id = prioritySelectId;
    prioritySelect.setAttribute('aria-label', `Définir la priorité du module ${block.title || block.id}`);

    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = 'Automatique';
    prioritySelect.append(autoOption);

    PRIORITY_LEVELS.forEach((level) => {
      const option = document.createElement('option');
      option.value = level.id;
      option.textContent = level.label;
      prioritySelect.append(option);
    });

    const priorityHint = document.createElement('p');
    priorityHint.className = 'a11ytb-admin-priority-hint';
    priorityHint.dataset.ref = 'priority-hint';
    priorityHint.id = `a11ytb-priority-hint-${block.id}`;
    priorityHint.textContent = PRIORITY_DEFAULT_DESCRIPTION;
    prioritySelect.setAttribute('aria-describedby', priorityHint.id);

    priorityWrapper.append(priorityLabel, prioritySelect, priorityHint);
    meta.append(priorityWrapper);

    const dependenciesSection = document.createElement('div');
    dependenciesSection.className = 'a11ytb-admin-dependencies';

    const dependenciesTitle = document.createElement('h4');
    dependenciesTitle.className = 'a11ytb-admin-dependencies-title';
    dependenciesTitle.textContent = 'Dépendances';
    dependenciesSection.append(dependenciesTitle);

    const dependenciesSummary = document.createElement('p');
    dependenciesSummary.className = 'a11ytb-admin-dependencies-summary';
    dependenciesSection.append(dependenciesSummary);

    const dependenciesList = document.createElement('ul');
    dependenciesList.className = 'a11ytb-admin-dependencies-list';
    dependenciesSection.append(dependenciesList);

    const dependenciesLive = document.createElement('div');
    dependenciesLive.className = 'a11ytb-sr-only';
    dependenciesLive.setAttribute('role', 'status');
    dependenciesLive.setAttribute('aria-live', 'polite');
    dependenciesSection.append(dependenciesLive);

    meta.append(dependenciesSection);

    const moduleId = li.dataset.moduleId;
    if (moduleId) {
      const view = {
        moduleId,
        wrapper: dependenciesSection,
        list: dependenciesList,
        summary: dependenciesSummary,
        live: dependenciesLive,
        moduleName: block.title || moduleId
      };
      if (dependencyViews.has(moduleId)) {
        dependencyViews.get(moduleId).push(view);
      } else {
        dependencyViews.set(moduleId, [view]);
      }
      const runtimeInfo = state.get(`runtime.modules.${moduleId}`) || {};
      const dependencies = Array.isArray(runtimeInfo.dependencies) ? runtimeInfo.dependencies : [];
      updateDependencyDisplay(view, dependencies, { moduleName: runtimeInfo.manifestName || view.moduleName });
    }

    prioritySelect.addEventListener('change', () => {
      const raw = prioritySelect.value;
      const normalized = PRIORITY_LOOKUP.has(raw) ? raw : '';
      const current = getCurrentPriorities();
      const next = { ...current };
      if (normalized) {
        next[block.id] = normalized;
      } else {
        delete next[block.id];
      }
      if (!shallowEqualObjects(current, next)) {
        state.set('ui.priorities', next);
        markProfileAsCustom();
        const entry = getPriorityEntry(normalized);
        const tone = entry?.tone || 'info';
        const title = block.title || block.id;
        const labelText = entry?.label || 'automatique';
        logActivity(`Priorité ${labelText} pour ${title}`, { tone, module: block.id, tags: ['organisation', 'priorites'] });
      }
      priorityHint.textContent = getPriorityDescription(normalized || null);
    });

    li.append(handle, order, icon, label, status, actions, meta);

    li.addEventListener('keydown', onAdminItemKeydown);
    li.addEventListener('pointerdown', onAdminItemPointerDown);
    li.addEventListener('pointermove', onAdminItemPointerMove);
    li.addEventListener('pointerup', onAdminItemPointerUp);
    li.addEventListener('pointercancel', onAdminItemPointerCancel);

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

    pinButton.addEventListener('click', () => {
      const prefs = getPreferences();
      const pinned = Array.isArray(prefs.pinned) ? [...prefs.pinned] : [];
      const index = pinned.indexOf(block.id);
      if (index === -1) {
        pinned.unshift(block.id);
      } else {
        pinned.splice(index, 1);
      }
      setListIfChanged('ui.pinned', pinned, prefs.pinned);
      markProfileAsCustom();
    });

    hideButton.addEventListener('click', () => {
      const prefs = getPreferences();
      const hidden = Array.isArray(prefs.hidden) ? [...prefs.hidden] : [];
      const index = hidden.indexOf(block.id);
      if (index === -1) {
        hidden.push(block.id);
        setListIfChanged('ui.hidden', hidden, prefs.hidden);
        const pinned = Array.isArray(prefs.pinned) ? prefs.pinned.filter(id => id !== block.id) : [];
        setListIfChanged('ui.pinned', pinned, prefs.pinned);
      } else {
        hidden.splice(index, 1);
        setListIfChanged('ui.hidden', hidden, prefs.hidden);
      }
      markProfileAsCustom();
    });

    return li;
  }

  function syncAdminList() {
    const prefs = getPreferences();
    const runtimeModules = state.get('runtime.modules') || {};
    const disabledSet = new Set(prefs.disabled);
    const hiddenSet = new Set(prefs.hidden);
    const pinnedSet = new Set(prefs.pinned);
    const disabledCollectionsSet = new Set(prefs.collections.disabled);
    const disabledByCollection = getBlocksDisabledByCollections(disabledCollectionsSet);
    const currentFilter = prefs.organizeFilter;
    const validPriorities = {};
    Object.entries(prefs.priorities || {}).forEach(([id, priority]) => {
      if (allowedIds.has(id) && PRIORITY_LOOKUP.has(priority)) {
        validPriorities[id] = priority;
      }
    });
    function hasDependencyIssue(blockId) {
      const moduleId = blockInfo.get(blockId)?.moduleId || blockId;
      const runtimeEntry = runtimeModules[moduleId] || {};
      const dependencies = Array.isArray(runtimeEntry.dependencies) ? runtimeEntry.dependencies : [];
      return dependencies.some((entry) => entry?.status && entry.status !== 'ok');
    }

    const hasCustomOrder = prefs.moduleOrder.length > 0;
    const orderSource = hasCustomOrder
      ? prefs.moduleOrder
      : [...blockIds].sort((a, b) => {
          const depDiff = Number(hasDependencyIssue(b)) - Number(hasDependencyIssue(a));
          if (depDiff !== 0) return depDiff;
          const diff = getPriorityWeight(validPriorities[a]) - getPriorityWeight(validPriorities[b]);
          if (diff !== 0) return diff;
          return (blockIndex.get(a) ?? 0) - (blockIndex.get(b) ?? 0);
        });
    const seen = new Set();
    orderSource.forEach((id) => {
      if (!allowedIds.has(id) || seen.has(id)) return;
      const item = adminItems.get(id);
      if (item) {
        adminList.append(item);
        seen.add(id);
      }
    });
    adminItems.forEach((item, id) => {
      if (seen.has(id)) return;
      adminList.append(item);
    });
    const items = Array.from(adminList.querySelectorAll('.a11ytb-admin-item'));
    items.forEach((item) => {
      const id = item.dataset.blockId;
      if (!id) return;
      const title = item.dataset.title || id;
      const collectionMembership = getCollectionsForBlock(id);
      if (collectionMembership.length) {
        item.dataset.collections = collectionMembership.join(',');
      } else {
        delete item.dataset.collections;
      }
      const collectionDisabled = disabledByCollection.has(id);
      const manualDisabled = disabledSet.has(id);
      const enabled = !manualDisabled && !collectionDisabled;
      const hidden = hiddenSet.has(id);
      const pinned = pinnedSet.has(id);
      const showItem = currentFilter === 'all'
        ? true
        : currentFilter === 'pinned'
          ? pinned
          : hidden;
      if (showItem) {
        item.hidden = false;
        item.setAttribute('aria-hidden', 'false');
        item.tabIndex = 0;
      } else {
        item.hidden = true;
        item.setAttribute('aria-hidden', 'true');
        item.tabIndex = -1;
      }
      const checkbox = item.querySelector('input[type="checkbox"][data-ref="toggle"]');
      if (checkbox) {
        if (checkbox.checked !== enabled) {
          checkbox.checked = enabled;
        }
        checkbox.disabled = collectionDisabled;
      }
      item.classList.toggle('is-disabled', !enabled);
      item.classList.toggle('is-disabled-by-collection', collectionDisabled);
      item.classList.toggle('is-hidden', hidden);
      item.classList.toggle('is-pinned', pinned);
      item.setAttribute('aria-disabled', String(!enabled));
      const pinnedBadge = item.querySelector('[data-ref="badge-pinned"]');
      if (pinnedBadge) pinnedBadge.hidden = !pinned;
      const hiddenBadge = item.querySelector('[data-ref="badge-hidden"]');
      if (hiddenBadge) hiddenBadge.hidden = !hidden;
      const disabledBadge = item.querySelector('[data-ref="badge-disabled"]');
      if (disabledBadge) {
        disabledBadge.hidden = enabled;
        if (!enabled) {
          disabledBadge.textContent = collectionDisabled ? 'Désactivé (collection)' : 'Désactivé';
        }
      }
      const statusContainer = item.querySelector('.a11ytb-admin-status');
      if (statusContainer) {
        const shouldHideStatus = !(pinned || hidden || !enabled);
        statusContainer.hidden = shouldHideStatus;
        statusContainer.setAttribute('aria-hidden', shouldHideStatus ? 'true' : 'false');
      }
      const prioritySelect = item.querySelector('select[data-ref="priority"]');
      const priorityHint = item.querySelector('[data-ref="priority-hint"]');
      const priorityId = validPriorities[id] || '';
      if (prioritySelect && prioritySelect.value !== priorityId) {
        prioritySelect.value = priorityId;
      }
      if (priorityHint) {
        priorityHint.textContent = getPriorityDescription(priorityId || null);
      }
      const pinBtn = item.querySelector('[data-admin-action="pin"]');
      if (pinBtn) {
        const actionLabel = `${pinned ? 'Retirer l’épingle du' : 'Épingler le'} module ${title}`.trim();
        pinBtn.setAttribute('aria-pressed', String(pinned));
        pinBtn.classList.toggle('is-active', pinned);
        if (enabled) {
          pinBtn.disabled = false;
          pinBtn.removeAttribute('aria-disabled');
          pinBtn.setAttribute('aria-label', actionLabel);
          pinBtn.title = actionLabel;
        } else {
          pinBtn.disabled = true;
          pinBtn.setAttribute('aria-disabled', 'true');
          const reason = collectionDisabled ? 'désactivé par une collection' : 'désactivé';
          pinBtn.setAttribute('aria-label', `Impossible de modifier l’épingle du module ${title} tant qu’il est ${reason}`);
          pinBtn.title = collectionDisabled ? 'Module désactivé via collection : action indisponible' : 'Module désactivé : action indisponible';
        }
      }
      const hideBtn = item.querySelector('[data-admin-action="hide"]');
      if (hideBtn) {
        const hideLabel = `${hidden ? 'Afficher' : 'Masquer'} le module ${title}`.trim();
        hideBtn.setAttribute('aria-pressed', String(hidden));
        hideBtn.classList.toggle('is-active', hidden);
        const accessibleLabel = enabled
          ? hideLabel
          : `${hideLabel} (${collectionDisabled ? 'module désactivé par une collection' : 'module désactivé'})`;
        hideBtn.setAttribute('aria-label', accessibleLabel);
        hideBtn.title = accessibleLabel;
        hideBtn.disabled = collectionDisabled;
        if (collectionDisabled) {
          hideBtn.setAttribute('aria-disabled', 'true');
        } else {
          hideBtn.removeAttribute('aria-disabled');
        }
      }
    });
    const disabledUnion = new Set([...disabledSet, ...disabledByCollection]);
    if (adminToolbarCounts.active) {
      adminToolbarCounts.active.textContent = String(Math.max(0, blockIds.length - disabledUnion.size));
    }
    if (adminToolbarCounts.hidden) {
      adminToolbarCounts.hidden.textContent = String(hiddenSet.size);
    }
    if (adminToolbarCounts.pinned) {
      adminToolbarCounts.pinned.textContent = String(pinnedSet.size);
    }
    organizeFilterToggles.forEach((button, filterKey) => {
      const pressed = currentFilter === filterKey;
      button.setAttribute('aria-pressed', String(pressed));
      button.classList.toggle('is-active', pressed);
      const defaultLabel = button.dataset.defaultAria || button.getAttribute('aria-label');
      const defaultTitle = button.dataset.defaultTitle || button.title;
      if (pressed) {
        button.setAttribute('aria-label', 'Afficher tous les modules');
        button.title = 'Afficher tous les modules';
      } else {
        if (defaultLabel) button.setAttribute('aria-label', defaultLabel);
        if (defaultTitle) button.title = defaultTitle;
      }
    });
    updateAdminPositions();
  }

  function syncDependencyViews(snapshot = state.get()) {
    const runtimeModules = snapshot?.runtime?.modules || {};
    dependencyViews.forEach((views, moduleId) => {
      const runtimeInfo = runtimeModules[moduleId] || {};
      const dependencies = Array.isArray(runtimeInfo.dependencies) ? runtimeInfo.dependencies : [];
      const manifestName = runtimeInfo.manifestName || runtimeInfo.name || '';
      views.forEach((view) => {
        if (!view) return;
        if (manifestName) {
          view.moduleName = manifestName;
        }
        updateDependencyDisplay(view, dependencies, { moduleName: view.moduleName || moduleId });
      });
    });
  }

  function syncCollectionPanel() {
    if (!collectionButtons.size) return;
    const prefs = getPreferences();
    const disabledSet = new Set(prefs.collections.disabled);
    collectionButtons.forEach((button, collectionId) => {
      const storedEnabled = !disabledSet.has(collectionId);
      const label = button.dataset.collectionLabel || collectionId;
      const pathLabel = button.dataset.collectionPath || label;
      let effectiveEnabled = storedEnabled;
      let action = effectiveEnabled ? 'Désactiver' : 'Activer';
      let text = `${action} ${label}`.trim();

      let accessibleLabel = `${action} la collection ${pathLabel}`.trim();
      let tooltip = accessibleLabel;
      const info = collectionById.get(collectionId);
      const ancestors = Array.isArray(info?.ancestors) ? info.ancestors : [];
      const blockingAncestorId = ancestors.find((ancestorId) => disabledSet.has(ancestorId));

      const existingSr = button.querySelector('.a11ytb-sr-only');

      if (blockingAncestorId) {
        const blockingLabel = collectionById.get(blockingAncestorId)?.label
          || moduleCollectionsById.get(blockingAncestorId)?.label
          || blockingAncestorId;
        const message = `Activez d’abord ${blockingLabel} pour modifier ${label}.`;
        effectiveEnabled = false;
        action = 'Activer';
        text = `${action} ${label}`.trim();
        accessibleLabel = `${action} la collection ${pathLabel}. ${message}`;
        tooltip = message;
        button.disabled = true;
        if (existingSr) {
          existingSr.textContent = message;
        } else {
          const sr = document.createElement('span');
          sr.className = 'a11ytb-sr-only';
          sr.textContent = message;
          button.append(sr);
        }
      } else {
        button.disabled = false;
        if (existingSr) {
          existingSr.remove();
        }
      }

      button.textContent = text;
      button.setAttribute('aria-pressed', String(effectiveEnabled));
      button.classList.toggle('is-active', effectiveEnabled);
      button.setAttribute('aria-label', accessibleLabel);
      button.title = tooltip;
    });
    if (collectionsSummary) {
      const total = collectionButtons.size;
      const active = total - disabledSet.size;
      collectionsSummary.textContent = `Collections de modules (${active}/${total} actives)`;
    }
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
      pinned: [...prefs.pinned],
      collectionsDisabled: new Set(prefs.collections.disabled)
    };

    const ensureEnabled = (ids = []) => {
      let changed = false;
      let collectionsChanged = false;
      ids.forEach(id => {
        if (working.disabled.delete(id)) changed = true;
        const moduleId = blockInfo.get(id)?.moduleId;
        if (!moduleId) return;
        const memberships = moduleCollectionsIndex.get(moduleId);
        if (!memberships) return;
        memberships.forEach((collectionId) => {
          if (working.collectionsDisabled.delete(collectionId)) {
            collectionsChanged = true;
          }
        });
      });
      if (changed) {
        const next = Array.from(working.disabled);
        setListIfChanged('ui.disabled', next, prefs.disabled);
        prefs.disabled = next;
      }
      if (collectionsChanged) {
        const nextCollections = Array.from(working.collectionsDisabled);
        setListIfChanged('ui.collections.disabled', nextCollections, prefs.collections.disabled);
        prefs.collections.disabled = nextCollections;
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
    categoryButtons.forEach((btn, categoryId) => {
      const active = categoryId === prefs.category;
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

  function moveModulesTo(container) {
    if (!modulesLayout || !container) return;
    if (modulesLayout.parentElement === container) return;
    container.append(modulesLayout);
  }

  function syncModuleLayoutPreference(snapshot) {
    const prefs = snapshot?.ui || {};
    const requested = typeof prefs.moduleLayout === 'string' ? prefs.moduleLayout : 'double-column';
    const layout = layoutPresetMap.has(requested) ? requested : 'double-column';
    modulesView.dataset.layout = layout;
    modulesLayout.dataset.layout = layout;

    layoutControls.forEach((input, id) => {
      const active = id === layout;
      input.checked = active;
      if (input.parentElement) {
        input.parentElement.classList.toggle('is-active', active);
      }
    });

    const isFlyout = layout === 'compact-flyout';
    if (isFlyout) {
      moveModulesTo(flyoutBody);
      modulesInline.hidden = true;
      flyoutLauncher.hidden = false;
      const open = !!prefs.moduleFlyoutOpen;
      if (open) {
        flyoutOverlay.hidden = false;
        flyoutScrim.hidden = false;
        flyoutLauncher.setAttribute('aria-expanded', 'true');
        if (releaseFlyoutInert) {
          releaseFlyoutInert();
        }
        releaseFlyoutInert = applyInertToSiblings(flyoutOverlay, { exclusions: [flyoutOverlay, flyoutScrim] });
        if (!flyoutOverlay.contains(document.activeElement)) {
          lastFlyoutFocus = document.activeElement instanceof HTMLElement ? document.activeElement : flyoutLauncher;
          const focusables = collectFocusable(flyoutOverlay);
          const target = focusables[0] || flyoutClose;
          if (target && typeof target.focus === 'function') {
            requestAnimationFrame(() => {
              try {
                target.focus({ preventScroll: true });
              } catch (error) {
                target.focus();
              }
            });
          }
        }
      } else {
        flyoutOverlay.hidden = true;
        flyoutScrim.hidden = true;
        flyoutLauncher.setAttribute('aria-expanded', 'false');
        if (releaseFlyoutInert) {
          releaseFlyoutInert();
          releaseFlyoutInert = null;
        }
        const returnTarget = lastFlyoutFocus instanceof HTMLElement ? lastFlyoutFocus : flyoutLauncher;
        lastFlyoutFocus = null;
        if (returnTarget && typeof returnTarget.focus === 'function') {
          requestAnimationFrame(() => {
            try {
              returnTarget.focus({ preventScroll: true });
            } catch (error) {
              returnTarget.focus();
            }
          });
        }
      }
    } else {
      moveModulesTo(modulesInline);
      modulesInline.hidden = false;
      flyoutLauncher.hidden = true;
      flyoutOverlay.hidden = true;
      flyoutScrim.hidden = true;
      flyoutLauncher.setAttribute('aria-expanded', 'false');
      if (releaseFlyoutInert) {
        releaseFlyoutInert();
        releaseFlyoutInert = null;
      }
      if (prefs.moduleFlyoutOpen) {
        state.set('ui.moduleFlyoutOpen', false);
      }
    }
  }

  function getBuilderPrefs() {
    const prefs = state.get('ui.collections.builder') || {};
    const drafts = prefs.drafts && typeof prefs.drafts === 'object' ? prefs.drafts : {};
    return {
      activeCollectionId: prefs.activeCollectionId || '',
      drafts
    };
  }

  function saveBuilderPrefs(updates = {}) {
    const current = getBuilderPrefs();
    const next = {
      activeCollectionId: updates.activeCollectionId !== undefined ? updates.activeCollectionId : current.activeCollectionId,
      drafts: updates.drafts !== undefined ? updates.drafts : current.drafts
    };
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      state.set('ui.collections.builder', next);
    }
    return next;
  }

  function ensureBuilderActiveId(preferredId) {
    const prefs = getBuilderPrefs();
    const drafts = prefs.drafts || {};
    if (preferredId && (collectionById.has(preferredId) || drafts[preferredId])) {
      return preferredId;
    }
    if (builderState.activeId && (collectionById.has(builderState.activeId) || drafts[builderState.activeId])) {
      return builderState.activeId;
    }
    if (prefs.activeCollectionId && (collectionById.has(prefs.activeCollectionId) || drafts[prefs.activeCollectionId])) {
      return prefs.activeCollectionId;
    }
    if (collectionDefinitions.length) {
      return collectionDefinitions[0].id;
    }
    const draftKeys = Object.keys(drafts);
    if (draftKeys.length) {
      return draftKeys[0];
    }
    return '';
  }

  function loadBuilderState(collectionId) {
    const prefs = getBuilderPrefs();
    const id = ensureBuilderActiveId(collectionId);
    builderState.activeId = id;
    if (!id) {
      builderState.workingModules = [];
      builderState.label = '';
      builderState.description = '';
      saveBuilderPrefs({ activeCollectionId: '' });
      return;
    }
    const drafts = prefs.drafts || {};
    const draft = drafts[id];
    const definition = collectionById.get(id);
    const modules = Array.isArray(draft?.modules) ? draft.modules : (definition?.modules || []);
    builderState.workingModules = Array.from(new Set(modules.filter(Boolean)));
    builderState.label = typeof draft?.label === 'string' && draft.label ? draft.label : (definition?.label || id);
    builderState.description = typeof draft?.description === 'string' ? draft.description : (definition?.description || '');
    if (prefs.activeCollectionId !== id) {
      saveBuilderPrefs({ activeCollectionId: id, drafts });
    }
  }

  function storeBuilderDraft() {
    if (!builderState.activeId) return;
    const prefs = getBuilderPrefs();
    const drafts = { ...prefs.drafts };
    drafts[builderState.activeId] = {
      modules: builderState.workingModules.slice(),
      label: builderState.label,
      description: builderState.description
    };
    saveBuilderPrefs({ activeCollectionId: builderState.activeId, drafts });
  }

  function deleteBuilderDraft(id) {
    const prefs = getBuilderPrefs();
    const drafts = { ...prefs.drafts };
    if (drafts[id]) {
      delete drafts[id];
      saveBuilderPrefs({ activeCollectionId: prefs.activeCollectionId === id ? '' : prefs.activeCollectionId, drafts });
    }
  }

  function getModuleLabel(moduleId) {
    const blockId = moduleToBlockIds.get(moduleId)?.[0];
    const block = blockId ? blockInfo.get(blockId) : null;
    const manifest = manifestByModuleId.get(moduleId);
    if (block?.title) return block.title;
    if (manifest?.name) return manifest.name;
    const catalogEntry = moduleCatalog.find((entry) => entry.id === moduleId);
    if (catalogEntry?.manifest?.name) return catalogEntry.manifest.name;
    return moduleId;
  }

  function getModuleDescription(moduleId) {
    const manifest = manifestByModuleId.get(moduleId);
    if (manifest?.summary) return manifest.summary;
    if (manifest?.description) return manifest.description;
    const catalogEntry = moduleCatalog.find((entry) => entry.id === moduleId);
    if (catalogEntry?.manifest?.description) return catalogEntry.manifest.description;
    return '';
  }

  function computeBuilderOptions() {
    const prefs = getBuilderPrefs();
    const drafts = prefs.drafts || {};
    const options = [];
    const seen = new Set();
    collectionDefinitions.forEach((definition) => {
      options.push({
        id: definition.id,
        label: definition.label || definition.id,
        description: definition.description || ''
      });
      seen.add(definition.id);
    });
    Object.entries(drafts).forEach(([id, draft]) => {
      if (seen.has(id)) return;
      options.push({
        id,
        label: draft?.label || id,
        description: draft?.description || ''
      });
      seen.add(id);
    });
    return options;
  }

  function addModuleToSelection(moduleId, beforeId = null) {
    if (!moduleId) return;
    const modules = builderState.workingModules.filter((id) => id !== moduleId);
    let insertIndex = modules.length;
    if (beforeId) {
      const index = modules.indexOf(beforeId);
      if (index !== -1) {
        insertIndex = index;
      }
    }
    modules.splice(insertIndex, 0, moduleId);
    builderState.workingModules = modules;
    storeBuilderDraft();
    renderBuilder();
  }

  function removeModuleFromSelection(moduleId) {
    if (!moduleId) return;
    const modules = builderState.workingModules.filter((id) => id !== moduleId);
    builderState.workingModules = modules;
    storeBuilderDraft();
    renderBuilder();
  }

  function moveModuleInSelection(moduleId, offset) {
    if (!moduleId || !offset) return;
    const modules = builderState.workingModules.slice();
    const index = modules.indexOf(moduleId);
    if (index === -1) return;
    const target = Math.max(0, Math.min(modules.length - 1, index + offset));
    if (target === index) return;
    modules.splice(index, 1);
    modules.splice(target, 0, moduleId);
    builderState.workingModules = modules;
    storeBuilderDraft();
    renderBuilder();
  }

  function handleBuilderCatalogClick(event) {
    const button = event.target.closest('[data-builder-action]');
    if (!button) return;
    const moduleId = button.dataset.builderModule;
    if (!moduleId) return;
    if (button.dataset.builderAction === 'add') {
      addModuleToSelection(moduleId);
    }
  }

  function handleBuilderSelectionClick(event) {
    const button = event.target.closest('[data-builder-action]');
    if (!button) return;
    const moduleId = button.dataset.builderModule;
    if (!moduleId) return;
    const action = button.dataset.builderAction;
    if (action === 'remove') {
      removeModuleFromSelection(moduleId);
    } else if (action === 'up') {
      moveModuleInSelection(moduleId, -1);
    } else if (action === 'down') {
      moveModuleInSelection(moduleId, 1);
    }
  }

  function handleBuilderDragStart(event) {
    const item = event.target.closest('[data-builder-module]');
    if (!item) return;
    const list = item.closest('[data-builder-list]');
    if (!list) return;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.dataset.builderModule);
    }
    builderDragState = {
      moduleId: item.dataset.builderModule,
      source: list.dataset.builderList
    };
    item.classList.add('is-dragging');
  }

  function clearBuilderDropIndicators() {
    if (!builderElements.selectionList) return;
    builderElements.selectionList.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
    if (builderElements.catalogList) {
      builderElements.catalogList.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
    }
  }

  function handleBuilderDragEnd(event) {
    const item = event.target.closest('[data-builder-module]');
    if (item) {
      item.classList.remove('is-dragging');
    }
    builderDragState = null;
    clearBuilderDropIndicators();
  }

  function handleBuilderDragOver(event) {
    event.preventDefault();
    const list = event.currentTarget;
    if (!list || !list.dataset.builderList) return;
    const items = Array.from(list.querySelectorAll('[data-builder-module]'));
    const after = items.find((item) => {
      const rect = item.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    clearBuilderDropIndicators();
    if (after) {
      after.classList.add('is-drop-target');
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleBuilderDragLeave() {
    clearBuilderDropIndicators();
  }

  function handleBuilderDrop(event) {
    event.preventDefault();
    const list = event.currentTarget;
    if (!list || !list.dataset.builderList) return;
    const moduleId = event.dataTransfer?.getData('text/plain') || builderDragState?.moduleId;
    clearBuilderDropIndicators();
    if (!moduleId) return;
    if (list.dataset.builderList === 'selection') {
      const target = list.querySelector('.is-drop-target');
      const beforeId = target?.dataset.builderModule || null;
      addModuleToSelection(moduleId, beforeId);
    } else if (list.dataset.builderList === 'catalog') {
      removeModuleFromSelection(moduleId);
    }
  }

  function renderBuilderPreview() {
    if (!builderElements.previewList) return;
    builderElements.previewList.innerHTML = '';
    if (!builderState.workingModules.length) {
      const empty = document.createElement('li');
      empty.className = 'a11ytb-builder-preview-empty';
      empty.textContent = 'Aucun module sélectionné pour cette collection.';
      builderElements.previewList.append(empty);
      return;
    }
    builderState.workingModules.forEach((moduleId, index) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-builder-preview-item';
      item.textContent = `${index + 1}. ${getModuleLabel(moduleId)}`;
      const blockId = moduleToBlockIds.get(moduleId)?.[0];
      const block = blockId ? blockInfo.get(blockId) : null;
      if (block?.category) {
        const badge = document.createElement('span');
        badge.className = 'a11ytb-builder-preview-tag';
        badge.textContent = categories.find((cat) => cat.id === block.category)?.label || block.category;
        item.append(badge);
      }
      builderElements.previewList.append(item);
    });
  }

  function renderBuilderLists() {
    if (!builderElements.catalogList || !builderElements.selectionList) return;
    builderElements.catalogList.innerHTML = '';
    builderElements.selectionList.innerHTML = '';
    const selectionSet = new Set(builderState.workingModules);
    const knownModules = new Set([
      ...catalogModuleIds,
      ...Array.from(selectionSet),
      ...collectionDefinitions.flatMap((definition) => definition.modules || [])
    ]);
    const available = Array.from(knownModules)
      .filter((moduleId) => !selectionSet.has(moduleId))
      .sort((a, b) => getModuleLabel(a).localeCompare(getModuleLabel(b)));

    available.forEach((moduleId) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-builder-item';
      item.draggable = true;
      item.dataset.builderModule = moduleId;
      const title = document.createElement('div');
      title.className = 'a11ytb-builder-item-title';
      title.textContent = getModuleLabel(moduleId);
      const description = getModuleDescription(moduleId);
      if (description) {
        const detail = document.createElement('p');
        detail.className = 'a11ytb-builder-item-description';
        detail.textContent = description;
        item.append(title, detail);
      } else {
        item.append(title);
      }
      const actions = document.createElement('div');
      actions.className = 'a11ytb-builder-item-actions';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'a11ytb-builder-mini';
      addBtn.dataset.builderAction = 'add';
      addBtn.dataset.builderModule = moduleId;
      addBtn.textContent = 'Ajouter';
      actions.append(addBtn);
      item.append(actions);
      item.addEventListener('dragstart', handleBuilderDragStart);
      item.addEventListener('dragend', handleBuilderDragEnd);
      builderElements.catalogList.append(item);
    });

    builderState.workingModules.forEach((moduleId) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-builder-item';
      item.draggable = true;
      item.dataset.builderModule = moduleId;
      const head = document.createElement('div');
      head.className = 'a11ytb-builder-item-title';
      head.textContent = getModuleLabel(moduleId);
      item.append(head);
      const actions = document.createElement('div');
      actions.className = 'a11ytb-builder-item-actions';
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'a11ytb-builder-mini';
      upBtn.dataset.builderAction = 'up';
      upBtn.dataset.builderModule = moduleId;
      upBtn.setAttribute('aria-label', `Monter ${getModuleLabel(moduleId)}`);
      upBtn.textContent = '↑';
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'a11ytb-builder-mini';
      downBtn.dataset.builderAction = 'down';
      downBtn.dataset.builderModule = moduleId;
      downBtn.setAttribute('aria-label', `Descendre ${getModuleLabel(moduleId)}`);
      downBtn.textContent = '↓';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'a11ytb-builder-mini';
      removeBtn.dataset.builderAction = 'remove';
      removeBtn.dataset.builderModule = moduleId;
      removeBtn.textContent = 'Retirer';
      actions.append(upBtn, downBtn, removeBtn);
      item.append(actions);
      item.addEventListener('dragstart', handleBuilderDragStart);
      item.addEventListener('dragend', handleBuilderDragEnd);
      builderElements.selectionList.append(item);
    });

    renderBuilderPreview();
  }

  function renderBuilder() {
    if (!builderElements.section || !builderElements.catalogList || !builderElements.selectionList || !builderElements.previewList) {
      return;
    }
    const options = computeBuilderOptions();
    const hasOptions = options.length > 0;
    builderElements.emptyNotice.hidden = hasOptions;
    builderElements.helper.hidden = !hasOptions;
    builderElements.select.innerHTML = '';
    if (!hasOptions) {
      builderElements.select.disabled = true;
      builderElements.labelInput.value = '';
      builderElements.descriptionInput.value = '';
      builderElements.labelInput.disabled = true;
      builderElements.descriptionInput.disabled = true;
      builderElements.saveButton.disabled = true;
      builderElements.resetButton.disabled = true;
      builderElements.catalogList.innerHTML = '';
      builderElements.selectionList.innerHTML = '';
      builderElements.previewList.innerHTML = '';
      return;
    }
    builderElements.select.disabled = false;
    builderElements.labelInput.disabled = false;
    builderElements.descriptionInput.disabled = false;
    builderElements.saveButton.disabled = false;
    builderElements.resetButton.disabled = false;
    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = option.label;
      builderElements.select.append(opt);
    });
    if (!builderState.activeId || !options.some((option) => option.id === builderState.activeId)) {
      loadBuilderState(options[0].id);
    }
    builderElements.select.value = builderState.activeId;
    builderElements.labelInput.value = builderState.label;
    builderElements.descriptionInput.value = builderState.description;
    renderBuilderLists();
  }

  function rebuildCollectionsPanel() {
    if (!collectionsPanel || !collectionsListRoot) return;
    collectionsListRoot.innerHTML = '';
    collectionButtons.clear();
    if (!collectionDefinitions.length) {
      const empty = document.createElement('p');
      empty.className = 'a11ytb-admin-help';
      empty.textContent = 'Aucune collection n’est encore configurée.';
      collectionsListRoot.append(empty);
      return;
    }

    collectionDefinitions.forEach((collection) => {
      const card = document.createElement('article');
      card.className = 'a11ytb-config-card a11ytb-collection-card';
      card.dataset.collectionId = collection.id;
      card.dataset.depth = String(collection.depth || 0);
      if ((collection.depth || 0) > 0) {
        card.style.marginInlineStart = `${(collection.depth || 0) * 1.25}rem`;
      } else {
        card.style.marginInlineStart = '';
      }

      const title = document.createElement('h4');
      title.className = 'a11ytb-config-title';
      const indentPrefix = collection.depth > 0 ? `${' '.repeat(collection.depth * 2)}⤷ ` : '';
      const visibleLabel = collection.label || collection.id;
      title.textContent = `${indentPrefix}${visibleLabel}`;
      const accessibleTitle = collection.pathLabel || visibleLabel;
      title.setAttribute('aria-label', accessibleTitle);
      card.append(title);

      if (collection.description) {
        const description = document.createElement('p');
        description.className = 'a11ytb-config-description';
        description.textContent = collection.description;
        card.append(description);
      }

      const members = document.createElement('ul');
      members.className = 'a11ytb-collection-members';
      const moduleLabels = (collection.modules || []).map((moduleId) => getModuleLabel(moduleId)).filter(Boolean);
      if (moduleLabels.length) {
        moduleLabels.forEach((label) => {
          const li = document.createElement('li');
          li.textContent = label;
          members.append(li);
        });
      } else {
        const emptyMember = document.createElement('li');
        emptyMember.textContent = 'Aucun module associé';
        members.append(emptyMember);
      }
      card.append(members);

      const controls = document.createElement('div');
      controls.className = 'a11ytb-collection-actions';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'a11ytb-button a11ytb-collection-toggle';
      toggle.dataset.collectionId = collection.id;
      toggle.dataset.collectionLabel = collection.label || collection.id;
      toggle.dataset.collectionPath = collection.pathLabel || collection.label || collection.id;
      if (collection.parentId) {
        toggle.dataset.parentId = collection.parentId;
      } else {
        delete toggle.dataset.parentId;
      }
      toggle.setAttribute('aria-pressed', 'true');
      toggle.textContent = `Désactiver ${collection.label || collection.id}`;
      toggle.addEventListener('click', () => {
        const prefs = getPreferences();
        const disabledList = Array.isArray(prefs.collections?.disabled) ? prefs.collections.disabled : [];
        const disabledSet = new Set(disabledList);
        const isCurrentlyDisabled = disabledSet.has(collection.id);
        if (isCurrentlyDisabled) {
          disabledSet.delete(collection.id);
        } else {
          disabledSet.add(collection.id);
        }
        const next = Array.from(disabledSet);
        if (!arraysEqual(next, disabledList)) {
          setListIfChanged('ui.collections.disabled', next, disabledList);
          markProfileAsCustom();
          const actionLabel = isCurrentlyDisabled ? 'Collection activée' : 'Collection désactivée';
          const collectionDisplay = collection.pathLabel || collection.label || collection.id;
          logActivity(`${actionLabel} : ${collectionDisplay}`, {
            tone: isCurrentlyDisabled ? 'confirm' : 'toggle',
            tags: ['organisation']
          });
          const modulesText = moduleLabels.length ? ` Modules concernés : ${moduleLabels.join(', ')}.` : '';
          announceOrganize(`${actionLabel} : ${collectionDisplay}.${modulesText}`.trim());
        }
      });
      controls.append(toggle);
      collectionButtons.set(collection.id, toggle);
      card.append(controls);

      collectionsListRoot.append(card);
    });
  }

  function persistBuilderCollection() {
    if (!builderState.activeId) return;
    const presets = state.get('ui.collections.presets') || {};
    const next = { ...presets };
    next[builderState.activeId] = {
      modules: builderState.workingModules.slice(),
      label: builderState.label,
      description: builderState.description
    };
    state.set('ui.collections.presets', next);
    logActivity(`Collection enregistrée : ${builderState.label}`, { tone: 'confirm', tags: ['collections'] });
    deleteBuilderDraft(builderState.activeId);
    loadBuilderState(builderState.activeId);
    renderBuilder();
  }

  function resetBuilderCollection() {
    if (!builderState.activeId) return;
    const presets = state.get('ui.collections.presets') || {};
    const next = { ...presets };
    let changed = false;
    if (next[builderState.activeId]) {
      delete next[builderState.activeId];
      changed = true;
    }
    deleteBuilderDraft(builderState.activeId);
    if (changed) {
      state.set('ui.collections.presets', next);
      logActivity(`Collection réinitialisée : ${builderState.label}`, { tone: 'info', tags: ['collections'] });
    } else {
      loadBuilderState(builderState.activeId);
      renderBuilder();
    }
  }

  function createNewBuilderCollection() {
    const baseLabel = 'Nouvelle collection';
    const baseId = slugifyProfileId(baseLabel) || 'collection';
    const prefs = getBuilderPrefs();
    const taken = new Set([
      ...collectionDefinitions.map((definition) => definition.id),
      ...Object.keys(prefs.drafts || {})
    ]);
    let candidate = baseId;
    let counter = 1;
    while (taken.has(candidate)) {
      counter += 1;
      candidate = `${baseId}-${counter}`;
    }
    const drafts = { ...prefs.drafts };
    drafts[candidate] = {
      modules: [],
      label: counter === 1 ? baseLabel : `${baseLabel} ${counter}`,
      description: ''
    };
    saveBuilderPrefs({ activeCollectionId: candidate, drafts });
    loadBuilderState(candidate);
    renderBuilder();
    if (builderElements.labelInput) {
      requestAnimationFrame(() => {
        try {
          builderElements.labelInput.focus({ preventScroll: true });
        } catch (error) {
          builderElements.labelInput.focus();
        }
      });
    }
    announceOrganize('Nouvelle collection préparée. Renseignez le nom puis ajoutez des modules.');
  }

  function moveFocusOutOfModule(moduleElement) {
    if (!moduleElement) return;
    const active = document.activeElement;
    if (!active || !moduleElement.contains(active)) return;
    const focusables = getFocusableElements()
      .filter((el) => el !== active && !moduleElement.contains(el));
    const fallback = focusables[0];
    if (fallback && typeof fallback.focus === 'function') {
      fallback.focus();
    } else if (panel && typeof panel.focus === 'function') {
      panel.focus();
    }
  }

  function applyModuleLayout() {
    const prefs = getPreferences();
    const searchTerm = (prefs.search || '').trim().toLowerCase();
    const pinnedSet = new Set(prefs.pinned);
    const hiddenSet = new Set(prefs.hidden);
    const disabledSet = new Set(prefs.disabled);
    const disabledCollectionsSet = new Set(prefs.collections.disabled);
    const disabledByCollection = getBlocksDisabledByCollections(disabledCollectionsSet);
    const categoryCounts = new Map(categories.map((cat) => [cat.id, 0]));

    const validPriorities = {};
    Object.entries(prefs.priorities || {}).forEach(([id, priority]) => {
      if (allowedIds.has(id) && PRIORITY_LOOKUP.has(priority)) {
        validPriorities[id] = priority;
      }
    });
    const hasCustomOrder = prefs.moduleOrder.length > 0;
    const comparator = (a, b) => {
      const diff = getPriorityWeight(validPriorities[a]) - getPriorityWeight(validPriorities[b]);
      if (diff !== 0) return diff;
      return (blockIndex.get(a) ?? 0) - (blockIndex.get(b) ?? 0);
    };

    const baseOrder = hasCustomOrder
      ? prefs.moduleOrder
      : [...blockIds].sort(comparator);
    const orderedPinned = (hasCustomOrder ? prefs.pinned : [...prefs.pinned].sort(comparator))
      .filter(id => moduleElements.has(id));
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
      const priorityId = validPriorities[id] || '';
      const priorityEntry = getPriorityEntry(priorityId);
      if (priorityEntry) {
        el.dataset.priority = priorityEntry.id;
      } else {
        el.removeAttribute('data-priority');
      }
      const badge = el.querySelector('[data-ref="priority-badge"]');
      if (badge) {
        if (priorityEntry) {
          badge.hidden = false;
          badge.dataset.priorityLevel = priorityEntry.id;
          badge.textContent = getPriorityShortLabel(priorityEntry.id) || priorityEntry.label;
          badge.setAttribute('aria-label', `Priorité : ${priorityEntry.label}`);
          badge.title = priorityEntry.description;
        } else {
          badge.hidden = true;
          badge.removeAttribute('data-priority-level');
          badge.removeAttribute('aria-label');
          badge.removeAttribute('title');
        }
      }
      const matchesCategory = prefs.category === 'all' || el.dataset.category === prefs.category;
      const matchesSearch = !searchTerm || keywords.includes(searchTerm);
      const isHidden = hiddenSet.has(id);
      const isDisabledByCollection = disabledByCollection.has(id);
      const isDisabled = disabledSet.has(id) || isDisabledByCollection;
      const shouldShow = matchesCategory && matchesSearch && (!isHidden && !isDisabled || prefs.showHidden);
      const isActiveForCount = !isHidden && !isDisabled;
      if (isActiveForCount) {
        const targetCategory = categories.some((cat) => cat.id === el.dataset.category)
          ? el.dataset.category
          : null;
        if (targetCategory && categoryCounts.has(targetCategory)) {
          categoryCounts.set(targetCategory, categoryCounts.get(targetCategory) + 1);
        }
        if (categoryCounts.has('all')) {
          categoryCounts.set('all', categoryCounts.get('all') + 1);
        }
      }
      if (shouldShow) {
        el.removeAttribute('hidden');
        el.setAttribute('aria-hidden', 'false');
      } else {
        moveFocusOutOfModule(el);
        el.setAttribute('hidden', '');
        el.setAttribute('aria-hidden', 'true');
      }
      el.classList.toggle('is-hidden', isHidden);
      el.classList.toggle('is-disabled', isDisabled);
      el.classList.toggle('is-disabled-by-collection', isDisabledByCollection);
      el.dataset.disabled = String(isDisabled);
      if (isDisabledByCollection) {
        el.dataset.disabledCollection = 'true';
      } else {
        delete el.dataset.disabledCollection;
      }
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
          const reason = isDisabledByCollection ? 'Module désactivé par collection' : 'Module désactivé';
          const message = overlay.querySelector('.a11ytb-module-overlay-inner span:last-child');
          if (message) {
            message.textContent = reason;
          }
        } else {
          overlay.hidden = true;
        }
      }
      if (content) {
        content.setAttribute('aria-hidden', String(isDisabled));
      }
    });

    categoryCountRefs.forEach((node, categoryId) => {
      if (!node) return;
      const value = categoryCounts.get(categoryId) ?? 0;
      node.textContent = String(value);
      const button = categoryButtons.get(categoryId);
      if (button) {
        const labelText = button.querySelector('.a11ytb-category-label')?.textContent || categoryId;
        button.setAttribute('aria-label', `${labelText} (${value} modules actifs)`);
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
    const focusedElement = typeof document !== 'undefined' ? document.activeElement : null;
    viewButtons.forEach((btn, id) => {
      const active = id === currentView;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
      if (active) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
    const nextViewElement = viewElements.get(currentView);
    const previousViewElement = activeViewId ? viewElements.get(activeViewId) : null;
    let shouldRefocus = Boolean(
      focusedElement
      && previousViewElement
      && previousViewElement !== nextViewElement
      && previousViewElement.contains(focusedElement)
    );

    viewElements.forEach((element, id) => {
      const isActive = id === currentView;
      if (isActive) {
        element.hidden = false;
        element.style.visibility = 'visible';
        element.removeAttribute('hidden');
        element.setAttribute('aria-hidden', 'false');
      } else {
        element.hidden = true;
        element.style.visibility = 'hidden';
        element.setAttribute('hidden', '');
        element.setAttribute('aria-hidden', 'true');
        if (!shouldRefocus && element && focusedElement && element.contains(focusedElement)) {
          shouldRefocus = true;
        }
      }
    });

    if (shouldRefocus && nextViewElement) {
      requestAnimationFrame(() => {
        const focusables = collectFocusable(nextViewElement);
        const target = focusables[0] || nextViewElement || panel;
        if (typeof target?.focus === 'function') {
          try {
            target.focus({ preventScroll: true });
          } catch (error) {
            target.focus();
          }
        }
      });
    }
    if (currentView === 'options') {
      if (activeViewId !== 'options') {
        setupOptionsFocusTrap();
      }
    } else if (activeViewId === 'options') {
      teardownOptionsFocusTrap();
    }
    if (currentView === 'organize' && activeViewId !== 'organize') {
      const firstItem = adminList.querySelector('.a11ytb-admin-item');
      if (firstItem && typeof firstItem.focus === 'function') {
        requestAnimationFrame(() => {
          try {
            firstItem.focus({ preventScroll: true });
          } catch (error) {
            firstItem.focus();
          }
        });
      }
    }
    if (currentView === 'guides' && activeViewId !== 'guides') {
      requestAnimationFrame(() => {
        const focusables = collectFocusable(guidesView);
        const target = focusables[0] || guidesView;
        if (typeof target?.focus === 'function') {
          try {
            target.focus({ preventScroll: true });
          } catch (error) {
            target.focus();
          }
        }
      });
    }
    if (currentView === 'shortcuts' && activeViewId !== 'shortcuts') {
      requestAnimationFrame(() => {
        try {
          shortcutsView.focus({ preventScroll: true });
        } catch (error) {
          shortcutsView.focus();
        }
      });
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

      if (profile?.source) {
        const origin = document.createElement('p');
        origin.className = 'a11ytb-profile-origin';
        const sourceProfile = data[profile.source];
        const sourceLabel = sourceProfile?.name || profile.source;
        origin.textContent = `Issu de : ${sourceLabel}`;
        card.append(origin);
      }

      const actions = document.createElement('div');
      actions.className = 'a11ytb-profile-actions';

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'a11ytb-button a11ytb-button--ghost';
      applyBtn.dataset.profileAction = 'apply';
      applyBtn.dataset.profileId = id;
      applyBtn.textContent = id === lastProfile ? 'Réappliquer' : 'Appliquer';
      actions.append(applyBtn);

      const duplicateBtn = document.createElement('button');
      duplicateBtn.type = 'button';
      duplicateBtn.className = 'a11ytb-button a11ytb-button--ghost';
      duplicateBtn.dataset.profileAction = 'duplicate';
      duplicateBtn.dataset.profileId = id;
      duplicateBtn.textContent = 'Dupliquer';
      actions.append(duplicateBtn);

      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'a11ytb-button a11ytb-button--ghost';
      exportBtn.dataset.profileAction = 'export';
      exportBtn.dataset.profileId = id;
      exportBtn.textContent = 'Partager';
      actions.append(exportBtn);

      if (!profile?.preset) {
        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'a11ytb-button a11ytb-button--ghost';
        renameBtn.dataset.profileAction = 'rename';
        renameBtn.dataset.profileId = id;
        renameBtn.textContent = 'Renommer';
        actions.append(renameBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'a11ytb-button a11ytb-button--ghost';
        deleteBtn.dataset.profileAction = 'delete';
        deleteBtn.dataset.profileId = id;
        deleteBtn.textContent = 'Supprimer';
        actions.append(deleteBtn);
      }

      card.append(actions);

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
    renderActivityConnectors();
    updateManualSendAvailability();
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
      if (entry.payload?.type === 'audit-report') {
        const totals = entry.payload.totals || {};
        const detailLine = document.createElement('p');
        detailLine.className = 'a11ytb-activity-detail';
        if (entry.payload.outcome === 'error') {
          detailLine.textContent = entry.payload.error || 'Analyse indisponible.';
        } else {
          const critical = totals.critical || 0;
          const serious = totals.serious || 0;
          const recommendations = (totals.moderate || 0) + (totals.minor || 0);
          const parts = [];
          if (critical > 0) parts.push(`${critical} critique${critical > 1 ? 's' : ''}`);
          if (serious > 0) parts.push(`${serious} majeure${serious > 1 ? 's' : ''}`);
          if (recommendations > 0) parts.push(`${recommendations} recommandation${recommendations > 1 ? 's' : ''}`);
          detailLine.textContent = parts.length ? `Violations : ${parts.join(' • ')}` : 'Aucune violation détectée.';
        }
        li.append(detailLine);

        const inlineActions = document.createElement('div');
        inlineActions.className = 'a11ytb-activity-inline-actions';
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'a11ytb-btn-link';
        openBtn.dataset.action = 'activity-open-audit';
        openBtn.textContent = entry.payload.outcome === 'error' ? 'Réessayer' : 'Voir le rapport';
        inlineActions.append(openBtn);
        li.append(inlineActions);
      }
      activityList.append(li);
    });
  }

  function renderActivityConnectors() {
    if (!activityConnectorsList) return;
    const connectors = activitySync?.connectors || [];
    activityConnectorsList.innerHTML = '';
    if (!connectors.length) {
      const item = document.createElement('li');
      item.className = 'a11ytb-activity-connector a11ytb-activity-connector--empty';
      item.textContent = 'Aucun connecteur configuré pour le moment.';
      activityConnectorsList.append(item);
      return;
    }
    connectors.forEach((connector) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-activity-connector';

      const title = document.createElement('div');
      title.className = 'a11ytb-activity-connector-title';
      title.textContent = connector.label;

      const status = document.createElement('span');
      status.className = `a11ytb-activity-connector-status ${connector.enabled ? 'a11ytb-activity-connector-status--enabled' : 'a11ytb-activity-connector-status--disabled'}`;
      status.textContent = connector.enabled ? 'Actif' : (connector.status || 'Inactif');
      status.setAttribute('aria-label', `Statut connecteur ${connector.label} : ${status.textContent}`);

      const help = document.createElement('p');
      help.className = 'a11ytb-activity-connector-help';
      help.textContent = connector.help;

      item.append(title, status, help);

      if (Array.isArray(connector.fields) && connector.fields.length) {
        const dl = document.createElement('dl');
        dl.className = 'a11ytb-activity-connector-fields';
        connector.fields.forEach((field) => {
          const term = document.createElement('dt');
          term.textContent = field.label;
          const desc = document.createElement('dd');
          desc.textContent = field.description || '';
          dl.append(term, desc);
        });
        item.append(dl);
      }

      activityConnectorsList.append(item);
    });
  }

  function updateManualSendAvailability() {
    if (!sendSyncBtn) return;
    const hasConnectors = activitySync?.hasConnectors === true;
    sendSyncBtn.disabled = !hasConnectors;
    if (!hasConnectors) {
      sendSyncBtn.title = 'Ajoutez un connecteur dans l’admin pour activer les synchronisations.';
    } else {
      sendSyncBtn.removeAttribute('title');
    }
  }

  function pushCollaborationItem(path, value, limit = 20) {
    const existing = state.get(path);
    const list = Array.isArray(existing) ? existing.slice() : [];
    list.unshift(value);
    const trimmed = list.slice(0, limit);
    state.set(path, trimmed);
  }

  function recordSyncTimeline(event) {
    if (!event) return;
    pushCollaborationItem('collaboration.syncs', {
      ...event,
      timestamp: Date.now()
    });
  }

  function recordExportTimeline(event) {
    if (!event) return;
    pushCollaborationItem('collaboration.exports', {
      ...event,
      timestamp: Date.now()
    });
  }

  function appendIntegrationFeedback(message, options = {}) {
    if (!message) return;
    const tags = Array.isArray(options.tags) ? options.tags.filter(Boolean) : [];
    const uniqueTags = Array.from(new Set(['sync', ...tags]));
    logActivity(message, {
      tone: options.tone || 'info',
      module: 'activity',
      tags: uniqueTags,
      payload: options.payload ?? null,
      skipSync: true
    });
  }

  function triggerManualSyncSend() {
    if (!activitySync) {
      appendIntegrationFeedback('Aucun connecteur de synchronisation configuré.', { tone: 'warning' });
      return;
    }
    const entries = getActivityEntries();
    activitySync.triggerManualSend(entries);
  }

  function logActivity(message, options = {}) {
    if (!message) return;
    const skipSync = options.skipSync === true;
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
      tags,
      payload: options.payload || null
    };
    const next = [entry, ...current].slice(0, 50);
    state.set('ui.activity', next);
    const audioEventsState = state.get('audio.events');
    const hasEventsObject = audioEventsState && typeof audioEventsState === 'object';
    const normalizedEvents = normalizeAudioEvents(hasEventsObject ? audioEventsState : undefined);
    const severityConfig = severity ? normalizedEvents[severity] : undefined;
    const explicitEntry = hasEventsObject && severity ? audioEventsState[severity] : undefined;

    let shouldPlayEarcon = false;
    let presetToPlay = null;

    if (severity && severityConfig) {
      const enabled = severityConfig.enabled !== false;
      if (explicitEntry !== undefined) {
        shouldPlayEarcon = enabled;
        presetToPlay = severityConfig.sound || tone || null;
      } else if (tone) {
        shouldPlayEarcon = enabled;
        presetToPlay = tone;
      } else if (enabled && severityConfig.sound) {
        shouldPlayEarcon = true;
        presetToPlay = severityConfig.sound;
      }
    } else if (tone) {
      shouldPlayEarcon = true;
      presetToPlay = tone;
    }

    if (!skipSync) {
      activitySync?.enqueueEntry(entry);
    }

    if (shouldPlayEarcon && typeof presetToPlay === 'string' && presetToPlay) {
      window.a11ytb?.feedback?.play(presetToPlay);
    } else if (!hasEventsObject && tone) {
      window.a11ytb?.feedback?.play(tone);
    }
    return entry;
  }

  activitySync = createActivityIntegration({
    config: activityIntegrationConfig,
    fetchFn,
    notify: appendIntegrationFeedback,
    onSyncEvent: recordSyncTimeline
  });
  renderActivityConnectors();
  updateManualSendAvailability();


  function serializeActivityToJSON(entries) {
    return JSON.stringify(entries.map(entry => ({
      id: entry.id,
      message: entry.message,
      timestamp: entry.timestamp,
      module: entry.module,
      severity: entry.severity,
      tone: entry.tone,
      tags: entry.tags,
      payload: entry.payload || null
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
    const header = ['timestamp', 'message', 'module', 'severity', 'tone', 'tags', 'payload'];
    const rows = entries.map(entry => [
      new Date(entry.timestamp || Date.now()).toISOString(),
      entry.message,
      entry.module || '',
      entry.severity || '',
      entry.tone || '',
      Array.isArray(entry.tags) ? entry.tags.join('|') : '',
      entry.payload ? JSON.stringify(entry.payload) : ''
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
  let releaseOutsideInert = null;

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

  function syncFullscreenMode(snapshot) {
    const fullscreen = !!snapshot?.ui?.fullscreen;
    panel.dataset.fullscreen = String(fullscreen);
    if (fullscreenToggle) {
      fullscreenToggle.setAttribute('aria-pressed', String(fullscreen));
      fullscreenToggle.classList.toggle('is-active', fullscreen);
      if (fullscreenLabel) {
        fullscreenLabel.textContent = fullscreen ? 'Vue compacte' : 'Plein écran';
      }
      if (fullscreenIcon) {
        fullscreenIcon.innerHTML = fullscreen ? fullscreenIcons.collapse : fullscreenIcons.expand;
      }
      fullscreenToggle.setAttribute('title', fullscreen ? 'Revenir à la vue compacte' : 'Agrandir la boîte à outils');
    }
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
      if (typeof releaseOutsideInert === 'function') {
        releaseOutsideInert();
      }
      releaseOutsideInert = applyInertToSiblings(root);
      lastFocusedElement = document.activeElement;
      const focusables = getFocusableElements();
      (focusables[0] || panel).focus();
      if (state.get('ui.view') === 'options' && !releaseOptionsFocusTrap) {
        setupOptionsFocusTrap();
      }
    } else {
      if (typeof releaseOutsideInert === 'function') {
        releaseOutsideInert();
        releaseOutsideInert = null;
      }
      if (activeViewId === 'options') {
        teardownOptionsFocusTrap();
      }
      stopShortcutRecording();
      const target = (lastFocusedElement && typeof lastFocusedElement.focus === 'function') ? lastFocusedElement : fab;
      target.focus();
      lastFocusedElement = null;
    }
  }

  if (behaviorConfig.autoOpen === true) {
    let shouldAutoOpen = true;
    try {
      if (sessionStorage.getItem(AUTO_OPEN_STORAGE_KEY) === 'yes') {
        shouldAutoOpen = false;
      } else {
        sessionStorage.setItem(AUTO_OPEN_STORAGE_KEY, 'yes');
      }
    } catch (error) {
      // Navigateur privé ou quotas atteints : on tente tout de même une ouverture.
    }

    if (shouldAutoOpen && panel.dataset.open !== 'true') {
      window.setTimeout(() => toggle(true), 120);
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
  if (fullscreenToggle) {
    fullscreenToggle.addEventListener('click', () => {
      const nextValue = !state.get('ui.fullscreen');
      state.set('ui.fullscreen', nextValue);
    });
  }

  function executeShortcut(actionId) {
    const definition = CUSTOM_SHORTCUT_LOOKUP.get(actionId);
    if (!definition) return;
    if (actionId === 'toggle-panel') {
      toggle();
      return;
    }
    const targetView = definition.view;
    if (!targetView) return;
    if (panel.dataset.open !== 'true') {
      toggle(true);
    }
    state.set('ui.view', targetView);
  }

  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (recordingShortcutId) return;
    const active = document.activeElement;
    if (active && typeof active.closest === 'function') {
      const isEditable = active.closest('input, textarea, select, [contenteditable="true"]');
      if (isEditable && !event.altKey && !event.ctrlKey && !event.metaKey) {
        return;
      }
    }
    let handled = false;
    activeShortcutCombos.forEach((entry, actionId) => {
      if (handled) return;
      if (eventMatchesShortcut(event, entry.parsed)) {
        event.preventDefault();
        executeShortcut(actionId);
        handled = true;
      }
    });
  });

  overlay.addEventListener('click', () => toggle(false));

  profilesList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-profile-action]');
    if (!button) return;
    const action = button.dataset.profileAction;
    const profileId = button.dataset.profileId;
    if (!profileId) return;
    if (action === 'apply') {
      applyProfile(profileId);
    } else if (action === 'duplicate') {
      await duplicateProfile(profileId);
    } else if (action === 'export') {
      await exportProfile(profileId);
    } else if (action === 'rename') {
      await renameProfile(profileId);
    } else if (action === 'delete') {
      await deleteProfile(profileId);
    }
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
        recordExportTimeline({ format: 'json', mode: 'clipboard', status: 'success', count: entries.length });
      } else {
        downloadText('a11ytb-activity.json', payload, 'application/json');
        logActivity('Journal téléchargé (JSON)', { tone: 'warning', module: 'activity', tags: ['export', 'json'] });
        recordExportTimeline({ format: 'json', mode: 'download', status: 'success', count: entries.length });
      }
    } else if (action.dataset.action === 'activity-export-csv') {
      const entries = getActivityEntries();
      if (!entries.length) return;
      const payload = serializeActivityToCSV(entries);
      downloadText('a11ytb-activity.csv', payload, 'text/csv');
      logActivity('Journal exporté (CSV)', { tone: 'confirm', module: 'activity', tags: ['export', 'csv'] });
      recordExportTimeline({ format: 'csv', mode: 'download', status: 'success', count: entries.length });
    } else if (action.dataset.action === 'activity-send-sync') {
      triggerManualSyncSend();
    } else if (action.dataset.action === 'activity-open-audit') {
      toggle(true);
      state.set('ui.view', 'modules');
      focusModuleCard('audit');
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

  Object.defineProperty(window, 'sttStatus', {
    configurable: true,
    get() { return state.get('stt.status'); }
  });
  Object.defineProperty(window, 'brailleOut', {
    configurable: true,
    get() { return state.get('braille.output'); }
  });

  state.on((snapshot) => {
    syncCollectionStructures(snapshot);
    syncFilters();
    syncModuleLayoutPreference(snapshot);
    renderBuilder();
    syncAdminList();
    syncCollectionPanel();
    applyModuleLayout();
    updateActivityLog();
    refreshDependencyViews(snapshot);
    syncView();
    syncFullscreenMode(snapshot);
    renderProfiles(snapshot);
    updateActiveShortcuts(snapshot);
    refreshShortcutDisplays(snapshot);
    footerTitle.textContent = buildShortcutSummary(snapshot);
    syncDependencyViews(snapshot);
    optionBindings.forEach((binding) => binding(snapshot));
  });

  const initialSnapshot = state.get();
  syncFilters();
  syncModuleLayoutPreference(initialSnapshot);
  syncCollectionStructures(initialSnapshot);
  renderBuilder();
  syncAdminList();
  syncCollectionPanel();
  applyModuleLayout();
  updateActivityLog();
  refreshDependencyViews(initialSnapshot);
  syncView();
  syncFullscreenMode(initialSnapshot);
  renderProfiles(initialSnapshot);
  updateActiveShortcuts(initialSnapshot);
  refreshShortcutDisplays(initialSnapshot);
  footerTitle.textContent = buildShortcutSummary(initialSnapshot);
  syncDependencyViews(initialSnapshot);
  optionBindings.forEach((binding) => binding(initialSnapshot));
}
