import { moduleCatalog, moduleCatalogById } from './module-catalog.js';
import { summarizeStatuses } from './status-center.js';

function readPath(snapshot, path, fallback) {
  if (!snapshot || typeof snapshot !== 'object') return fallback;
  const segments = path.split('.');
  let current = snapshot;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      return fallback;
    }
  }
  return current;
}

const CRITICAL_MODULES = [
  { id: 'tts', label: 'Synthèse vocale' },
  { id: 'stt', label: 'Reconnaissance vocale' },
  { id: 'braille', label: 'Transcription braille' }
];

const DEFAULT_GUIDE_ORDER = 100;

function ensureArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function formatDateTime(timestamp) {
  if (!timestamp) return null;
  const time = Number(timestamp);
  if (!Number.isFinite(time) || time <= 0) return null;
  try {
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    return formatter.format(new Date(time));
  } catch (error) {
    try {
      return new Date(time).toLocaleString('fr-FR');
    } catch (fallbackError) {
      return String(time);
    }
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return null;
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return null;
  const diff = Date.now() - value;
  if (!Number.isFinite(diff)) return null;
  const absolute = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (absolute < minute) {
    return 'il y a moins d’une minute';
  }
  if (absolute < hour) {
    const minutes = Math.round(absolute / minute);
    return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  if (absolute < day) {
    const hours = Math.round(absolute / hour);
    return `il y a ${hours} heure${hours > 1 ? 's' : ''}`;
  }
  const formatted = formatDateTime(value);
  return formatted ? `le ${formatted}` : null;
}

function describeRuntimeState(name, runtime = {}) {
  if (!runtime.enabled) {
    return `${name} est désactivé. Activez le module depuis la vue Organisation.`;
  }
  if (runtime.state === 'error') {
    return runtime.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
  }
  if (runtime.state === 'loading') {
    const relative = formatRelativeTime(runtime.metrics?.lastAttemptAt);
    return relative ? `Chargement en cours (${relative}).` : 'Chargement en cours.';
  }
  if (runtime.state === 'ready') {
    const compat = runtime.metrics?.compat;
    if (compat?.status === 'partial') {
      return 'Module prêt (compatibilité partielle détectée).';
    }
    return 'Module opérationnel.';
  }
  return 'Statut non communiqué.';
}

function getRuntime(runtimeMap, moduleId) {
  if (!moduleId) return {};
  return runtimeMap?.[moduleId] || {};
}

function evaluatePrerequisites(prerequisites, context) {
  const list = ensureArray(prerequisites);
  if (!list.length) return [];
  return list.map((entry, index) => {
    if (typeof entry === 'string') {
      return evaluatePrerequisite(
        { type: 'module', id: entry },
        context,
        index
      );
    }
    if (!entry || typeof entry !== 'object') return null;
    return evaluatePrerequisite(entry, context, index);
  }).filter(Boolean);
}

function evaluatePrerequisite(entry, context, index) {
  const type = typeof entry.type === 'string' ? entry.type.toLowerCase() : 'module';
  const optional = entry.optional === true;
  if (type === 'module') {
    const targetId = typeof entry.id === 'string' && entry.id.trim()
      ? entry.id.trim()
      : (typeof entry.module === 'string' ? entry.module.trim() : null);
    if (!targetId) return null;
    const manifest = moduleCatalogById.get(targetId)?.manifest;
    const runtime = getRuntime(context.runtimeMap, targetId);
    const label = typeof entry.label === 'string'
      ? entry.label
      : (manifest?.name || targetId);
    const customCheck = typeof entry.check === 'function'
      ? !!entry.check({ ...context, moduleId: targetId, manifest, runtime })
      : null;
    const met = customCheck !== null
      ? customCheck
      : !!runtime.enabled && runtime.state !== 'error';
    let detail = '';
    if (typeof entry.detail === 'function') {
      detail = entry.detail({ ...context, moduleId: targetId, manifest, runtime }) || '';
    } else if (typeof entry.detail === 'string') {
      detail = entry.detail;
    } else {
      detail = describeRuntimeState(label, runtime);
    }
    return {
      id: targetId,
      label,
      type: 'module',
      optional,
      met,
      status: met ? 'met' : (optional ? 'optional' : 'missing'),
      detail,
      index
    };
  }

  const label = typeof entry.label === 'string'
    ? entry.label
    : (typeof entry.id === 'string' ? entry.id : `Prérequis ${index + 1}`);
  const met = typeof entry.check === 'function' ? !!entry.check(context) : false;
  const detail = typeof entry.detail === 'function'
    ? entry.detail(context)
    : (entry.detail || '');
  return {
    id: typeof entry.id === 'string' ? entry.id : `prerequisite-${index}`,
    label,
    type,
    optional,
    met,
    status: met ? 'met' : (optional ? 'optional' : 'missing'),
    detail,
    index
  };
}

function evaluateStep(stepDefinition, context, manualMap, scenarioId, index) {
  if (!stepDefinition || typeof stepDefinition !== 'object') return null;
  if (typeof stepDefinition.when === 'function' && !stepDefinition.when(context)) {
    return null;
  }
  const rawId = typeof stepDefinition.id === 'string' && stepDefinition.id.trim()
    ? stepDefinition.id.trim()
    : `step-${index}`;
  const key = `${scenarioId}:${rawId}`;
  const mode = stepDefinition.mode === 'manual' ? 'manual' : 'auto';
  const detail = typeof stepDefinition.detail === 'function'
    ? (stepDefinition.detail(context) || '')
    : (stepDefinition.detail || '');
  let completed = false;
  if (mode === 'auto') {
    completed = typeof stepDefinition.check === 'function'
      ? !!stepDefinition.check(context)
      : false;
  } else {
    completed = !!manualMap[key];
  }
  const announcement = typeof stepDefinition.announce === 'function'
    ? (stepDefinition.announce({ ...context, detail, completed }) || '')
    : (stepDefinition.announce || [stepDefinition.label, detail].filter(Boolean).join('. '));
  const toggleLabels = {
    complete: stepDefinition.toggleLabels?.complete || 'Marquer comme fait',
    reset: stepDefinition.toggleLabels?.reset || 'Marquer à refaire'
  };
  const tag = typeof stepDefinition.tag === 'string'
    ? stepDefinition.tag
    : (mode === 'auto' ? 'Suivi automatique' : 'Étape manuelle');
  return {
    id: rawId,
    key,
    label: stepDefinition.label || rawId,
    detail,
    mode,
    state: mode,
    completed,
    status: completed ? 'done' : 'todo',
    announcement,
    toggleLabels,
    tag,
    hints: ensureArray(stepDefinition.hints),
    index
  };
}

function buildScenarioFromDefinition(definition, baseContext) {
  if (!definition || typeof definition !== 'object') return null;
  const scenarioId = typeof definition.id === 'string' && definition.id.trim()
    ? definition.id.trim()
    : null;
  if (!scenarioId) return null;

  const manifest = baseContext.manifest
    || moduleCatalogById.get(baseContext.moduleId || '')?.manifest
    || null;
  const moduleName = manifest?.name || baseContext.moduleId || '';
  const runtime = getRuntime(baseContext.runtimeMap, baseContext.moduleId);

  const context = {
    ...baseContext,
    scenarioId,
    manifest,
    moduleName,
    runtime,
    helpers: {
      formatDateTime,
      formatRelativeTime,
      readPath
    },
    getRuntime: (moduleId) => getRuntime(baseContext.runtimeMap, moduleId),
    getManifest: (moduleId) => moduleCatalogById.get(moduleId)?.manifest || null
  };

  const prerequisites = evaluatePrerequisites(definition.prerequisites, context);

  const steps = [];
  const rawSteps = ensureArray(definition.steps);
  rawSteps.forEach((stepDefinition, index) => {
    const step = evaluateStep(stepDefinition, context, baseContext.manualMap, scenarioId, index);
    if (step) steps.push(step);
  });

  if (!steps.length) return null;

  const completedCount = steps.filter((step) => step.completed).length;
  const total = steps.length;
  const progress = total > 0 ? completedCount / total : 0;
  const nextIndex = steps.findIndex((step) => !step.completed);
  const recommendedIndex = nextIndex >= 0 ? nextIndex : (steps.length ? steps.length - 1 : 0);
  const nextStep = nextIndex >= 0 ? steps[nextIndex] : null;
  const blocked = prerequisites.some((entry) => !entry.met && !entry.optional);

  const assistance = definition.assistance || {};
  const assistanceMicrocopy = typeof assistance.microcopy === 'function'
    ? assistance.microcopy(context)
    : (assistance.microcopy || '');
  const assistanceExamples = ensureArray(assistance.examples)
    .map((example, index) => {
      if (typeof example === 'string') {
        return {
          id: `${scenarioId}-example-${index}`,
          title: '',
          description: example
        };
      }
      if (!example || typeof example !== 'object') return null;
      const id = typeof example.id === 'string'
        ? example.id
        : `${scenarioId}-example-${index}`;
      const title = typeof example.title === 'function'
        ? example.title(context)
        : (example.title || '');
      const description = typeof example.description === 'function'
        ? example.description(context)
        : (example.description || '');
      if (!title && !description) return null;
      return { id, title, description };
    })
    .filter(Boolean);
  const assistanceResources = ensureArray(assistance.resources)
    .map((resource, index) => {
      if (!resource || typeof resource !== 'object' || !resource.href) return null;
      const id = typeof resource.id === 'string'
        ? resource.id
        : `${scenarioId}-resource-${index}`;
      const label = typeof resource.label === 'function'
        ? resource.label(context)
        : (resource.label || resource.href);
      return {
        id,
        href: resource.href,
        label,
        external: resource.external === true
      };
    })
    .filter(Boolean);

  const tone = definition.tone
    || (blocked ? 'warning' : (completedCount === total ? 'confirm' : 'info'));

  const summary = typeof definition.summary === 'function'
    ? definition.summary(context)
    : (definition.summary || '');

  const statusLabel = blocked
    ? 'Prérequis manquants'
    : (completedCount === total
      ? 'Parcours terminé'
      : `${total - completedCount} étape${total - completedCount > 1 ? 's' : ''} restante${total - completedCount > 1 ? 's' : ''}`);

  return {
    id: scenarioId,
    title: definition.title || moduleName || scenarioId,
    description: typeof definition.description === 'function'
      ? definition.description(context)
      : (definition.description || ''),
    tone,
    category: definition.category || manifest?.category || 'general',
    order: Number.isFinite(definition.order) ? definition.order : DEFAULT_GUIDE_ORDER,
    moduleId: baseContext.moduleId || null,
    moduleName,
    steps,
    completedCount,
    total,
    progress: Math.min(1, Math.max(0, progress)),
    nextStep,
    nextStepIndex: nextIndex,
    recommendedStepIndex: recommendedIndex,
    prerequisites,
    blocked,
    assistance: {
      microcopy: assistanceMicrocopy,
      examples: assistanceExamples,
      resources: assistanceResources
    },
    tags: ensureArray(definition.tags),
    summary,
    statusLabel,
    liveAnnouncement: typeof definition.announce === 'function'
      ? definition.announce({ ...context, steps })
      : (definition.announce || ''),
    toneExplicit: !!definition.tone
  };
}

function buildCriticalServicesScenario(baseContext) {
  const runtimeMap = baseContext.runtimeMap || {};
  const steps = [];
  CRITICAL_MODULES.forEach((entry, index) => {
    const manifest = moduleCatalogById.get(entry.id)?.manifest;
    const name = manifest?.name || entry.label || entry.id;
    const runtime = getRuntime(runtimeMap, entry.id);
    const detail = describeRuntimeState(name, runtime);
    const completed = !!runtime.enabled && runtime.state === 'ready';
    steps.push({
      id: `critical-${entry.id}`,
      key: `core-services:${entry.id}`,
      label: `${name} opérationnel`,
      detail,
      mode: 'auto',
      state: 'auto',
      completed,
      status: completed ? 'done' : 'todo',
      announcement: `${name}. ${detail}`,
      toggleLabels: {
        complete: 'Marquer comme fait',
        reset: 'Marquer à refaire'
      },
      tag: 'Suivi automatique',
      hints: [],
      index
    });
  });

  if (!steps.length) return null;

  const summaries = summarizeStatuses(baseContext.snapshot || {});
  const alerts = summaries.filter((entry) => entry.tone === 'alert');
  const hasAlerts = alerts.length > 0;
  const alertDetail = hasAlerts
    ? `${alerts.length} alerte${alerts.length > 1 ? 's' : ''} critique${alerts.length > 1 ? 's' : ''} à traiter.`
    : 'Aucune alerte critique active.';

  steps.push({
    id: 'critical-alerts',
    key: 'core-services:alerts',
    label: 'Surveiller les alertes en cours',
    detail: alertDetail,
    mode: 'auto',
    state: 'auto',
    completed: !hasAlerts,
    status: !hasAlerts ? 'done' : 'todo',
    announcement: `Alertes modules. ${alertDetail}`,
    toggleLabels: {
      complete: 'Marquer comme fait',
      reset: 'Marquer à refaire'
    },
    tag: 'Suivi automatique',
    hints: [],
    index: steps.length
  });

  const completedCount = steps.filter((step) => step.completed).length;
  const total = steps.length;
  const progress = total > 0 ? completedCount / total : 0;
  const nextIndex = steps.findIndex((step) => !step.completed);
  const recommendedIndex = nextIndex >= 0 ? nextIndex : (steps.length ? steps.length - 1 : 0);
  const nextStep = nextIndex >= 0 ? steps[nextIndex] : null;

  return {
    id: 'core-services',
    title: 'Surveillance des services critiques',
    description: 'Validez l’état des modules temps réel (voix, dictée, braille) et repérez les alertes actives.',
    tone: completedCount === total ? 'confirm' : 'warning',
    category: 'monitoring',
    order: 0,
    moduleId: null,
    moduleName: null,
    steps,
    completedCount,
    total,
    progress: Math.min(1, Math.max(0, progress)),
    nextStep,
    nextStepIndex: nextIndex,
    recommendedStepIndex: recommendedIndex,
    prerequisites: [],
    blocked: false,
    assistance: {
      microcopy: 'Relancez les modules en erreur depuis la barre d’administration ou actualisez la page si un service reste bloqué.',
      examples: [
        {
          id: 'core-services-example',
          title: 'Astuce',
          description: 'Si la synthèse vocale reste en « chargement », vérifiez que SpeechSynthesis est disponible ou testez depuis un navigateur alternatif.'
        }
      ],
      resources: []
    },
    tags: ['critique', 'surveillance'],
    summary: '',
    statusLabel: completedCount === total
      ? 'Tous les services sont opérationnels'
      : `${total - completedCount} service${total - completedCount > 1 ? 's' : ''} à rétablir`,
    liveAnnouncement: ''
  };
}

export function buildGuidedChecklists(snapshot = {}) {
  const manualMap = snapshot?.ui?.guides?.completedSteps || {};
  const runtimeMap = snapshot?.runtime?.modules || {};
  const baseContext = { snapshot, manualMap, runtimeMap };

  const scenarios = [];
  const criticalScenario = buildCriticalServicesScenario(baseContext);
  if (criticalScenario) scenarios.push(criticalScenario);

  moduleCatalog.forEach(({ id, manifest }) => {
    const guides = ensureArray(manifest?.guides);
    guides.forEach((guideDefinition) => {
      const scenario = buildScenarioFromDefinition(guideDefinition, {
        ...baseContext,
        moduleId: id,
        manifest
      });
      if (scenario) scenarios.push(scenario);
    });
  });

  scenarios.sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : DEFAULT_GUIDE_ORDER;
    const orderB = Number.isFinite(b.order) ? b.order : DEFAULT_GUIDE_ORDER;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title, 'fr');
  });

  return scenarios;
}

export function toggleManualChecklistStep(state, stepId, force) {
  if (!state || typeof state.set !== 'function') return false;
  const current = state.get('ui.guides.completedSteps') || {};
  const currentValue = !!current[stepId];
  const nextValue = typeof force === 'boolean' ? force : !currentValue;
  if (currentValue === nextValue) return false;
  const updated = { ...current, [stepId]: nextValue };
  state.set('ui.guides.completedSteps', updated);
  return true;
}

export function resetManualChecklistStep(state, stepId) {
  if (!state || typeof state.set !== 'function') return;
  const current = state.get('ui.guides.completedSteps') || {};
  if (!(stepId in current)) return;
  const updated = { ...current };
  delete updated[stepId];
  state.set('ui.guides.completedSteps', updated);
}
