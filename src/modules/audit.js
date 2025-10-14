import { registerModule } from '../registry.js';
import { manifest } from './audit.manifest.js';
import { normalizeAxeReport, summarizeReport } from './audit-report.js';

export { manifest };

const AXE_CORE_VERSION = '4.11.0';
const LOCAL_AXE_CORE_SRC = new URL('../../assets/vendor/axe-core/axe.min.js', import.meta.url).href;
const CDN_AXE_CORE_SRC = `https://cdn.jsdelivr.net/npm/axe-core@${AXE_CORE_VERSION}/axe.min.js`;
const CDN_AXE_CORE_INTEGRITY = 'sha384-C9AUAqw5Tb7bgiS/Z+U3EGEzD+qn2oE0sJOC4kp0Xu8DcQMLKECMpbVsuWxF+rdh';

let axeLoader = null;
let axeLocalLoader = null;
let axeCdnLoader = null;

const SCHEDULE_INTERVALS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

const SCHEDULE_LABELS = {
  hourly: 'toutes les heures',
  daily: 'quotidien',
  weekly: 'hebdomadaire'
};

const SCHEDULE_DEFAULTS = manifest?.defaults?.state?.audit?.preferences?.schedule ?? {
  enabled: false,
  frequency: 'weekly',
  timeWindow: { start: '09:00', end: '18:00' },
  lastRunAt: null,
  nextRunAt: null
};

let scheduleUnsubscribe = null;
let scheduleTimeoutId = null;
let scheduleIntervalId = null;
let schedulePendingRun = false;
let lastScheduleSignature = '';

function resolveAxe(module) {
  const axe = module?.default ?? module?.axe ?? module;
  if (!axe || typeof axe.run !== 'function') {
    throw new Error('axe-core indisponible');
  }
  return axe;
}

function loadAxeFromLocal() {
  if (window.axe && typeof window.axe.run === 'function') {
    return Promise.resolve(window.axe);
  }
  if (!axeLocalLoader) {
    axeLocalLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = LOCAL_AXE_CORE_SRC;
      script.async = true;
      script.onload = () => {
        if (window.axe && typeof window.axe.run === 'function') {
          resolve(window.axe);
        } else {
          reject(new Error('axe-core indisponible'));
        }
      };
      script.onerror = () => {
        reject(new Error('axe-core indisponible'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      axeLocalLoader = null;
      throw error;
    });
  }
  return axeLocalLoader;
}

function loadAxeCore({ importModule } = {}) {
  if (!axeLoader) {
    const load = importModule || loadAxeFromLocal;
    axeLoader = Promise.resolve()
      .then(() => load())
      .then(resolveAxe)
      .catch((error) => {
        if (load !== loadAxeFromLocal) {
          throw error;
        }
        // Fallback réseau conservé pour compatibilité, vérifier la provenance avant activation hors réseau de confiance.
        console.warn('a11ytb: chargement local axe-core échoué, tentative via CDN.', error);
        return loadAxeFromCdn().then(resolveAxe);
      })
      .catch((error) => {
        axeLoader = null;
        throw error;
      });
  }
  return axeLoader;
}

function loadAxeFromCdn() {
  if (window.axe && typeof window.axe.run === 'function') {
    return Promise.resolve(window.axe);
  }
  if (!axeCdnLoader) {
    axeCdnLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CDN_AXE_CORE_SRC;
      script.async = true;
      script.integrity = CDN_AXE_CORE_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (window.axe && typeof window.axe.run === 'function') {
          resolve(window.axe);
        } else {
          reject(new Error('axe-core indisponible'));
        }
      };
      script.onerror = () => {
        reject(new Error('axe-core indisponible'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      axeCdnLoader = null;
      throw error;
    });
  }
  return axeCdnLoader;
}

function resetAxeLoaders() {
  axeLoader = null;
  axeLocalLoader = null;
  axeCdnLoader = null;
}

function ensureAuditState(state) {
  const current = state.get('audit');
  if (!current || typeof current !== 'object') {
    state.set('audit', structuredClone(manifest.defaults.state.audit));
    return;
  }
  const defaults = manifest.defaults.state.audit;
  if (!current.preferences || typeof current.preferences !== 'object') {
    state.set('audit.preferences', structuredClone(defaults.preferences));
    return;
  }
  const defaultSchedule = defaults?.preferences?.schedule;
  if (defaultSchedule) {
    const schedule = current.preferences.schedule;
    if (!schedule || typeof schedule !== 'object') {
      state.set('audit.preferences.schedule', structuredClone(defaultSchedule));
    } else {
      const nextSchedule = { ...defaultSchedule, ...schedule };
      nextSchedule.timeWindow = {
        ...defaultSchedule.timeWindow,
        ...(schedule.timeWindow || {})
      };
      let shouldUpdate = false;
      ['enabled', 'frequency', 'lastRunAt', 'nextRunAt'].forEach((key) => {
        if (!(key in schedule)) shouldUpdate = true;
      });
      if (!schedule.timeWindow || typeof schedule.timeWindow !== 'object') {
        shouldUpdate = true;
      } else {
        if (!('start' in schedule.timeWindow) || !('end' in schedule.timeWindow)) {
          shouldUpdate = true;
        }
      }
      if (shouldUpdate) {
        state.set('audit.preferences.schedule', nextSchedule);
      }
    }
  }
}

function updateAuditState(state, patch) {
  const current = state.get('audit') || {};
  state.set('audit', { ...current, ...patch });
}

function safeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sanitizeTimeString(value, fallback) {
  const fallbackValue = typeof fallback === 'string' && fallback ? fallback : '00:00';
  if (typeof value !== 'string') {
    return fallbackValue;
  }
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
}

function normalizeScheduleWindow(window) {
  const defaults = SCHEDULE_DEFAULTS?.timeWindow ?? { start: '09:00', end: '18:00' };
  const start = sanitizeTimeString(window?.start, defaults.start || '09:00');
  const end = sanitizeTimeString(window?.end, defaults.end || '18:00');
  return { start, end };
}

function parseTimeToMinutes(value, fallback) {
  if (typeof value !== 'string') {
    return Number.isFinite(fallback) ? fallback : null;
  }
  const match = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    return Number.isFinite(fallback) ? fallback : null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  return (hours * 60) + minutes;
}

function getWindowMinutes(window) {
  const normalized = normalizeScheduleWindow(window);
  const defaults = normalizeScheduleWindow(SCHEDULE_DEFAULTS?.timeWindow ?? {});
  const startFallback = parseTimeToMinutes(defaults.start, 9 * 60);
  const endFallback = parseTimeToMinutes(defaults.end, startFallback + 60);
  const startMinutes = parseTimeToMinutes(normalized.start, startFallback);
  let endMinutes = parseTimeToMinutes(normalized.end, endFallback);
  const safeStart = Number.isFinite(startMinutes) ? startMinutes : 9 * 60;
  if (!Number.isFinite(endMinutes)) {
    endMinutes = safeStart + 60;
  }
  if (endMinutes <= safeStart) {
    endMinutes = Math.min((24 * 60), safeStart + 60);
  }
  return {
    startMinutes: safeStart,
    endMinutes
  };
}

function normalizeScheduleState(schedule = {}) {
  const defaults = SCHEDULE_DEFAULTS;
  const frequency = schedule?.frequency && SCHEDULE_INTERVALS[schedule.frequency]
    ? schedule.frequency
    : (defaults.frequency || 'weekly');
  const window = normalizeScheduleWindow(schedule?.timeWindow ?? defaults.timeWindow ?? {});
  return {
    enabled: !!schedule?.enabled,
    frequency,
    timeWindow: window,
    lastRunAt: safeNumber(schedule?.lastRunAt),
    nextRunAt: safeNumber(schedule?.nextRunAt)
  };
}

function alignWithinWindow(timestamp, frequency, windowMinutes, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const { startMinutes, endMinutes } = windowMinutes;
  const safeStart = Number.isFinite(startMinutes) ? startMinutes : 9 * 60;
  let safeEnd = Number.isFinite(endMinutes) ? endMinutes : safeStart + 60;
  if (safeEnd <= safeStart) {
    safeEnd = Math.min((24 * 60), safeStart + 60);
  }
  const startHours = Math.floor(safeStart / 60);
  const startMins = safeStart % 60;
  const endBound = Math.min(24 * 60, Math.max(safeStart + 1, safeEnd));

  const result = new Date(Number.isFinite(timestamp) ? timestamp : now);

  if (frequency === 'hourly') {
    result.setMinutes(0, 0, 0);
    if (result.getTime() <= now) {
      result.setHours(result.getHours() + 1, 0, 0, 0);
    }
    for (let guard = 0; guard < 48; guard += 1) {
      const minutes = (result.getHours() * 60) + result.getMinutes();
      if (minutes < safeStart) {
        result.setHours(startHours, startMins, 0, 0);
        continue;
      }
      if (minutes >= endBound) {
        result.setDate(result.getDate() + 1);
        result.setHours(startHours, startMins, 0, 0);
        continue;
      }
      if (result.getTime() <= now) {
        result.setHours(result.getHours() + 1, 0, 0, 0);
        continue;
      }
      break;
    }
    return result.getTime();
  }

  result.setHours(startHours, startMins, 0, 0);
  if (result.getTime() <= now) {
    const incrementDays = frequency === 'weekly' ? 7 : 1;
    result.setDate(result.getDate() + incrementDays);
    result.setHours(startHours, startMins, 0, 0);
  }
  return result.getTime();
}

function computeNextRunAt(schedule, nowMs = Date.now()) {
  if (!schedule?.enabled) return null;
  const normalized = normalizeScheduleState(schedule);
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const frequency = normalized.frequency && SCHEDULE_INTERVALS[normalized.frequency]
    ? normalized.frequency
    : SCHEDULE_DEFAULTS.frequency || 'weekly';
  const windowMinutes = getWindowMinutes(normalized.timeWindow);
  const persistedNext = safeNumber(normalized.nextRunAt);
  if (persistedNext && persistedNext > now) {
    return alignWithinWindow(persistedNext, frequency, windowMinutes, now);
  }
  const lastRunAt = safeNumber(normalized.lastRunAt);
  if (lastRunAt) {
    const interval = SCHEDULE_INTERVALS[frequency] ?? SCHEDULE_INTERVALS.daily;
    return alignWithinWindow(lastRunAt + interval, frequency, windowMinutes, now);
  }
  return alignWithinWindow(now, frequency, windowMinutes, now);
}

function clearScheduleTimers() {
  if (scheduleTimeoutId) {
    clearTimeout(scheduleTimeoutId);
    scheduleTimeoutId = null;
  }
  if (scheduleIntervalId) {
    clearInterval(scheduleIntervalId);
    scheduleIntervalId = null;
  }
}

function formatFrequencyLabel(frequency) {
  return SCHEDULE_LABELS[frequency] || frequency || 'personnalisée';
}

function armScheduleTimers(state, schedule, targetTimestamp) {
  clearScheduleTimers();
  if (!Number.isFinite(targetTimestamp)) return;
  const delay = Math.max(0, targetTimestamp - Date.now());
  scheduleTimeoutId = window.setTimeout(() => {
    triggerScheduledAudit(state);
  }, delay);
  scheduleIntervalId = window.setInterval(() => {
    const enabled = !!state.get('audit.preferences.schedule.enabled');
    if (!enabled) {
      clearScheduleTimers();
      return;
    }
    const planned = safeNumber(state.get('audit.preferences.schedule.nextRunAt'));
    if (planned && planned <= Date.now() && !schedulePendingRun) {
      triggerScheduledAudit(state);
    }
  }, 60 * 1000);
}

function triggerScheduledAudit(state) {
  if (scheduleTimeoutId) {
    clearTimeout(scheduleTimeoutId);
    scheduleTimeoutId = null;
  }
  if (schedulePendingRun) return;
  const schedule = normalizeScheduleState(state.get('audit.preferences.schedule'));
  if (!schedule.enabled) {
    clearScheduleTimers();
    return;
  }
  if (state.get('audit.status') === 'running') {
    scheduleTimeoutId = window.setTimeout(() => triggerScheduledAudit(state), 30 * 1000);
    return;
  }
  schedulePendingRun = true;
  clearScheduleTimers();
  const plannedAt = safeNumber(schedule.nextRunAt) ?? Date.now();
  window.a11ytb?.logActivity?.(`Audit planifié lancé (${formatFrequencyLabel(schedule.frequency)})`, {
    module: manifest.id,
    tone: 'info',
    tags: ['audit', 'schedule'],
    payload: {
      type: 'scheduled-audit',
      frequency: schedule.frequency,
      plannedAt
    }
  });
  Promise.resolve()
    .then(() => runAudit({ state }))
    .then((report) => {
      const completedAt = safeNumber(report?.timestamp) ?? Date.now();
      state.set('audit.preferences.schedule.lastRunAt', completedAt);
    })
    .catch((error) => {
      const failureAt = Date.now();
      state.set('audit.preferences.schedule.lastRunAt', failureAt);
      window.a11ytb?.logActivity?.('Audit planifié : échec', {
        module: manifest.id,
        tone: 'alert',
        severity: 'alert',
        tags: ['audit', 'schedule', 'error'],
        payload: {
          type: 'scheduled-audit',
          frequency: schedule.frequency,
          error: error?.message || 'Échec du run planifié'
        }
      });
    })
    .finally(() => {
      schedulePendingRun = false;
    });
}

function handleScheduleChange(snapshot, state) {
  const rawSchedule = snapshot?.audit?.preferences?.schedule ?? {};
  const normalized = normalizeScheduleState(rawSchedule);

  if (rawSchedule?.frequency && rawSchedule.frequency !== normalized.frequency) {
    state.set('audit.preferences.schedule.frequency', normalized.frequency);
    return;
  }

  const rawStart = rawSchedule?.timeWindow?.start;
  if (rawStart !== normalized.timeWindow.start) {
    state.set('audit.preferences.schedule.timeWindow.start', normalized.timeWindow.start);
    return;
  }

  const rawEnd = rawSchedule?.timeWindow?.end;
  if (rawEnd !== normalized.timeWindow.end) {
    state.set('audit.preferences.schedule.timeWindow.end', normalized.timeWindow.end);
    return;
  }

  const rawLast = safeNumber(rawSchedule?.lastRunAt);
  if (rawLast !== normalized.lastRunAt) {
    state.set('audit.preferences.schedule.lastRunAt', normalized.lastRunAt);
    return;
  }

  const rawNext = safeNumber(rawSchedule?.nextRunAt);
  if (rawNext !== normalized.nextRunAt) {
    state.set('audit.preferences.schedule.nextRunAt', normalized.nextRunAt);
    return;
  }

  const signature = JSON.stringify(normalized);
  const timersActive = scheduleTimeoutId !== null || scheduleIntervalId !== null;

  if (!normalized.enabled) {
    clearScheduleTimers();
    if (normalized.nextRunAt !== null) {
      state.set('audit.preferences.schedule.nextRunAt', null);
      return;
    }
    lastScheduleSignature = signature;
    return;
  }

  const nextRunAt = computeNextRunAt(normalized, Date.now());
  if (!Number.isFinite(nextRunAt)) {
    clearScheduleTimers();
    if (normalized.nextRunAt !== null) {
      state.set('audit.preferences.schedule.nextRunAt', null);
      return;
    }
    lastScheduleSignature = signature;
    return;
  }

  if (normalized.nextRunAt !== nextRunAt) {
    state.set('audit.preferences.schedule.nextRunAt', nextRunAt);
    return;
  }

  const changed = signature !== lastScheduleSignature;
  lastScheduleSignature = signature;

  if (changed || !timersActive) {
    armScheduleTimers(state, normalized, nextRunAt);
  }
}

async function runAudit({ state }) {
  updateAuditState(state, { status: 'running', error: null });
  try {
    const axe = await loadAxeCore();
    const raw = await axe.run(document, {
      reporter: 'v2',
      resultTypes: ['violations', 'incomplete', 'passes']
    });
    const normalized = normalizeAxeReport(raw);
    const summary = summarizeReport(normalized);
    updateAuditState(state, {
      status: summary.outcome,
      lastRun: normalized.timestamp,
      lastReport: normalized,
      summary,
      error: null
    });
    window.a11ytb?.logActivity?.(`Audit axe-core : ${summary.logMessage}`, {
      module: manifest.id,
      tone: summary.tone,
      severity: summary.severity,
      tags: ['audit', `impact:${summary.outcome}`],
      payload: {
        type: 'audit-report',
        runAt: normalized.timestamp,
        totals: summary.totals || {},
        outcome: summary.outcome
      }
    });
    return normalized;
  } catch (error) {
    console.error('a11ytb: échec de l’audit axe-core.', error);
    updateAuditState(state, {
      status: 'error',
      error: error?.message || 'Échec de l’audit',
      lastRun: Date.now()
    });
    window.a11ytb?.logActivity?.("Audit axe-core : échec de l’analyse", {
      module: manifest.id,
      tone: 'alert',
      severity: 'alert',
      tags: ['audit', 'error'],
      payload: {
        type: 'audit-report',
        outcome: 'error',
        error: error?.message || 'Échec de l’audit'
      }
    });
    throw error;
  }
}

const auditModule = {
  id: manifest.id,
  manifest,
  init({ state }) {
    ensureAuditState(state);
    const api = {
      analyze: () => runAudit({ state }),
      getLastReport: () => state.get('audit.lastReport'),
      getSummary: () => state.get('audit.summary')
    };
    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.audit = api;
  },
  mount({ state }) {
    ensureAuditState(state);
    if (scheduleUnsubscribe) {
      scheduleUnsubscribe();
      scheduleUnsubscribe = null;
    }
    handleScheduleChange(state.get(), state);
    scheduleUnsubscribe = state.on((snapshot) => handleScheduleChange(snapshot, state));
  },
  unmount() {
    if (window.a11ytb) {
      delete window.a11ytb.audit;
    }
    if (scheduleUnsubscribe) {
      scheduleUnsubscribe();
      scheduleUnsubscribe = null;
    }
    clearScheduleTimers();
    schedulePendingRun = false;
    lastScheduleSignature = '';
  }
};

registerModule(auditModule);

export const __testing = {
  CDN_AXE_CORE_SRC,
  CDN_AXE_CORE_INTEGRITY,
  LOCAL_AXE_CORE_SRC,
  resolveAxe,
  loadAxeFromLocal,
  loadAxeFromCdn,
  loadAxeCore,
  resetAxeLoaders
};
