import { formatImpactLabel, formatNodeTargets, formatTimestamp } from './audit-report.js';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/"/g, '&quot;');
}

export function renderAuditStats(summary = {}, options = {}) {
  const totals = summary?.totals ?? {};
  const critical = totals.critical ?? 0;
  const serious = totals.serious ?? 0;
  const moderate = totals.moderate ?? 0;
  const minor = totals.minor ?? 0;
  const total = totals.total ?? 0;
  const totalNodes = summary?.totalNodes ?? 0;
  const schedule = options?.schedule ?? {};
  let scheduleNote = '';
  if (schedule?.enabled) {
    const nextRunTs = typeof schedule.nextRunAt === 'number' ? schedule.nextRunAt : null;
    if (Number.isFinite(nextRunTs)) {
      const formatted = formatTimestamp(nextRunTs);
      if (formatted) {
        scheduleNote = `<p class="a11ytb-note" data-ref="audit-next-run">Prochain audit planifié : ${escapeHtml(formatted)}</p>`;
      }
    }
  }

  return `
    <dl class="a11ytb-summary" data-total-violations="${total}" data-total-nodes="${totalNodes}">
      <div>
        <dt>Critiques</dt>
        <dd>${critical}</dd>
      </div>
      <div>
        <dt>Majeures</dt>
        <dd>${serious}</dd>
      </div>
      <div>
        <dt>Recommandations</dt>
        <dd>${moderate + minor}</dd>
      </div>
      <div>
        <dt>Cibles analysées</dt>
        <dd>${totalNodes}</dd>
      </div>
    </dl>
    ${scheduleNote}
  `;
}

function renderNode(node, index) {
  const target = formatNodeTargets(node) || '(cible inconnue)';
  const summary = node?.failureSummary ? `<p>${escapeHtml(node.failureSummary)}</p>` : '';
  return `
    <li>
      <span class="a11ytb-chip" aria-label="Cible ${index + 1}"><code>${escapeHtml(target)}</code></span>
      ${summary}
    </li>
  `;
}

export function renderAuditViolations(report = {}) {
  const violations = Array.isArray(report?.violations) ? report.violations : [];
  if (!violations.length) {
    return '<p class="a11ytb-note" data-empty="true">Aucune violation détectée. Lancez un audit pour obtenir un rapport.</p>';
  }

  return `
    <ol class="a11ytb-list" data-count="${violations.length}">
      ${violations.map((violation) => {
        const title = escapeHtml(violation.help || violation.description || violation.id);
        const description = violation.description ? `<p>${escapeHtml(violation.description)}</p>` : '';
        const nodes = Array.isArray(violation.nodes) ? violation.nodes : [];
        const nodesMarkup = nodes.length
          ? `<ul class="a11ytb-sublist">${nodes.map((node, index) => renderNode(node, index)).join('')}</ul>`
          : '<p class="a11ytb-note">Aucune cible fournie par axe-core.</p>';
        const helpLink = violation.helpUrl
          ? `<p><a href="${escapeAttribute(violation.helpUrl)}" target="_blank" rel="noopener noreferrer">En savoir plus (axe-core)</a></p>`
          : '';
        return `
          <li>
            <h3>${title} <span class="a11ytb-badge">${formatImpactLabel(violation.impact)}</span></h3>
            ${description}
            ${nodesMarkup}
            ${helpLink}
          </li>
        `;
      }).join('')}
    </ol>
  `;
}

export function buildAuditStatusText(auditState = {}) {
  const status = auditState?.status || 'idle';
  if (status === 'running') {
    return {
      label: 'Analyse en cours…',
      detail: 'axe-core inspecte la page pour détecter les violations.'
    };
  }
  if (status === 'error') {
    return {
      label: 'Erreur lors de l’audit',
      detail: auditState?.error ? String(auditState.error) : 'Impossible de finaliser l’analyse. Réessayez.'
    };
  }
  const summary = auditState?.summary ?? {};
  const label = summary?.headline || 'Audit en attente';
  const timestamp = formatTimestamp(auditState?.lastRun);
  const parts = [];
  if (timestamp) parts.push(`Dernier audit : ${timestamp}`);
  if (summary?.detail) parts.push(summary.detail);
  const schedule = auditState?.preferences?.schedule;
  if (schedule?.enabled) {
    const nextRunTs = typeof schedule.nextRunAt === 'number' ? schedule.nextRunAt : null;
    if (Number.isFinite(nextRunTs)) {
      const formatted = formatTimestamp(nextRunTs);
      if (formatted) parts.push(`Prochain audit planifié : ${formatted}`);
    }
  }
  if (!parts.length) parts.push('Lancez une analyse pour générer un rapport.');
  return {
    label,
    detail: parts.join(' · ')
  };
}

export { escapeHtml };
