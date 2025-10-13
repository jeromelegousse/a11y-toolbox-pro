import { registerModule } from '../registry.js';
import { manifest } from './audit.manifest.js';
import { normalizeAxeReport, summarizeReport } from './audit-report.js';
import { safeClone } from '../utils/safe-clone.js';

export { manifest };

let axeLoader = null;

function loadAxeCore() {
  if (!axeLoader) {
    axeLoader = import('axe-core').then((module) => {
      const axe = module?.default ?? module?.axe ?? module;
      if (!axe || typeof axe.run !== 'function') {
        throw new Error('axe-core indisponible');
      }
      return axe;
    });
  }
  return axeLoader;
}

function ensureAuditState(state) {
  const current = state.get('audit');
  if (!current || typeof current !== 'object') {
    state.set('audit', safeClone(manifest.defaults.state.audit));
  }
}

function updateAuditState(state, patch) {
  const current = state.get('audit') || {};
  state.set('audit', { ...current, ...patch });
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
  unmount() {
    if (window.a11ytb) {
      delete window.a11ytb.audit;
    }
  }
};

registerModule(auditModule);
