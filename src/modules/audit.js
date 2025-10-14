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
  CDN_AXE_CORE_INTEGRITY,
  LOCAL_AXE_CORE_SRC,
  resolveAxe,
  loadAxeFromLocal,
  loadAxeFromCdn,
  loadAxeCore,
  resetAxeLoaders
};
