import { registerModule } from '../registry.js';
import { manifest } from './audit.manifest.js';
import { normalizeAxeReport, summarizeReport } from './audit-report.js';

export { manifest };

const AXE_CORE_VERSION = '4.11.0';
const CDN_AXE_CORE_SRC = `https://cdn.jsdelivr.net/npm/axe-core@${AXE_CORE_VERSION}/axe.min.js`;

let axeLoader = null;
let axeCdnLoader = null;

function resolveAxe(module) {
  const axe = module?.default ?? module?.axe ?? module;
  if (!axe || typeof axe.run !== 'function') {
    throw new Error('axe-core indisponible');
  }
  return axe;
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

function loadAxeCore({ importModule } = {}) {
  if (!axeLoader) {
    const load = importModule || (() => import('axe-core'));
    axeLoader = load()
      .then(resolveAxe)
      .catch((error) => {
        console.warn('a11ytb: import axe-core échoué, tentative via CDN.', error);
        return loadAxeFromCdn();
      })
      .catch((error) => {
        axeLoader = null;
        throw error;
      });
  }
  return axeLoader;
}

function resetAxeLoaders() {
  axeLoader = null;
  axeCdnLoader = null;
}

function ensureAuditState(state) {
  const current = state.get('audit');
  if (!current || typeof current !== 'object') {
    state.set('audit', structuredClone(manifest.defaults.state.audit));
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

export const __testing = {
  CDN_AXE_CORE_SRC,
  resolveAxe,
  loadAxeFromCdn,
  loadAxeCore,
  resetAxeLoaders
};
