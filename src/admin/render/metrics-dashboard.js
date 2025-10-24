import { formatDateRelative, formatDuration, createBadge } from '../utils.js';

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  if (value >= 99 || value === 0) {
    return `${Math.round(value)} %`;
  }
  return `${value.toFixed(1)} %`;
}

function formatIncidentSummary(incidents = {}) {
  const total = incidents.total || 0;
  if (!total) {
    return '0';
  }
  const parts = [];
  if (incidents.errors) {
    parts.push(`${incidents.errors} crit.`);
  }
  if (incidents.warnings) {
    parts.push(`${incidents.warnings} avert.`);
  }
  return parts.length ? `${total} (${parts.join(' · ')})` : `${total}`;
}

function triggerDownload(filename, content, mime) {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  } catch (error) {
    console.warn('a11ytb: impossible de générer le fichier de métriques.', error);
  }
}

function buildSummaryCard(label, value) {
  const card = document.createElement('div');
  card.className = 'card a11ytb-metric-card';

  const title = document.createElement('h3');
  title.className = 'a11ytb-metric-title';
  title.textContent = label;

  const metric = document.createElement('p');
  metric.className = 'a11ytb-metric-value';
  metric.textContent = value;

  card.append(title, metric);
  return card;
}

function formatCsvValue(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (/[,"\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function createMetricsDashboard(elements = {}) {
  const {
    status,
    summary,
    empty,
    table,
    tableBody,
    tableEmpty,
    latencyList,
    latencyEmpty,
    incidentsList,
    incidentsEmpty,
    collectionsList,
    collectionsEmpty,
    exports: exportControls = {},
  } = elements;

  const jsonButton = exportControls.json || null;
  const csvButton = exportControls.csv || null;

  let currentOverview = null;

  function setExportAvailability(enabled) {
    if (jsonButton) {
      jsonButton.disabled = !enabled;
    }
    if (csvButton) {
      csvButton.disabled = !enabled;
    }
  }

  function renderSummary(overview) {
    if (!summary) return;
    summary.innerHTML = '';
    const cards = [
      buildSummaryCard('Modules observés', String(overview.totals.modules || 0)),
      buildSummaryCard('Taux de succès', formatPercent(overview.totals.successRate)),
      buildSummaryCard('Latence moyenne', formatDuration(overview.totals.latency?.combinedAverage)),
      buildSummaryCard('Incidents cumulés', formatIncidentSummary(overview.incidents)),
    ];
    cards.forEach((card) => summary.append(card));
  }

  function renderFailureTable(overview) {
    if (!table || !tableBody || !tableEmpty) return;
    tableBody.innerHTML = '';

    if (!overview.topFailures.length) {
      table.setAttribute('aria-hidden', 'true');
      tableEmpty.hidden = false;
      return;
    }

    table.removeAttribute('aria-hidden');
    tableEmpty.hidden = true;

    overview.topFailures.forEach((entry) => {
      const row = document.createElement('tr');

      const moduleCell = document.createElement('th');
      moduleCell.scope = 'row';
      moduleCell.textContent = entry.label;

      const attemptsCell = document.createElement('td');
      attemptsCell.textContent = String(entry.attempts || 0);

      const failuresCell = document.createElement('td');
      failuresCell.textContent = String(entry.failures || 0);

      const rateCell = document.createElement('td');
      rateCell.textContent = formatPercent(entry.failureRate);

      const latencyCell = document.createElement('td');
      latencyCell.textContent = formatDuration(entry.latency?.combinedAverage);

      const incidentsCell = document.createElement('td');
      incidentsCell.textContent = formatIncidentSummary(entry.incidents);

      row.append(moduleCell, attemptsCell, failuresCell, rateCell, latencyCell, incidentsCell);
      tableBody.append(row);
    });
  }

  function renderLatencyList(overview) {
    if (!latencyList || !latencyEmpty) return;
    latencyList.innerHTML = '';
    if (!overview.topLatency.length) {
      latencyEmpty.hidden = false;
      return;
    }
    latencyEmpty.hidden = true;

    overview.topLatency.forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-metrics-item';

      const label = document.createElement('span');
      label.className = 'a11ytb-metrics-item-label';
      label.textContent = entry.label;

      const value = document.createElement('span');
      value.className = 'a11ytb-metrics-item-value';
      value.textContent = formatDuration(entry.latency?.combinedAverage);

      const meta = document.createElement('span');
      meta.className = 'a11ytb-metrics-item-meta';
      meta.textContent = `${entry.attempts || 0} tentative(s)`;

      item.append(label, value, meta);
      latencyList.append(item);
    });
  }

  function renderIncidentList(overview) {
    if (!incidentsList || !incidentsEmpty) return;
    incidentsList.innerHTML = '';
    const recent = Array.isArray(overview.incidents?.recent) ? overview.incidents.recent : [];
    if (!recent.length) {
      incidentsEmpty.hidden = false;
      return;
    }
    incidentsEmpty.hidden = true;

    recent.forEach((incident) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-metrics-item';

      const header = document.createElement('div');
      header.className = 'a11ytb-metrics-item-header';

      const label = document.createElement('span');
      label.className = 'a11ytb-metrics-item-label';
      label.textContent = incident.moduleLabel || incident.moduleId;

      const badge = createBadge(
        incident.severity === 'warning' ? 'Avertissement' : 'Critique',
        incident.severity === 'warning' ? 'warning' : 'alert'
      );
      badge.classList.add('a11ytb-metrics-badge');

      header.append(label, badge);

      const message = document.createElement('p');
      message.className = 'a11ytb-metrics-item-message';
      message.textContent = incident.message || 'Signalement récent.';

      const meta = document.createElement('span');
      meta.className = 'a11ytb-metrics-item-meta';
      meta.textContent = formatDateRelative(incident.at);

      item.append(header, message, meta);
      incidentsList.append(item);
    });
  }

  function renderCollections(overview) {
    if (!collectionsList || !collectionsEmpty) return;
    collectionsList.innerHTML = '';
    if (!overview.collections.length) {
      collectionsEmpty.hidden = false;
      return;
    }
    collectionsEmpty.hidden = true;

    overview.collections.forEach((collection) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-metrics-item';

      const label = document.createElement('span');
      label.className = 'a11ytb-metrics-item-label';
      label.textContent = collection.label || collection.id;

      const value = document.createElement('span');
      value.className = 'a11ytb-metrics-item-value';
      value.textContent = `${collection.modules || 0} module(s)`;

      const meta = document.createElement('span');
      meta.className = 'a11ytb-metrics-item-meta';
      const parts = [`${formatPercent(collection.successRate)} succès`];
      if (collection.failures) {
        parts.push(`${collection.failures} échec(s)`);
      }
      if (collection.incidentCount) {
        parts.push(`${collection.incidentCount} incident(s)`);
      }
      meta.textContent = parts.join(' · ');

      item.append(label, value, meta);
      collectionsList.append(item);
    });
  }

  function renderStatusText(overview) {
    if (!status) return;
    const attempts = overview.totals.attempts || 0;
    const successes = overview.totals.successes || 0;
    const failures = overview.totals.failures || 0;
    const offline = overview.totals.network?.offline || 0;
    const updated = formatDateRelative(overview.updatedAt);
    const syncParts = [];
    if (overview.sync?.activeWindows) {
      syncParts.push(`${overview.sync.activeWindows} fenêtre(s) actives`);
    }
    if (overview.sync?.pendingQueue) {
      syncParts.push(`${overview.sync.pendingQueue} en file d’attente`);
    }
    const syncLabel = syncParts.length ? ` · ${syncParts.join(' · ')}` : '';
    const offlineLabel = offline
      ? `${offline} ressource(s) hors ligne`
      : 'Aucune ressource hors ligne';
    const target = status.querySelector('p') || status;
    target.textContent = `Tentatives cumulées : ${attempts} (${successes} succès, ${failures} échecs). Dernière mise à jour : ${updated}. ${offlineLabel}${syncLabel}.`;
  }

  function exportJson() {
    if (!currentOverview) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      totals: currentOverview.totals,
      modules: currentOverview.modules,
      collections: currentOverview.collections,
    };
    triggerDownload(
      'a11ytb-metrics.json',
      `${JSON.stringify(payload, null, 2)}\n`,
      'application/json'
    );
  }

  function exportCsv() {
    if (!currentOverview) return;
    const headers = [
      'moduleId',
      'moduleLabel',
      'attempts',
      'successes',
      'failures',
      'successRate',
      'failureRate',
      'latencyCombinedMs',
      'latencyLoadMs',
      'latencyInitMs',
      'incidents',
      'incidentWarnings',
      'incidentErrors',
      'networkRequests',
      'networkHits',
      'networkOffline',
    ];
    const rows = currentOverview.modules.map((module) => [
      module.id,
      module.label,
      module.attempts,
      module.successes,
      module.failures,
      Number.isFinite(module.successRate) ? module.successRate.toFixed(2) : '',
      Number.isFinite(module.failureRate) ? module.failureRate.toFixed(2) : '',
      Number.isFinite(module.latency?.combinedAverage)
        ? module.latency.combinedAverage.toFixed(2)
        : '',
      Number.isFinite(module.latency?.loadAverage) ? module.latency.loadAverage.toFixed(2) : '',
      Number.isFinite(module.latency?.initAverage) ? module.latency.initAverage.toFixed(2) : '',
      module.incidents?.total ?? 0,
      module.incidents?.warnings ?? 0,
      module.incidents?.errors ?? 0,
      module.network?.requests ?? 0,
      module.network?.hits ?? 0,
      module.network?.offline ?? 0,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => formatCsvValue(value)).join(','))
      .join('\n');

    triggerDownload('a11ytb-metrics.csv', `${csv}\n`, 'text/csv');
  }

  if (jsonButton) {
    jsonButton.addEventListener('click', () => exportJson());
  }
  if (csvButton) {
    csvButton.addEventListener('click', () => exportCsv());
  }

  return {
    update(overview) {
      currentOverview = overview;
      if (!overview || !Array.isArray(overview.modules) || overview.modules.length === 0) {
        setExportAvailability(false);
        if (summary) summary.innerHTML = '';
        if (tableBody) tableBody.innerHTML = '';
        if (latencyList) latencyList.innerHTML = '';
        if (incidentsList) incidentsList.innerHTML = '';
        if (collectionsList) collectionsList.innerHTML = '';
        if (tableEmpty) tableEmpty.hidden = false;
        if (latencyEmpty) latencyEmpty.hidden = false;
        if (incidentsEmpty) incidentsEmpty.hidden = false;
        if (collectionsEmpty) collectionsEmpty.hidden = false;
        if (table) table.setAttribute('aria-hidden', 'true');
        if (empty) empty.hidden = false;
        if (status) {
          const target = status.querySelector('p') || status;
          target.textContent = 'En attente de données métriques.';
        }
        return;
      }

      if (empty) empty.hidden = true;
      setExportAvailability(true);
      renderSummary(overview);
      renderFailureTable(overview);
      renderLatencyList(overview);
      renderIncidentList(overview);
      renderCollections(overview);
      renderStatusText(overview);
    },
  };
}
