const STATUS_LABELS = {
  ok: 'OK',
  missing: 'Manquant',
  incompatible: 'Version incompatible'
};

function normalizeDependencies(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({ ...entry }));
}

export function summarizeDependencyLiveMessage(dependencies = [], moduleName) {
  const normalized = normalizeDependencies(dependencies);
  if (!normalized.length) {
    return moduleName
      ? `${moduleName} ne déclare aucune dépendance.`
      : 'Ce module ne déclare aucune dépendance.';
  }
  const conflicts = normalized.filter((entry) => entry.status && entry.status !== 'ok');
  if (!conflicts.length) {
    return moduleName
      ? `Toutes les dépendances de ${moduleName} sont satisfaites.`
      : 'Toutes les dépendances sont satisfaites.';
  }
  if (conflicts.length === 1) {
    const single = conflicts[0];
    return single.aria || single.message || `Dépendance à vérifier : ${single.label || single.id || ''}`;
  }
  const detail = conflicts
    .map((entry) => entry.aria || entry.message || `${entry.label || entry.id || 'Dépendance'} en conflit.`)
    .join(' ');
  return moduleName
    ? `Plusieurs dépendances de ${moduleName} sont en conflit. ${detail}`
    : `Plusieurs dépendances sont en conflit. ${detail}`;
}

export function updateDependencyDisplay(view, dependencies = [], { moduleName } = {}) {
  if (!view || !view.list || !view.summary || !view.live) return { summary: '', live: '' };
  const normalized = normalizeDependencies(dependencies);
  const list = view.list;
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }
  const doc = list.ownerDocument || (typeof document !== 'undefined' ? document : null);

  normalized.forEach((entry) => {
    if (!doc) return;
    const item = doc.createElement('li');
    item.className = 'a11ytb-admin-dependency';
    if (entry.status) {
      item.dataset.status = entry.status;
    }

    const header = doc.createElement('div');
    header.className = 'a11ytb-admin-dependency-header';

    const name = doc.createElement('span');
    name.className = 'a11ytb-admin-dependency-name';
    name.textContent = entry.label || entry.name || entry.id || 'Dépendance';
    header.append(name);

    const badge = doc.createElement('span');
    badge.className = 'a11ytb-admin-dependency-badge';
    if (entry.status) {
      badge.dataset.status = entry.status;
    }
    badge.textContent = entry.statusLabel || STATUS_LABELS[entry.status] || entry.status || '';
    header.append(badge);

    item.append(header);

    const message = entry.message || '';
    if (message) {
      const detail = doc.createElement('p');
      detail.className = 'a11ytb-admin-dependency-message';
      detail.textContent = message;
      item.append(detail);
    }

    list.append(item);
  });

  let summaryText;
  const hasDependencies = normalized.length > 0;
  if (!hasDependencies) {
    summaryText = 'Ce module ne déclare aucune dépendance.';
  } else {
    const conflicts = normalized.filter((entry) => entry.status && entry.status !== 'ok');
    if (!conflicts.length) {
      summaryText = 'Toutes les dépendances sont satisfaites.';
    } else if (conflicts.length === 1) {
      summaryText = conflicts[0].message || `Dépendance à vérifier : ${conflicts[0].label || conflicts[0].id}`;
    } else {
      const names = conflicts.map((entry) => entry.label || entry.id).filter(Boolean).join(', ');
      summaryText = `${conflicts.length} dépendances nécessitent une action : ${names}.`;
    }
  }

  view.summary.textContent = summaryText;
  if (view.wrapper) {
    if (hasDependencies) {
      view.wrapper.hidden = false;
      view.wrapper.classList.add('a11ytb-admin-dependencies');
    } else {
      view.wrapper.hidden = true;
      view.wrapper.classList.remove('a11ytb-admin-dependencies');
    }
  }

  const liveMessage = summarizeDependencyLiveMessage(normalized, moduleName);
  view.live.textContent = liveMessage;

  return { summary: summaryText, live: liveMessage };
}

export const __TEST_ONLY__ = {
  STATUS_LABELS,
  normalizeDependencies
};
