export function renderStatusCards(container, summaries) {
  container.innerHTML = '';
  summaries.forEach((summary) => {
    const card = document.createElement('article');
    card.className = 'a11ytb-status-card';
    card.dataset.tone = summary.tone || 'info';

    const header = document.createElement('header');
    header.className = 'a11ytb-status-card-header';

    const label = document.createElement('span');
    label.className = 'a11ytb-status-label';
    label.textContent = summary.label || summary.id || '';

    const badge = document.createElement('span');
    badge.className = 'a11ytb-badge';
    if (summary.badge) {
      badge.textContent = summary.badge;
    } else {
      badge.hidden = true;
    }

    header.append(label, badge);

    const value = document.createElement('p');
    value.className = 'a11ytb-status-value';
    value.textContent = summary.value || '';
    value.setAttribute('aria-live', summary.live || 'polite');

    const detail = document.createElement('p');
    detail.className = 'a11ytb-status-detail';
    detail.textContent = summary.detail || '';
    detail.hidden = !summary.detail;

    const meta = document.createElement('dl');
    meta.className = 'a11ytb-status-meta';
    if (summary.metaLabels?.latency) {
      const dtLatency = document.createElement('dt');
      dtLatency.textContent = summary.metaLabels.latency;
      const ddLatency = document.createElement('dd');
      ddLatency.textContent = summary.insights?.latencyLabel || 'Non mesuré';
      meta.append(dtLatency, ddLatency);
    }
    if (summary.metaLabels?.compat) {
      const dtCompat = document.createElement('dt');
      dtCompat.textContent = summary.metaLabels.compat;
      const ddCompat = document.createElement('dd');
      ddCompat.textContent = summary.insights?.compatLabel || 'Pré-requis non déclarés';
      meta.append(dtCompat, ddCompat);
    }

    card.append(header, value, detail, meta);
    container.append(card);
  });
}
