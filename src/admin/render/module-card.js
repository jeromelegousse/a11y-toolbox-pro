import { COMPATIBILITY_LABELS, COMPATIBILITY_TONES } from '../constants.js';
import { collectionLookup } from '../data-model.js';
import { createBadge, createTag, formatDateRelative, formatDuration } from '../utils.js';

function renderFlags(flags) {
  if (!Array.isArray(flags) || !flags.length) {
    return null;
  }
  const list = document.createElement('ul');
  list.className = 'a11ytb-flag-list';
  flags.forEach((flag) => {
    const item = document.createElement('li');
    item.append(createBadge(flag.label, flag.tone || 'info'));
    list.append(item);
  });
  return list;
}

function renderDependencies(entry) {
  const dependencies = Array.isArray(entry.dependencies) ? entry.dependencies : [];
  const compat = entry.compat || {};
  if (
    !dependencies.length &&
    !compat?.missing?.features?.length &&
    !compat?.missing?.browsers?.length
  ) {
    return null;
  }

  const details = document.createElement('details');
  details.className = 'a11ytb-module-insights';
  details.open = entry.statusTone === 'alert';

  const summary = document.createElement('summary');
  summary.textContent = 'Dépendances & compatibilité';
  details.append(summary);

  if (dependencies.length) {
    const depList = document.createElement('ul');
    depList.className = 'a11ytb-dependency-list';
    dependencies.forEach((dependency) => {
      const item = document.createElement('li');
      const title = document.createElement('span');
      title.textContent = dependency.label || dependency.id;
      const tone =
        dependency.tone ||
        (dependency.status === 'ok'
          ? 'confirm'
          : dependency.status === 'missing'
            ? 'alert'
            : 'warning');
      const status = createBadge(dependency.statusLabel || dependency.status || 'Inconnu', tone);
      status.setAttribute('aria-label', dependency.aria || status.textContent);
      item.append(title, status);
      depList.append(item);
    });
    details.append(depList);
  }

  const missingFeatures = compat?.missing?.features || [];
  const missingBrowsers = compat?.missing?.browsers || [];
  if (missingFeatures.length || missingBrowsers.length) {
    const compatSection = document.createElement('div');
    compatSection.className = 'a11ytb-compatibility';
    if (missingFeatures.length) {
      const featuresTitle = document.createElement('h4');
      featuresTitle.textContent = 'Fonctionnalités requises absentes';
      const list = document.createElement('ul');
      missingFeatures.forEach((feature) => {
        const item = document.createElement('li');
        item.textContent = feature;
        list.append(item);
      });
      compatSection.append(featuresTitle, list);
    }
    if (missingBrowsers.length) {
      const browsersTitle = document.createElement('h4');
      browsersTitle.textContent = 'Navigateurs à vérifier';
      const list = document.createElement('ul');
      missingBrowsers.forEach((browser) => {
        const item = document.createElement('li');
        item.textContent = browser;
        list.append(item);
      });
      compatSection.append(browsersTitle, list);
    }
    details.append(compatSection);
  }

  return details;
}

function renderProfileTags(entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'a11ytb-tag-group';
  entry.profiles.slice(0, 4).forEach((profileId) => {
    wrapper.append(createTag(profileId));
  });
  if (entry.profiles.length > 4) {
    wrapper.append(createTag(`+${entry.profiles.length - 4}`));
  }
  return wrapper;
}

function renderCollectionTags(entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'a11ytb-tag-group';
  entry.collections.slice(0, 4).forEach((collectionId) => {
    const data = collectionLookup.get(collectionId);
    const label = data?.label || collectionId;
    const tag = createTag(label);
    const fullLabel = data?.pathLabel || label;
    tag.title = fullLabel;
    tag.setAttribute('aria-label', fullLabel);
    wrapper.append(tag);
  });
  if (entry.collections.length > 4) {
    wrapper.append(createTag(`+${entry.collections.length - 4}`));
  }
  return wrapper;
}

function renderMetrics(entry) {
  const list = document.createElement('dl');
  list.className = 'a11ytb-metric-list';

  const attempts = entry.metrics.attempts || 0;
  const successes = entry.metrics.successes || 0;
  const failures = entry.metrics.failures || 0;
  const lastAttempt = entry.metrics.lastAttemptAt || entry.runtime.lastAttemptAt;

  const metricsEntries = [
    ['Chargements', `${successes}/${attempts}`],
    ['Échecs', failures.toString()],
    ['Temps moyen', formatDuration(entry.metrics.timings?.combinedAverage)],
    ['Dernière tentative', formatDateRelative(lastAttempt)],
  ];

  metricsEntries.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  });

  return list;
}

export function createModuleCard(entry, actions) {
  const row = document.createElement('tr');
  row.dataset.moduleId = entry.id;
  row.dataset.compat = entry.compatStatus;

  const nameCell = document.createElement('th');
  nameCell.scope = 'row';

  const title = document.createElement('strong');
  title.textContent = entry.manifest.name || entry.id;
  nameCell.append(title);

  const description = document.createElement('p');
  description.className = 'description';
  description.textContent = entry.manifest.description || 'Description à venir.';
  nameCell.append(description);

  const flags = renderFlags(entry.flags);
  if (flags) {
    nameCell.append(flags);
  }

  const dependencyDetails = renderDependencies(entry);
  if (dependencyDetails) {
    nameCell.append(dependencyDetails);
  }

  const statusCell = document.createElement('td');
  const statusBadge = createBadge(entry.status, entry.statusTone);
  statusBadge.setAttribute('aria-label', `Statut : ${entry.status}`);
  statusCell.append(statusBadge);

  const compatCell = document.createElement('td');
  const compatBadge = createBadge(
    COMPATIBILITY_LABELS[entry.compatStatus] || COMPATIBILITY_LABELS.none,
    COMPATIBILITY_TONES[entry.compatStatus] || COMPATIBILITY_TONES.none
  );
  compatBadge.setAttribute('aria-label', `Compatibilité : ${compatBadge.textContent}`);
  compatCell.append(compatBadge);

  const profileCell = document.createElement('td');
  profileCell.append(renderProfileTags(entry));

  const collectionCell = document.createElement('td');
  collectionCell.append(renderCollectionTags(entry));

  const metricsCell = document.createElement('td');
  metricsCell.append(renderMetrics(entry));

  const actionsCell = document.createElement('td');
  actionsCell.className = 'column-actions';

  if (actions?.canToggle(entry)) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'button button-small';
    toggle.textContent = entry.enabled ? 'Suspendre' : 'Activer';
    toggle.addEventListener('click', () => {
      actions.toggleEnabled(entry);
    });
    actionsCell.append(toggle);
  }

  if (actions?.canPin(entry)) {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'button-link';
    pin.textContent = entry.isPinned ? 'Désépingler' : 'Épingler';
    pin.addEventListener('click', () => {
      actions.togglePin(entry);
    });
    actionsCell.append(pin);
  }

  row.append(
    nameCell,
    statusCell,
    compatCell,
    profileCell,
    collectionCell,
    metricsCell,
    actionsCell
  );

  return row;
}
