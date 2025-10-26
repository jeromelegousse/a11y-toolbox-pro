import { createStore, cloneValue } from './store.js';
import { mountUI } from './ui.js';
import { registerBlock, registerModuleManifest } from './registry.js';
import { createFeedback } from './feedback.js';
import { manifest as audioManifest } from './modules/audio.manifest.js';
import { mergeManifestDefaults } from './module-manifest.js';
import { moduleCatalog } from './module-catalog.js';
import { setupModuleRuntime } from './module-runtime.js';
import { createMetricsSyncService } from './status-center.js';
import { moduleCollections } from './module-collections.js';
import { setupAudioFeedback } from './audio-feedback.js';
import {
  buildAuditStatusText,
  renderAuditStats,
  renderAuditViolations,
} from './modules/audit-view.js';
import { resolveLocale } from '../languages/index.js';
import { createI18nService } from './i18n-service.js';
import { createNotificationCenter } from './notifications.js';
import { createPreferenceSync } from './integrations/preferences.js';
import { attachModuleTriggers } from './integrations/inline-triggers.js';
import { escapeAttr } from './utils/dom.js';

const profilePresets = {
  'vision-basse': {
    name: 'Vision basse',
    summary: 'Renforce le contraste et augmente les espacements pour limiter la fatigue visuelle.',
    description:
      'Active le thème à fort contraste, agrandit l’interlignage et ralentit légèrement la lecture vocale.',
    tags: ['Vision', 'Lecture'],
    tone: 'confirm',
    activity: 'Profil Vision basse appliqué',
    preset: true,
    createdAt: 0,
    settings: {
      'contrast.enabled': true,
      'spacing.lineHeight': 1.9,
      'spacing.letterSpacing': 0.08,
      'tts.rate': 0.9,
      'tts.pitch': 0.9,
      'tts.volume': 1,
      'audio.theme': 'digital',
      'audio.volume': 1,
      'audio.events.alert.sound': 'alert',
      'audio.events.warning.sound': 'warning',
      'audio.events.success.sound': 'success',
      'audio.events.info.sound': 'toggle',
    },
  },
  dyslexie: {
    name: 'Confort dyslexie',
    summary: 'Espacements accentués et rythme vocal apaisé pour la lecture suivie.',
    description:
      'Optimise les espacements et réduit la vitesse TTS afin de faciliter le décodage des mots.',
    tags: ['Lecture', 'Focus'],
    tone: 'confirm',
    activity: 'Profil Confort dyslexie appliqué',
    preset: true,
    createdAt: 0,
    settings: {
      'contrast.enabled': true,
      'spacing.lineHeight': 1.8,
      'spacing.letterSpacing': 0.12,
      'tts.rate': 0.85,
      'tts.pitch': 1,
      'tts.volume': 0.95,
      'audio.theme': 'soft',
      'audio.volume': 0.85,
      'audio.events.alert.enabled': false,
      'audio.events.warning.sound': 'warning',
      'audio.events.success.sound': 'confirm',
      'audio.events.info.sound': 'toggle',
    },
  },
  'lecture-rapide': {
    name: 'Lecture vocale rapide',
    summary: 'Accélère légèrement la voix pour survoler les contenus textuels.',
    description:
      'Ajuste la vitesse de lecture, garde un espacement confortable et conserve la mise en page d’origine.',
    tags: ['Voix', 'Productivité'],
    tone: 'confirm',
    activity: 'Profil Lecture vocale rapide appliqué',
    preset: true,
    createdAt: 0,
    settings: {
      'contrast.enabled': false,
      'spacing.lineHeight': 1.6,
      'spacing.letterSpacing': 0.05,
      'tts.rate': 1.25,
      'tts.pitch': 1,
      'tts.volume': 1,
      'audio.theme': 'classic',
      'audio.volume': 0.95,
      'audio.events.alert.sound': 'alert',
      'audio.events.warning.sound': 'confirm',
      'audio.events.success.sound': 'success',
      'audio.events.info.sound': 'info',
    },
  },
};

const initialCollectionId = moduleCollections[0]?.id ?? null;

const normalizedManifests = [
  registerModuleManifest(audioManifest, audioManifest.id),
  ...moduleCatalog.map(({ id, manifest }) => registerModuleManifest(manifest, id)),
];

const pluginConfig = window.a11ytbPluginConfig || {};
const resolvedDefaultLocale = resolveLocale(
  pluginConfig?.defaults?.locale ||
    (typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : undefined)
);

const baseInitial = {
  ui: {
    dock: 'right',
    category: 'all',
    search: '',
    fullscreenMenuOpen: false,
    fullscreen: false,
    pinned: [],
    hidden: [],
    disabled: [],
    moduleOrder: [],
    priorities: {},
    showHidden: false,
    organizeFilter: 'all',
    availableModules: {
      profile: 'all',
      collection: 'all',
      compatibility: 'all',
    },
    statusFilters: {
      profile: 'all',
      collection: 'all',
    },
    activity: [],
    lastProfile: null,
    guides: {
      completedSteps: {},
      selectedScenario: null,
      cursors: {},
    },
    collections: {
      disabled: [],
      presets: {},
      builder: {
        activeCollectionId: initialCollectionId,
        drafts: {},
      },
    },
    shortcuts: {
      overrides: {},
      lastRecorded: null,
    },
    locale: resolvedDefaultLocale,
  },
  profiles: profilePresets,
  runtime: {
    modules: {},
    notifications: [],
  },
  collaboration: {
    accounts: [],
    teams: [],
    workflow: {
      defaultState: 'draft',
      states: {
        draft: {
          label: 'Brouillon',
          description: 'Préparation interne en attente de revue.',
          roles: ['owner', 'editor'],
        },
        review: {
          label: 'Revue',
          description: 'Validation par un pair ou un référent accessibilité.',
          roles: ['reviewer', 'owner'],
        },
        published: {
          label: 'Publication',
          description: 'Workflow validé et visible par l’équipe élargie.',
          roles: ['owner', 'admin'],
        },
      },
      transitions: [
        { from: 'draft', to: 'review', label: 'Envoyer en revue', roles: ['owner', 'editor'] },
        {
          from: 'review',
          to: 'draft',
          label: 'Retourner en brouillon',
          roles: ['reviewer', 'owner'],
        },
        {
          from: 'review',
          to: 'published',
          label: 'Approuver & publier',
          roles: ['reviewer', 'owner'],
        },
      ],
    },
    syncs: [],
    exports: [],
    profileShares: [],
    automations: [],
  },
};

const initial = normalizedManifests.reduce(
  (acc, manifest) => mergeManifestDefaults(acc, manifest),
  baseInitial
);

const defaultConfig = pluginConfig?.defaults || {};
const allowedDocks = new Set(['left', 'right', 'bottom']);

const metricsIntegration = pluginConfig?.integrations?.metrics || {};
const metricsEndpoint =
  typeof metricsIntegration.endpoint === 'string' ? metricsIntegration.endpoint.trim() : '';
const metricsAuthToken =
  typeof metricsIntegration.authToken === 'string' ? metricsIntegration.authToken : '';
const metricsWindowMs = Number(metricsIntegration.windowMs);
const metricsFlushMs = Number(metricsIntegration.flushMs);
const metricsTimeoutMs = Number(metricsIntegration.timeoutMs);
let metricsTransport = null;
if (metricsEndpoint && typeof fetch === 'function') {
  metricsTransport = async (payload, { signal } = {}) => {
    const response = await fetch(metricsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(metricsAuthToken ? { Authorization: `Bearer ${metricsAuthToken}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  };
}

let metricsStorage = null;
if (typeof window !== 'undefined' && window.localStorage) {
  const storageKey = metricsIntegration.storageKey || 'a11ytb/metrics-sync-queue';
  metricsStorage = {
    async load() {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn('a11ytb: stockage métriques indisponible.', error);
        return [];
      }
    },
    async save(data) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.isArray(data) ? data : []));
      } catch (error) {
        console.warn('a11ytb: impossible d’enregistrer la file métriques.', error);
      }
    },
  };
}

if (defaultConfig?.dock && allowedDocks.has(defaultConfig.dock)) {
  initial.ui.dock = defaultConfig.dock;
}

if (typeof defaultConfig?.fullscreen === 'boolean') {
  initial.ui.fullscreen = defaultConfig.fullscreen;
}

const moduleIcons = {
  audit:
    '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v3h3v13h-8v-3h-2v3H3zm2 2v11h4v-3h6v3h4V10h-3V7H5zm9 1V5H5v3z"/></svg>',
  tts: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 9v6h3l4 4V5L7 9H4zm13 3a3 3 0 00-3-3v6a3 3 0 003-3zm-3-6.9v2.07a5 5 0 010 9.66V18a7 7 0 000-13.9z"/></svg>',
  stt: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a1 1 0 012 0 7 7 0 01-6 6.92V21h3v1H8v-1h3v-3.08A7 7 0 015 11a1 1 0 012 0 5 5 0 0010 0z"/></svg>',
  braille:
    '<svg viewBox="0 0 24 24" focusable="false"><path d="M6 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm12-14a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4z"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 2a10 10 0 100 20V2z"/></svg>',
  spacing:
    '<svg viewBox="0 0 24 24" focusable="false"><path d="M7 4h10v2H7V4zm-2 5h14v2H5V9zm3 5h8v2H8v-2zm-3 5h14v2H5v-2z"/></svg>',
  visionAssistant:
    '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 5c5.01 0 9.18 3.29 10.4 7-.6 1.86-2.12 4.02-4.27 5.55C16.02 19.88 14.07 20.5 12 20.5s-4.02-.62-6.13-2C3.72 16.02 2.2 13.86 1.6 12 2.82 8.29 6.99 5 12 5zm0 2C8.63 7 5.8 9.11 4.94 12c.86 2.89 3.69 5 7.06 5s6.2-2.11 7.06-5C18.2 9.11 15.37 7 12 7zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>',
};

function downloadTextFile(filename, text, mime = 'text/plain') {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn('a11ytb: impossible de déclencher le téléchargement', error);
  }
}

function escapeCsvValue(value) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildAuditCsv(report = {}) {
  const violations = Array.isArray(report?.violations) ? report.violations : [];
  const header = ['impact', 'id', 'description', 'target', 'helpUrl'];
  const rows = [];
  violations.forEach((violation) => {
    const base = {
      impact: violation.impact || 'unknown',
      id: violation.id || '',
      description: violation.description || violation.help || '',
      helpUrl: violation.helpUrl || '',
    };
    const nodes =
      Array.isArray(violation.nodes) && violation.nodes.length
        ? violation.nodes
        : [{ target: [''], failureSummary: '' }];
    nodes.forEach((node) => {
      const target = Array.isArray(node.target) ? node.target.join(' | ') : '';
      rows.push([base.impact, base.id, base.description, target, base.helpUrl]);
    });
  });
  if (!rows.length) {
    return header.join(',');
  }
  return [header.join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))].join('\n');
}

function ttsStatusMessage(status) {
  switch (status) {
    case 'unsupported':
      return 'Synthèse vocale indisponible sur ce navigateur.';
    case 'error':
      return 'Erreur lors de la synthèse vocale. Réessayez.';
    default:
      return '';
  }
}

const state = createStore('a11ytb/v1', initial);
const i18n = createI18nService({ state, initialLocale: resolvedDefaultLocale });
const notifications = createNotificationCenter({ state, i18n });

if (typeof window !== 'undefined') {
  const target = window.a11ytb || (window.a11ytb = {});
  target.i18n = {
    t: (...args) => i18n.t(...args),
    translate: (...args) => i18n.translate(...args),
    setLocale: (locale) => i18n.setLocale(locale),
    getLocale: () => i18n.getLocale(),
    use: (locale) => i18n.use(locale),
  };
  target.notifications = {
    notify: (payload) => notifications.notify(payload),
    dismiss: (id) => notifications.dismiss(id),
    clear: () => notifications.clear(),
    subscribe: (fn) => notifications.subscribe(fn),
  };
}
const feedback = createFeedback({
  initialConfig: state.get('audio'),
  subscribe: (listener) => state.on((snapshot) => listener?.(snapshot.audio)),
});

const metricsOptions = {
  state,
  transport: metricsTransport,
  storage: metricsStorage,
};
if (Number.isFinite(metricsWindowMs) && metricsWindowMs > 0) {
  metricsOptions.windowDuration = metricsWindowMs;
}
if (Number.isFinite(metricsFlushMs) && metricsFlushMs > 0) {
  metricsOptions.flushInterval = metricsFlushMs;
}
if (Number.isFinite(metricsTimeoutMs) && metricsTimeoutMs > 0) {
  metricsOptions.timeoutMs = metricsTimeoutMs;
}
const metricsSync = createMetricsSyncService(metricsOptions);
metricsSync.start();

const preferencesIntegration = pluginConfig?.integrations?.preferences || {};
let preferenceSync = null;
if (
  preferencesIntegration?.enabled &&
  typeof preferencesIntegration.endpoint === 'string' &&
  preferencesIntegration.endpoint.trim()
) {
  preferenceSync = createPreferenceSync({
    state,
    endpoint: preferencesIntegration.endpoint,
    nonce: preferencesIntegration.nonce,
    throttleMs: preferencesIntegration.throttleMs,
  });
}

if (!window.a11ytb) window.a11ytb = {};
window.a11ytb.feedback = feedback;
window.a11ytb.metricsSync = metricsSync;
if (preferenceSync) {
  window.a11ytb.preferenceSync = preferenceSync;
}

window.addEventListener('beforeunload', () => {
  metricsSync.stop();
  metricsSync.flush({ force: true }).catch(() => {});
  const pending = preferenceSync?.flush?.();
  if (pending && typeof pending.catch === 'function') {
    pending.catch(() => {});
  }
});
window.addEventListener('online', () => {
  metricsSync.flush().catch(() => {});
  preferenceSync?.flush?.().catch(() => {});
});

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      metricsSync.flush({ force: true }).catch(() => {});
      preferenceSync?.flush?.({ force: true }).catch(() => {});
    }
  });
}
const ensureDefaults = [
  ['ui.category', initial.ui.category],
  ['ui.search', initial.ui.search],
  ['ui.fullscreenMenuOpen', initial.ui.fullscreenMenuOpen],
  ['ui.fullscreen', initial.ui.fullscreen],
  ['ui.pinned', initial.ui.pinned],
  ['ui.hidden', initial.ui.hidden],
  ['ui.disabled', initial.ui.disabled],
  ['ui.moduleOrder', initial.ui.moduleOrder],
  ['ui.priorities', initial.ui.priorities],
  ['ui.showHidden', initial.ui.showHidden],
  ['ui.organizeFilter', initial.ui.organizeFilter],
  ['ui.availableModules', initial.ui.availableModules],
  ['ui.activity', initial.ui.activity],
  ['ui.lastProfile', initial.ui.lastProfile],
  ['ui.guides', initial.ui.guides],
  ['ui.collections', initial.ui.collections],
  ['audio', initial.audio],
  ['profiles', initial.profiles],
  ['audit', initial.audit],
  ['runtime.modules', initial.runtime.modules],
  ['tts.progress', initial.tts.progress],
  ['collaboration', initial.collaboration],
];

ensureDefaults.forEach(([path, fallback]) => {
  if (state.get(path) === undefined) {
    const clone = Array.isArray(fallback)
      ? [...fallback]
      : typeof fallback === 'object' && fallback !== null
        ? cloneValue(fallback)
        : fallback;
    state.set(path, clone);
  }
});
setupAudioFeedback({ state, feedback });
document.documentElement.dataset.dock = state.get('ui.dock') || 'right';
state.on((s) => {
  if (s.ui?.dock) document.documentElement.dataset.dock = s.ui.dock;
});

function markProfileCustom() {
  if (state.get('ui.activeProfile') !== 'custom') {
    state.set('ui.activeProfile', 'custom');
  }
}

registerBlock({
  id: 'audit-controls',
  moduleId: 'audit',
  title: 'Audit accessibilité',
  icon: moduleIcons.audit,
  category: 'diagnostic',
  keywords: ['audit', 'axe-core', 'diagnostic'],
  render: (state) => {
    const s = state.get();
    const audit = s.audit ?? {};
    const { label, detail } = buildAuditStatusText(audit);
    const running = audit.status === 'running';
    const hasReport = !!audit.lastReport;
    return `
      <div class="a11ytb-row">
        <button class="a11ytb-button" data-action="audit-run"${running ? ' disabled aria-busy="true"' : ''}>${running ? 'Analyse en cours…' : 'Analyser la page'}</button>
        <button class="a11ytb-button a11ytb-button--ghost" data-action="audit-export-json"${hasReport ? '' : ' disabled'}>Exporter JSON</button>
        <button class="a11ytb-button a11ytb-button--ghost" data-action="audit-export-csv"${hasReport ? '' : ' disabled'}>Exporter CSV</button>
      </div>
      <p class="a11ytb-note" role="status" aria-live="polite" data-ref="audit-status">${label}</p>
      <p class="a11ytb-note" data-ref="audit-detail">${detail}</p>
      <div data-ref="audit-stats">${renderAuditStats(audit.summary, { schedule: audit.preferences?.schedule })}</div>
      <div data-ref="audit-violations">${renderAuditViolations(audit.lastReport)}</div>
    `;
  },
  wire: ({ root, state }) => {
    const runBtn = root.querySelector('[data-action="audit-run"]');
    const exportJsonBtn = root.querySelector('[data-action="audit-export-json"]');
    const exportCsvBtn = root.querySelector('[data-action="audit-export-csv"]');
    const statusNode = root.querySelector('[data-ref="audit-status"]');
    const detailNode = root.querySelector('[data-ref="audit-detail"]');
    const statsNode = root.querySelector('[data-ref="audit-stats"]');
    const violationsNode = root.querySelector('[data-ref="audit-violations"]');

    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        try {
          await window.a11ytb?.runtime?.loadModule?.('audit');
        } catch (error) {
          console.warn('a11ytb: impossible de précharger le module audit', error);
        }
        try {
          await window.a11ytb?.audit?.analyze?.();
        } catch (error) {
          console.error('a11ytb: échec de l’audit manuel', error);
        }
      });
    }

    function exportReport(format) {
      const report = state.get('audit.lastReport');
      if (!report) return;
      const lastRun = state.get('audit.lastRun') || Date.now();
      const timestamp = new Date(lastRun).toISOString().replace(/[:.]/g, '-');
      if (format === 'json') {
        downloadTextFile(
          `audit-axe-core-${timestamp}.json`,
          JSON.stringify(report, null, 2),
          'application/json'
        );
        window.a11ytb?.logActivity?.('Rapport axe-core exporté (JSON)', {
          module: 'audit',
          tone: 'info',
          tags: ['audit', 'export', 'json'],
        });
      } else if (format === 'csv') {
        downloadTextFile(`audit-axe-core-${timestamp}.csv`, buildAuditCsv(report), 'text/csv');
        window.a11ytb?.logActivity?.('Rapport axe-core exporté (CSV)', {
          module: 'audit',
          tone: 'info',
          tags: ['audit', 'export', 'csv'],
        });
      }
    }

    exportJsonBtn?.addEventListener('click', () => exportReport('json'));
    exportCsvBtn?.addEventListener('click', () => exportReport('csv'));

    function update(snapshot) {
      const audit = snapshot.audit ?? {};
      const { label, detail } = buildAuditStatusText(audit);
      if (statusNode) statusNode.textContent = label;
      if (detailNode) detailNode.textContent = detail;
      if (statsNode)
        statsNode.innerHTML = renderAuditStats(audit.summary, {
          schedule: audit.preferences?.schedule,
        });
      if (violationsNode) violationsNode.innerHTML = renderAuditViolations(audit.lastReport);
      const running = audit.status === 'running';
      if (runBtn) {
        runBtn.disabled = running;
        if (running) {
          runBtn.textContent = 'Analyse en cours…';
          runBtn.setAttribute('aria-busy', 'true');
        } else {
          runBtn.textContent = 'Analyser la page';
          runBtn.removeAttribute('aria-busy');
        }
      }
      const hasReport = !!audit.lastReport;
      if (exportJsonBtn) exportJsonBtn.disabled = !hasReport;
      if (exportCsvBtn) exportCsvBtn.disabled = !hasReport;
    }

    update(state.get());
    state.on(update);
  },
});

registerBlock({
  id: 'tts-controls',
  moduleId: 'tts',
  title: 'Lecture vocale (TTS)',
  icon: moduleIcons.tts,
  category: 'lecture',
  keywords: ['voix', 'lecture', 'audio'],
  render: (state) => {
    const s = state.get();
    const statusMessage = ttsStatusMessage(s.tts.status);
    const percent = Math.round((s.tts.progress || 0) * 100);
    const voices = s.tts?.availableVoices ?? [];
    const selectedVoice = voices.find((voice) => voice.voiceURI === s.tts.voice);
    const voiceLabel = selectedVoice
      ? `${selectedVoice.name} (${selectedVoice.lang})`
      : 'Voix du navigateur';
    return `
      <div class="a11ytb-row">
        <button class="a11ytb-button" data-action="speak-selection">Lire la sélection</button>
        <button class="a11ytb-button" data-action="speak-page">Lire la page</button>
        <button class="a11ytb-button" data-action="stop">Stop</button>
      </div>
      <div class="a11ytb-status-line">
        <span class="a11ytb-badge" data-ref="badge"${s.tts.status === 'speaking' ? '' : ' hidden'}>Lecture en cours</span>
        <div class="a11ytb-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" data-ref="progress"${s.tts.status === 'speaking' ? '' : ' hidden'}>
          <span class="a11ytb-progress-bar" style="width: ${percent}%"></span>
        </div>
        <span class="a11ytb-progress-label" data-ref="progress-label"${s.tts.status === 'speaking' ? '' : ' hidden'}>${percent}%</span>
      </div>
      <p class="a11ytb-note" role="status" data-ref="status"${statusMessage ? '' : ' hidden'}>${statusMessage}</p>
      <button class="a11ytb-button a11ytb-button--ghost" data-action="open-reader">Ouvrir le lecteur de test</button>
      <dl class="a11ytb-summary">
        <div>
          <dt>Voix</dt>
          <dd data-ref="voice">${voiceLabel}</dd>
        </div>
        <div>
          <dt>Vitesse</dt>
          <dd data-ref="rate">${(s.tts.rate ?? 1).toFixed(1)}×</dd>
        </div>
        <div>
          <dt>Timbre</dt>
          <dd data-ref="pitch">${(s.tts.pitch ?? 1).toFixed(1)}</dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd data-ref="volume">${Math.round((s.tts.volume ?? 1) * 100)} %</dd>
        </div>
      </dl>
      <button class="a11ytb-button a11ytb-button--ghost" data-action="open-options" aria-label="Ajuster dans le panneau de personnalisation">Ajuster dans Options &amp; Profils</button>
    `;
  },
  wire: ({ root, state }) => {
    root
      .querySelector('[data-action="speak-selection"]')
      .addEventListener('click', () => window.speakSelection());
    root
      .querySelector('[data-action="speak-page"]')
      .addEventListener('click', () => window.speakPage());
    root
      .querySelector('[data-action="stop"]')
      .addEventListener('click', () => window.stopSpeaking());
    root
      .querySelector('[data-action="open-reader"]')
      .addEventListener('click', () => window.openTtsReader?.());
    const statusNode = root.querySelector('[data-ref="status"]');
    const badge = root.querySelector('[data-ref="badge"]');
    const progress = root.querySelector('[data-ref="progress"]');
    const progressLabel = root.querySelector('[data-ref="progress-label"]');
    const voiceNode = root.querySelector('[data-ref="voice"]');
    const rateNode = root.querySelector('[data-ref="rate"]');
    const pitchNode = root.querySelector('[data-ref="pitch"]');
    const volumeNode = root.querySelector('[data-ref="volume"]');
    if (statusNode) {
      state.on((s) => {
        const message = ttsStatusMessage(s.tts.status);
        statusNode.textContent = message;
        if (message) {
          statusNode.removeAttribute('hidden');
        } else {
          statusNode.setAttribute('hidden', '');
        }
      });
    }
    state.on((s) => {
      const speaking = s.tts.status === 'speaking';
      const percent = Math.round((s.tts.progress || 0) * 100);
      if (badge) {
        if (speaking) {
          badge.removeAttribute('hidden');
        } else {
          badge.setAttribute('hidden', '');
        }
      }
      if (progress) {
        if (speaking) {
          progress.removeAttribute('hidden');
          progress.setAttribute('aria-valuenow', String(percent));
          progress.setAttribute('aria-valuetext', `${percent}%`);
          const bar = progress.querySelector('.a11ytb-progress-bar');
          if (bar) bar.style.width = `${percent}%`;
        } else {
          progress.setAttribute('hidden', '');
        }
      }
      if (progressLabel) {
        if (speaking) {
          progressLabel.textContent = `${percent}%`;
          progressLabel.removeAttribute('hidden');
        } else {
          progressLabel.setAttribute('hidden', '');
        }
      }
      if (voiceNode) {
        const voices = s.tts?.availableVoices ?? [];
        const selectedVoice = voices.find((voice) => voice.voiceURI === s.tts.voice);
        voiceNode.textContent = selectedVoice
          ? `${selectedVoice.name} (${selectedVoice.lang})`
          : 'Voix du navigateur';
      }
      if (rateNode) rateNode.textContent = `${(s.tts.rate ?? 1).toFixed(1)}×`;
      if (pitchNode) pitchNode.textContent = `${(s.tts.pitch ?? 1).toFixed(1)}`;
      if (volumeNode) volumeNode.textContent = `${Math.round((s.tts.volume ?? 1) * 100)} %`;
    });
  },
});

registerBlock({
  id: 'stt-controls',
  moduleId: 'stt',
  title: 'Reconnaissance vocale (STT)',
  icon: moduleIcons.stt,
  category: 'interaction',
  keywords: ['dictée', 'micro', 'voix'],
  render: (state) => {
    const s = state.get();
    const sourceLabel = s.stt.inputSource || 'Micro par défaut';
    const escapedSourceLabel = escapeAttr(sourceLabel);
    return `
      <div class="a11ytb-row">
        <button class="a11ytb-button" data-action="start">Démarrer</button>
        <button class="a11ytb-button" data-action="stop">Arrêter</button>
      </div>
      <div class="a11ytb-status-line">
        <span class="a11ytb-badge" data-ref="badge"${s.stt.status === 'listening' ? '' : ' hidden'}>Écoute en cours</span>
        <span class="a11ytb-status-text">Statut&nbsp;: <strong data-ref="status">${s.stt.status}</strong></span>
        <button
          type="button"
          class="a11ytb-chip a11ytb-chip--ghost a11ytb-audio-source"
          data-action="refresh-source"
          data-ref="source-button"
          aria-label="Source audio : ${escapedSourceLabel}"
          title="Source audio : ${escapedSourceLabel}"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a1 1 0 012 0 7 7 0 01-6 6.92V21h3v1H8v-1h3v-3.08A7 7 0 015 11a1 1 0 012 0 5 5 0 0010 0z" />
          </svg>
          <span aria-live="polite" data-ref="source-label"></span>
        </button>
      </div>
      <textarea rows="3" style="width:100%" placeholder="Transcription..." data-ref="txt"></textarea>
    `;
  },
  wire: ({ root, state }) => {
    const txt = root.querySelector('[data-ref="txt"]');
    const statusEl = root.querySelector('[data-ref="status"]');
    const badge = root.querySelector('[data-ref="badge"]');
    const sourceButton = root.querySelector('[data-ref="source-button"]');
    const sourceLabel = root.querySelector('[data-ref="source-label"]');
    const current = state.get();
    if (txt) txt.value = current.stt.transcript || '';
    root
      .querySelector('[data-action="start"]')
      .addEventListener('click', () => window.a11ytb?.stt?.start?.());
    root
      .querySelector('[data-action="stop"]')
      .addEventListener('click', () => window.a11ytb?.stt?.stop?.());
    if (sourceButton) {
      sourceButton.addEventListener('click', () => {
        window.a11ytb?.stt?.refreshInputSource?.();
      });
    }
    function applySourceDetails(sttState) {
      const label = sttState?.inputSource || 'Micro par défaut';
      if (sourceLabel) {
        sourceLabel.textContent = label;
      }
      if (sourceButton) {
        const attrValue = `Source audio : ${label}`;
        sourceButton.setAttribute('aria-label', attrValue);
        sourceButton.setAttribute('title', attrValue);
      }
    }

    applySourceDetails(state.get()?.stt);

    state.on((s) => {
      txt.value = s.stt.transcript || '';
      if (statusEl) statusEl.textContent = s.stt.status;
      if (badge) {
        if (s.stt.status === 'listening') {
          badge.removeAttribute('hidden');
        } else {
          badge.setAttribute('hidden', '');
        }
      }
      applySourceDetails(s.stt);
    });
  },
});

registerBlock({
  id: 'braille-controls',
  moduleId: 'braille',
  title: 'Braille',
  icon: moduleIcons.braille,
  category: 'lecture',
  keywords: ['braille', 'lecture tactile'],
  render: (state) => {
    const s = state.get();
    return `
      <div class="a11ytb-row">
        <button class="a11ytb-button" data-action="sel">Transcrire la sélection</button>
        <button class="a11ytb-button" data-action="clear">Effacer</button>
      </div>
      <div class="a11ytb-status-line">
        <span class="a11ytb-badge" data-ref="badge"${s.braille.output ? '' : ' hidden'}>Sortie prête</span>
        <span aria-live="polite" class="a11ytb-status-text">Sortie&nbsp;:</span>
      </div>
      <textarea rows="3" style="width:100%" readonly data-ref="out"></textarea>
    `;
  },
  wire: ({ root, state }) => {
    const out = root.querySelector('[data-ref="out"]');
    const badge = root.querySelector('[data-ref="badge"]');
    const current = state.get();
    if (out) out.value = current.braille.output || '';
    root
      .querySelector('[data-action="sel"]')
      .addEventListener('click', () => window.brailleSelection());
    root
      .querySelector('[data-action="clear"]')
      .addEventListener('click', () => window.clearBraille());
    state.on((s) => {
      out.value = s.braille.output || '';
      if (badge) {
        if (s.braille.output) {
          badge.removeAttribute('hidden');
        } else {
          badge.setAttribute('hidden', '');
        }
      }
    });
  },
});

registerBlock({
  id: 'contrast-controls',
  moduleId: 'contrast',
  title: 'Contraste élevé',
  icon: moduleIcons.contrast,
  category: 'vision',
  keywords: ['vision', 'contraste'],
  render: (state) => {
    const s = state.get();
    return `
      <button class="a11ytb-button" data-action="toggle" aria-pressed="${s.contrast.enabled}">${s.contrast.enabled ? 'Désactiver' : 'Activer'}</button>
    `;
  },
  wire: ({ root, state }) => {
    const btn = root.querySelector('[data-action="toggle"]');
    btn.addEventListener('click', () => {
      const enabled = !state.get('contrast.enabled');
      state.set('contrast.enabled', enabled);
      markProfileCustom();
      window.a11ytb?.feedback?.play('toggle');
      window.a11ytb?.logActivity?.(`Contraste élevé ${enabled ? 'activé' : 'désactivé'}`);
    });
    state.on((s) => {
      const enabled = !!s.contrast.enabled;
      document.documentElement.classList.toggle('a11ytb-contrast', enabled);
      btn.textContent = enabled ? 'Désactiver' : 'Activer';
      btn.setAttribute('aria-pressed', String(enabled));
    });
    const initial = !!state.get('contrast.enabled');
    document.documentElement.classList.toggle('a11ytb-contrast', initial);
    btn.textContent = initial ? 'Désactiver' : 'Activer';
    btn.setAttribute('aria-pressed', String(initial));
  },
});

function visionAssistantStatusText(status, error) {
  if (status === 'error' && error) {
    return `Erreur : ${error}`;
  }
  if (status === 'loading') {
    return 'Analyse en cours…';
  }
  if (status === 'ready') {
    return 'Analyse terminée.';
  }
  if (status === 'unconfigured') {
    return 'Service non configuré.';
  }
  return 'En attente d’une analyse.';
}

registerBlock({
  id: 'vision-assistant-controls',
  moduleId: 'vision-assistant',
  title: 'Assistant visuel IA',
  icon: moduleIcons.visionAssistant,
  category: 'vision',
  keywords: ['vision', 'ia', 'analyse'],
  render: () => `
    <form data-ref="upload-form">
      <label for="vision-assistant-upload">Image locale</label>
      <input id="vision-assistant-upload" type="file" accept="image/*" data-ref="file-input" />
      <label for="vision-assistant-engine">Moteur IA</label>
      <select
        id="vision-assistant-engine"
        class="a11ytb-engine-select"
        data-ref="engine-select"
        aria-describedby="vision-assistant-status"
      ></select>
      <label for="vision-assistant-prompt">Prompt</label>
      <textarea id="vision-assistant-prompt" rows="3" data-ref="prompt-input" placeholder="Décrivez la consigne envoyée au moteur."></textarea>
      <div class="a11ytb-row">
        <button class="a11ytb-button" type="submit" data-ref="upload-submit">Analyser l’image</button>
      </div>
    </form>
    <form data-ref="fetch-form">
      <label for="vision-assistant-url">URL d’image distante</label>
      <input id="vision-assistant-url" type="url" inputmode="url" autocomplete="off" data-ref="url-input" placeholder="https://exemple.test/image.jpg" />
      <div class="a11ytb-row">
        <button class="a11ytb-button a11ytb-button--ghost" type="submit" data-ref="fetch-submit">Analyser l’URL</button>
      </div>
    </form>
    <p
      id="vision-assistant-status"
      class="a11ytb-note"
      role="status"
      aria-live="polite"
      data-ref="status"
    ></p>
    <div class="a11ytb-note" data-ref="response" aria-live="polite"></div>
  `,
  wire: ({ root, state }) => {
    const uploadForm = root.querySelector('[data-ref="upload-form"]');
    const fetchForm = root.querySelector('[data-ref="fetch-form"]');
    const promptInput = root.querySelector('[data-ref="prompt-input"]');
    const urlInput = root.querySelector('[data-ref="url-input"]');
    const fileInput = root.querySelector('[data-ref="file-input"]');
    const statusNode = root.querySelector('[data-ref="status"]');
    const responseNode = root.querySelector('[data-ref="response"]');
    const uploadButton = root.querySelector('[data-ref="upload-submit"]');
    const fetchButton = root.querySelector('[data-ref="fetch-submit"]');
    const engineSelect = root.querySelector('[data-ref="engine-select"]');

    let moduleReady = Boolean(window.a11ytb?.visionAssistant);
    let cleanupBinding = null;
    let detachEngineListener = null;

    const syncEngineControl = (vision) => {
      if (!engineSelect) {
        return;
      }
      const engines = Array.isArray(vision.availableEngines) ? vision.availableEngines : [];
      const currentValues = Array.from(engineSelect.options).map((option) => option.value);
      const changed =
        engines.length !== currentValues.length ||
        engines.some((value, index) => currentValues[index] !== value);

      if (changed) {
        engineSelect.innerHTML = '';
        if (!engines.length) {
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = 'Aucun moteur disponible';
          engineSelect.append(placeholder);
        } else {
          engines.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value
              .split('-')
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(' ');
            engineSelect.append(option);
          });
        }
      }

      const desired = vision.engine || (engines.length ? engines[0] : '');
      if (engineSelect.value !== (desired || '')) {
        engineSelect.value = desired || '';
      }
      engineSelect.disabled = !moduleReady || engines.length <= 1;
    };

    const applyState = (snapshot) => {
      const vision = snapshot?.visionAssistant || {};
      if (statusNode) {
        const message = visionAssistantStatusText(vision.status, vision.error);
        statusNode.textContent = message;
        if (message) {
          statusNode.removeAttribute('hidden');
        } else {
          statusNode.setAttribute('hidden', '');
        }
      }
      if (responseNode) {
        responseNode.textContent = vision.lastResponse || 'Aucun résultat pour le moment.';
      }
      const isLoading = moduleReady && vision.status === 'loading';
      if (uploadButton) {
        if (!moduleReady) {
          uploadButton.disabled = true;
          uploadButton.removeAttribute('aria-busy');
        } else {
          uploadButton.disabled = isLoading;
          if (isLoading) {
            uploadButton.setAttribute('aria-busy', 'true');
          } else {
            uploadButton.removeAttribute('aria-busy');
          }
        }
      }
      if (fetchButton) {
        if (!moduleReady) {
          fetchButton.disabled = true;
          fetchButton.removeAttribute('aria-busy');
        } else {
          fetchButton.disabled = isLoading;
          if (isLoading) {
            fetchButton.setAttribute('aria-busy', 'true');
          } else {
            fetchButton.removeAttribute('aria-busy');
          }
        }
      }
      if (promptInput && document.activeElement !== promptInput) {
        const nextPrompt = vision.prompt ?? '';
        if (promptInput.value !== nextPrompt) {
          promptInput.value = nextPrompt;
        }
      }
      if (urlInput && document.activeElement !== urlInput) {
        const nextUrl = vision.lastUrl ?? '';
        if (urlInput.value !== nextUrl) {
          urlInput.value = nextUrl;
        }
      }
      if (engineSelect) {
        syncEngineControl(vision);
      }
    };

    applyState(state.get());
    state.on(applyState);

    if (engineSelect) {
      const onEngineChange = (event) => {
        const next = event.target.value || '';
        state.set('visionAssistant.engine', next);
        window.a11ytb?.visionAssistant?.setEngine?.(next);
      };
      engineSelect.addEventListener('change', onEngineChange);
      detachEngineListener = () => engineSelect.removeEventListener('change', onEngineChange);
    }

    const bindModule = () => {
      if (typeof window.a11ytb?.visionAssistant?.bindUI === 'function') {
        if (typeof cleanupBinding === 'function') {
          cleanupBinding();
        }
        if (typeof detachEngineListener === 'function') {
          detachEngineListener();
          detachEngineListener = null;
        }
        cleanupBinding = window.a11ytb.visionAssistant.bindUI({
          uploadForm,
          fetchForm,
          promptInput,
          urlInput,
          fileInput,
          statusNode,
          responseNode,
          uploadButton,
          fetchButton,
          engineSelect,
        });
        moduleReady = true;
        applyState(state.get());
      }
    };

    if (window.a11ytb?.visionAssistant) {
      bindModule();
    } else if (window.a11ytb?.runtime?.loadModule) {
      window.a11ytb.runtime
        .loadModule('vision-assistant')
        .then(() => {
          bindModule();
        })
        .catch((error) => {
          console.error('a11ytb: impossible de charger le module assistant visuel.', error);
        });
    }
  },
});

registerBlock({
  id: 'spacing-controls',
  moduleId: 'spacing',
  title: 'Espacements',
  icon: moduleIcons.spacing,
  category: 'vision',
  keywords: ['espacements', 'typographie'],
  render: (state) => {
    const s = state.get();
    return `
      <p class="a11ytb-note">Réglez précisément les espacements dans l’onglet Options &amp; Profils.</p>
      <dl class="a11ytb-summary">
        <div>
          <dt>Interlignage</dt>
          <dd data-ref="lineHeight">${(s.spacing.lineHeight ?? 1.5).toFixed(1)}×</dd>
        </div>
        <div>
          <dt>Lettres</dt>
          <dd data-ref="letterSpacing">${Math.round((s.spacing.letterSpacing ?? 0) * 100)} %</dd>
        </div>
      </dl>
      <button class="a11ytb-button a11ytb-button--ghost" data-action="open-options" aria-label="Ouvrir le panneau de personnalisation">Ouvrir Options &amp; Profils</button>
    `;
  },
  wire: ({ root, state }) => {
    const lineNode = root.querySelector('[data-ref="lineHeight"]');
    const letterNode = root.querySelector('[data-ref="letterSpacing"]');
    function applyToDocument(spacingState) {
      document.documentElement.style.setProperty(
        '--a11ytb-lh',
        String(spacingState.spacing.lineHeight)
      );
      document.documentElement.style.setProperty(
        '--a11ytb-ls',
        String(spacingState.spacing.letterSpacing) + 'em'
      );
      document.documentElement.classList.add('a11ytb-spacing-ready');
    }
    function updateSummary(spacingState) {
      if (lineNode)
        lineNode.textContent = `${(spacingState.spacing.lineHeight ?? 1.5).toFixed(1)}×`;
      if (letterNode)
        letterNode.textContent = `${Math.round((spacingState.spacing.letterSpacing ?? 0) * 100)} %`;
    }
    const initial = state.get();
    applyToDocument(initial);
    updateSummary(initial);
    state.on((s) => {
      applyToDocument(s);
      updateSummary(s);
    });
  },
});

setupModuleRuntime({
  state,
  catalog: moduleCatalog,
  collections: moduleCollections,
  onMetricsUpdate: (sample) => metricsSync.ingest(sample),
});

const root = document.getElementById('a11ytb-root');
mountUI({ root, state, config: pluginConfig, i18n, notifications });
const inlineTriggers = attachModuleTriggers({ state });
if (inlineTriggers) {
  window.a11ytb.inlineTriggers = inlineTriggers;
}
