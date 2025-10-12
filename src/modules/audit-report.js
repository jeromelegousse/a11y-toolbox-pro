export const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'];

export function normalizeAxeReport(raw = {}, { now = Date.now(), url } = {}) {
  const safeUrl = typeof raw.url === 'string' && raw.url.trim()
    ? raw.url.trim()
    : (typeof url === 'string' ? url : (typeof window !== 'undefined' ? window.location?.href : ''));

  const violations = Array.isArray(raw.violations) ? raw.violations : [];

  const normalizedViolations = violations.map((violation) => {
    const impact = typeof violation.impact === 'string' && violation.impact.trim()
      ? violation.impact.trim().toLowerCase()
      : 'unknown';
    const nodes = Array.isArray(violation.nodes) ? violation.nodes : [];
    return {
      id: violation.id || 'violation',
      impact,
      description: violation.description || violation.help || '',
      help: violation.help || '',
      helpUrl: violation.helpUrl || '',
      tags: Array.isArray(violation.tags) ? violation.tags.slice() : [],
      nodes: nodes.map((node) => ({
        target: Array.isArray(node.target) ? node.target.map(String) : [],
        html: node.html || '',
        failureSummary: node.failureSummary || '',
        impact: typeof node.impact === 'string' && node.impact.trim() ? node.impact.trim().toLowerCase() : impact
      }))
    };
  });

  const passes = Array.isArray(raw.passes) ? raw.passes.length : 0;
  const incomplete = Array.isArray(raw.incomplete) ? raw.incomplete.length : 0;
  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : now;

  return {
    url: safeUrl,
    timestamp,
    violations: normalizedViolations,
    passes,
    incomplete,
    stats: summarizeViolations(normalizedViolations)
  };
}

export function summarizeViolations(violations = []) {
  const totals = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    unknown: 0,
    total: 0
  };

  violations.forEach((violation) => {
    const impact = typeof violation.impact === 'string' ? violation.impact.toLowerCase() : 'unknown';
    const key = IMPACT_ORDER.includes(impact) ? impact : 'unknown';
    totals[key] += 1;
    totals.total += 1;
  });

  return totals;
}

function determineOutcomeFromTotals(totals = {}) {
  if (!totals || typeof totals !== 'object') {
    return 'idle';
  }
  if (totals.total === 0) return 'pass';
  if ((totals.critical ?? 0) > 0) return 'critical';
  if ((totals.serious ?? 0) > 0) return 'serious';
  if ((totals.moderate ?? 0) > 0) return 'moderate';
  if ((totals.minor ?? 0) > 0) return 'minor';
  return 'unknown';
}

function totalsToDetail(totals) {
  const parts = [];
  if ((totals.critical ?? 0) > 0) parts.push(`${totals.critical} critique${totals.critical > 1 ? 's' : ''}`);
  if ((totals.serious ?? 0) > 0) parts.push(`${totals.serious} majeure${totals.serious > 1 ? 's' : ''}`);
  if ((totals.moderate ?? 0) > 0 || (totals.minor ?? 0) > 0) {
    const recos = (totals.moderate ?? 0) + (totals.minor ?? 0);
    if (recos > 0) parts.push(`${recos} recommandation${recos > 1 ? 's' : ''}`);
  }
  if (parts.length === 0) return 'Aucune violation détectée';
  return parts.join(' · ');
}

export function summarizeReport(normalizedReport = {}) {
  const stats = normalizedReport.stats ?? summarizeViolations(normalizedReport.violations ?? []);
  const totalNodes = (normalizedReport.violations ?? []).reduce((acc, violation) => acc + (violation.nodes?.length ?? 0), 0);
  const outcome = determineOutcomeFromTotals(stats);

  let tone = 'info';
  let severity = 'info';
  let headline = 'Analyse effectuée';
  let logMessage = 'Audit réalisé';

  switch (outcome) {
    case 'critical':
      tone = 'alert';
      severity = 'alert';
      headline = `${stats.critical} erreur${stats.critical > 1 ? 's' : ''} critique${stats.critical > 1 ? 's' : ''}`;
      logMessage = `${stats.critical} violation${stats.critical > 1 ? 's' : ''} critique${stats.critical > 1 ? 's' : ''} détectée${stats.critical > 1 ? 's' : ''}`;
      break;
    case 'serious':
      tone = 'warning';
      severity = 'warning';
      headline = `${stats.serious} violation${stats.serious > 1 ? 's' : ''} majeure${stats.serious > 1 ? 's' : ''}`;
      logMessage = `${stats.serious} violation${stats.serious > 1 ? 's' : ''} majeure${stats.serious > 1 ? 's' : ''} détectée${stats.serious > 1 ? 's' : ''}`;
      break;
    case 'moderate':
      tone = 'warning';
      severity = 'warning';
      headline = `${stats.moderate} recommandation${stats.moderate > 1 ? 's' : ''}`;
      logMessage = `${stats.moderate} recommandation${stats.moderate > 1 ? 's' : ''} prioritaire détectée${stats.moderate > 1 ? 's' : ''}`;
      break;
    case 'minor':
      tone = 'info';
      severity = 'info';
      headline = `${stats.minor} recommandation${stats.minor > 1 ? 's' : ''}`;
      logMessage = `${stats.minor} recommandation${stats.minor > 1 ? 's' : ''} détectée${stats.minor > 1 ? 's' : ''}`;
      break;
    case 'pass':
      tone = 'confirm';
      severity = 'success';
      headline = 'Aucune violation détectée';
      logMessage = 'Aucune violation détectée';
      break;
    default:
      headline = 'Audit terminé';
      logMessage = 'Audit terminé';
  }

  return {
    outcome,
    totals: stats,
    totalNodes,
    tone,
    severity,
    headline,
    detail: totalsToDetail(stats),
    logMessage
  };
}

export function formatImpactLabel(impact) {
  switch (impact) {
    case 'critical':
      return 'Critique';
    case 'serious':
      return 'Majeure';
    case 'moderate':
      return 'Modérée';
    case 'minor':
      return 'Mineure';
    default:
      return 'À vérifier';
  }
}

export function formatNodeTargets(node = {}) {
  const targets = Array.isArray(node.target) ? node.target : [];
  if (!targets.length) return '';
  return targets.map((target) => String(target)).join(', ');
}

export function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    return formatter.format(new Date(timestamp));
  } catch (error) {
    return new Date(timestamp).toLocaleString?.('fr-FR') || String(timestamp);
  }
}
