import { formatDuration } from './utils.js';
import { buildSparklinePath } from './visualizations.js';

const HISTORY_LENGTH = 12;
const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 32;

export function buildRuntimePanel() {
  const panel = document.createElement('aside');
  panel.className = 'a11ytb-runtime-panel';

  const title = document.createElement('h2');
  title.className = 'a11ytb-runtime-title';
  title.textContent = 'Observabilité runtime';

  const counters = document.createElement('dl');
  counters.className = 'a11ytb-runtime-counters';

  const entries = [
    ['Modules suivis', 'total'],
    ['Actifs', 'active'],
    ['Épinglés', 'pinned'],
    ['Désactivés', 'disabled'],
    ['Chargés', 'loaded'],
    ['Tentatives', 'attempts'],
    ['Échecs', 'failures'],
    ['Requêtes réseau', 'networkRequests'],
    ['Cache (hits)', 'networkHits'],
    ['Ressources hors ligne', 'networkOffline'],
  ];

  const counterRefs = {};
  entries.forEach(([label, key]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = '0';
    dd.id = `a11ytb-runtime-${key}`;
    counterRefs[key] = dd;
    counters.append(dt, dd);
  });

  const meterLabel = document.createElement('span');
  meterLabel.className = 'a11ytb-runtime-meter-label';
  meterLabel.textContent = 'Ratio de succès';

  const meter = document.createElement('div');
  meter.className = 'a11ytb-runtime-meter';
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  meter.setAttribute('aria-valuetext', 'Aucun chargement observé');

  const figure = document.createElement('figure');
  figure.className = 'a11ytb-runtime-figure';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('a11ytb-runtime-sparkline');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', '');
  svg.append(path);

  const figCaption = document.createElement('figcaption');
  figCaption.className = 'a11ytb-runtime-caption';
  figCaption.textContent = 'Latence moyenne en attente de données.';

  figure.append(svg, figCaption);

  const liveRegion = document.createElement('p');
  liveRegion.className = 'a11ytb-sr-only';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.textContent = 'En attente de données runtime.';

  panel.append(title, counters, meterLabel, meter, figure, liveRegion);

  return {
    element: panel,
    counters: counterRefs,
    meter,
    status: liveRegion,
    sparkline: path,
    caption: figCaption,
    history: [],
  };
}

export function updateRuntimePanel(panel, entries) {
  const total = entries.length;
  const active = entries.filter((entry) => entry.enabled).length;
  const pinned = entries.filter((entry) => entry.isPinned).length;
  const disabled = entries.filter((entry) => entry.isDisabled || !entry.enabled).length;
  const loaded = entries.filter(
    (entry) => entry.runtime.loaded || entry.runtime.state === 'ready'
  ).length;
  const attempts = entries.reduce((acc, entry) => acc + (entry.metrics.attempts || 0), 0);
  const successes = entries.reduce((acc, entry) => acc + (entry.metrics.successes || 0), 0);
  const failures = entries.reduce((acc, entry) => acc + (entry.metrics.failures || 0), 0);
  const networkRequests = entries.reduce(
    (acc, entry) => acc + (entry.runtime.network?.requests || 0),
    0
  );
  const networkHits = entries.reduce((acc, entry) => acc + (entry.runtime.network?.hits || 0), 0);
  const networkOffline = entries.reduce((acc, entry) => {
    const resources = entry.runtime.network?.resources || [];
    return (
      acc + resources.filter((resource) => resource.offline || resource.status === 'offline').length
    );
  }, 0);

  panel.counters.total.textContent = total.toString();
  panel.counters.active.textContent = active.toString();
  panel.counters.pinned.textContent = pinned.toString();
  panel.counters.disabled.textContent = disabled.toString();
  panel.counters.loaded.textContent = loaded.toString();
  panel.counters.attempts.textContent = attempts.toString();
  panel.counters.failures.textContent = failures.toString();
  panel.counters.networkRequests.textContent = networkRequests.toString();
  panel.counters.networkHits.textContent = networkHits.toString();
  panel.counters.networkOffline.textContent = networkOffline.toString();

  const totalOutcomes = successes + failures;
  const successRatio = totalOutcomes > 0 ? Math.round((successes / totalOutcomes) * 100) : 0;
  panel.meter.style.setProperty('--a11ytb-meter-progress', `${successRatio}%`);
  panel.meter.setAttribute('aria-valuenow', successRatio.toString());
  panel.meter.setAttribute(
    'aria-valuetext',
    `${successes} chargement(s) réussi(s) sur ${totalOutcomes}`
  );
  panel.status.textContent = total
    ? `Modules actifs : ${active} sur ${total}. Chargements réussis à ${successRatio} %. Requêtes réseau : ${networkRequests}.`
    : 'En attente de données runtime.';

  const combinedTimings = entries
    .map((entry) => entry.metrics.timings?.combinedAverage)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (combinedTimings.length) {
    const average = combinedTimings.reduce((acc, value) => acc + value, 0) / combinedTimings.length;
    panel.history.push(average);
    if (panel.history.length > HISTORY_LENGTH) {
      panel.history.shift();
    }
    panel.caption.textContent = `Latence moyenne modules : ${formatDuration(average)} (échantillon ${combinedTimings.length}).`;
  }
  if (!panel.history.length) {
    panel.caption.textContent = 'Latence moyenne en attente de données.';
  }
  panel.sparkline.setAttribute(
    'd',
    buildSparklinePath(panel.history, SPARKLINE_WIDTH, SPARKLINE_HEIGHT)
  );
}
