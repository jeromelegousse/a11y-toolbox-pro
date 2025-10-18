import { COMPATIBILITY_LABELS, COMPATIBILITY_TONES } from '../constants.js';
import { createBadge, formatDateRelative } from '../utils.js';

function stringifyValue(value) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'undefined') {
    return 'Indéfini';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString();
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function renderValueBlock(text) {
  const pre = document.createElement('pre');
  pre.className = 'a11ytb-admin-manifest-diff-value';
  pre.textContent = text;
  return pre;
}

function buildDiffSection(title, items, type) {
  const section = document.createElement('section');
  section.className = `a11ytb-admin-manifest-diff-section a11ytb-admin-manifest-diff-section--${type}`;

  const heading = document.createElement('h4');
  heading.className = 'a11ytb-admin-manifest-diff-section-title';
  heading.textContent = title;
  section.append(heading);

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'a11ytb-admin-manifest-diff-empty';
    empty.textContent = 'Aucune entrée.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('ul');
  list.className = 'a11ytb-admin-manifest-diff-list';
  list.setAttribute('role', 'list');

  items.forEach((item) => {
    const entry = document.createElement('li');
    entry.className = 'a11ytb-admin-manifest-diff-item';

    const path = document.createElement('span');
    path.className = 'a11ytb-admin-manifest-diff-path';
    path.textContent = item.path || item.key || 'champ';
    entry.append(path);

    if (type === 'changed') {
      entry.append(renderValueBlock(stringifyValue(item.previous)));
      entry.append(renderValueBlock(stringifyValue(item.next)));
    } else {
      entry.append(renderValueBlock(stringifyValue(item.value)));
    }

    list.append(entry);
  });

  section.append(list);
  return section;
}

function buildPermissions(manifest) {
  const permissions = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  const container = document.createElement('div');
  container.className = 'a11ytb-admin-manifest-diff-permissions';
  if (!permissions.length) {
    const empty = document.createElement('span');
    empty.className = 'a11ytb-admin-manifest-diff-permission-empty';
    empty.textContent = 'Aucune permission déclarée';
    container.append(empty);
    return container;
  }
  permissions.slice(0, 8).forEach((permission) => {
    const badge = createBadge(permission, 'info');
    badge.classList.add('a11ytb-admin-manifest-diff-permission');
    container.append(badge);
  });
  if (permissions.length > 8) {
    const more = createBadge(`+${permissions.length - 8}`, 'muted');
    more.classList.add('a11ytb-admin-manifest-diff-permission');
    container.append(more);
  }
  return container;
}

export function renderManifestDiff(container, summary, moduleEntry, handlers = {}) {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const diffInsight = summary?.insights?.manifestDiff;
  if (!diffInsight) {
    container.hidden = true;
    return;
  }

  container.hidden = false;

  const latest = diffInsight.latest || {};
  const previous = diffInsight.previous || {};
  const latestManifest = latest.snapshot || {};
  const previousManifest = previous.snapshot || {};

  const header = document.createElement('header');
  header.className = 'a11ytb-admin-manifest-diff-header';

  const title = document.createElement('h3');
  title.className = 'a11ytb-admin-manifest-diff-title';
  title.textContent = diffInsight.moduleLabel || diffInsight.moduleId;

  const version = document.createElement('p');
  version.className = 'a11ytb-admin-manifest-diff-version';
  const fromVersion = previous.version || previousManifest.version || '—';
  const toVersion = latest.version || latestManifest.version || '—';
  version.textContent = `Version ${fromVersion} → ${toVersion}`;

  const timestamp = Number.isFinite(latest.timestamp) ? latest.timestamp : null;
  const subtitle = document.createElement('p');
  subtitle.className = 'a11ytb-admin-manifest-diff-subtitle';
  subtitle.textContent = timestamp ? `Mise à jour ${formatDateRelative(timestamp)}` : 'Date de mise à jour inconnue';

  header.append(title, version, subtitle);

  const actions = document.createElement('div');
  actions.className = 'a11ytb-admin-manifest-diff-actions';

  if (handlers.onFocusModule && moduleEntry) {
    const focusButton = document.createElement('button');
    focusButton.type = 'button';
    focusButton.className = 'a11ytb-admin-manifest-diff-action';
    focusButton.textContent = 'Afficher dans la grille';
    focusButton.addEventListener('click', () => {
      handlers.onFocusModule(moduleEntry);
    });
    actions.append(focusButton);
  }

  header.append(actions);
  container.append(header);

  const metadata = document.createElement('div');
  metadata.className = 'a11ytb-admin-manifest-diff-meta';

  const quality = latest.metadataQuality || latestManifest.metadataQuality;
  if (quality) {
    const qualityItem = document.createElement('div');
    qualityItem.className = 'a11ytb-admin-manifest-diff-meta-item';
    const label = document.createElement('span');
    label.className = 'a11ytb-admin-manifest-diff-meta-label';
    label.textContent = 'Qualité métadonnées';
    const value = createBadge(quality, 'active');
    value.classList.add('a11ytb-admin-manifest-diff-meta-badge');
    qualityItem.append(label, value);
    metadata.append(qualityItem);
  }

  const compatStatus = moduleEntry?.compatStatus || latestManifest?.compat?.status || 'none';
  const compatItem = document.createElement('div');
  compatItem.className = 'a11ytb-admin-manifest-diff-meta-item';
  const compatLabel = document.createElement('span');
  compatLabel.className = 'a11ytb-admin-manifest-diff-meta-label';
  compatLabel.textContent = 'Compatibilité';
  const compatBadge = createBadge(
    COMPATIBILITY_LABELS[compatStatus] || COMPATIBILITY_LABELS.none,
    COMPATIBILITY_TONES[compatStatus] || COMPATIBILITY_TONES.none
  );
  compatBadge.classList.add('a11ytb-admin-manifest-diff-meta-badge');
  compatItem.append(compatLabel, compatBadge);
  metadata.append(compatItem);

  const permissionsBlock = document.createElement('div');
  permissionsBlock.className = 'a11ytb-admin-manifest-diff-meta-item';
  const permissionsLabel = document.createElement('span');
  permissionsLabel.className = 'a11ytb-admin-manifest-diff-meta-label';
  permissionsLabel.textContent = 'Permissions';
  permissionsBlock.append(permissionsLabel, buildPermissions(latestManifest));
  metadata.append(permissionsBlock);

  container.append(metadata);

  const diffSections = [
    {
      title: 'Champs ajoutés',
      items: Array.isArray(diffInsight.diff?.added) ? diffInsight.diff.added : [],
      type: 'added',
    },
    {
      title: 'Champs supprimés',
      items: Array.isArray(diffInsight.diff?.removed) ? diffInsight.diff.removed : [],
      type: 'removed',
    },
    {
      title: 'Champs modifiés',
      items: Array.isArray(diffInsight.diff?.changed) ? diffInsight.diff.changed : [],
      type: 'changed',
    },
  ];

  diffSections.forEach((section) => {
    container.append(buildDiffSection(section.title, section.items.slice(0, 10), section.type));
  });
}
