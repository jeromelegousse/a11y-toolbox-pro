import { COMPATIBILITY_LABELS, COMPATIBILITY_TONES } from '../constants.js';
import { collectionLookup } from '../data-model.js';
import { createBadge, createTag, formatDateRelative, formatDuration } from '../utils.js';

function renderFlags(flags) {
  if (!Array.isArray(flags) || !flags.length) {
    return null;
  }
  const list = document.createElement('div');
  list.className = 'a11ytb-admin-flag-row';
  list.setAttribute('role', 'status');
  list.setAttribute('aria-live', 'polite');
  flags.forEach((flag) => {
    const badge = createBadge(flag.label, flag.tone || 'info');
    badge.classList.add('a11ytb-admin-flag');
    list.append(badge);
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
  details.className = 'a11ytb-admin-module-insights';
  details.open = entry.statusTone === 'alert';

  const summary = document.createElement('summary');
  summary.textContent = 'Dépendances & compatibilité';
  details.append(summary);

  if (dependencies.length) {
    const depList = document.createElement('ul');
    depList.className = 'a11ytb-admin-dependency-list';
    dependencies.forEach((dependency) => {
      const item = document.createElement('li');
      item.className = 'a11ytb-admin-dependency-item';
      const title = document.createElement('span');
      title.className = 'a11ytb-admin-dependency-label';
      title.textContent = dependency.label || dependency.id;
      const tone =
        dependency.tone ||
        (dependency.status === 'ok'
          ? 'confirm'
          : dependency.status === 'missing'
            ? 'alert'
            : 'warning');
      const status = createBadge(dependency.statusLabel || dependency.status || 'Inconnu', tone);
      status.classList.add('a11ytb-admin-dependency-badge');
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
    compatSection.className = 'a11ytb-admin-compat-section';
    if (missingFeatures.length) {
      const featuresTitle = document.createElement('h4');
      featuresTitle.textContent = 'Fonctionnalités requises absentes';
      featuresTitle.className = 'a11ytb-admin-compat-title';
      const list = document.createElement('ul');
      list.className = 'a11ytb-admin-compat-list';
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
      browsersTitle.className = 'a11ytb-admin-compat-title';
      const list = document.createElement('ul');
      list.className = 'a11ytb-admin-compat-list';
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

export function createModuleCard(entry, actions) {
  const card = document.createElement('article');
  card.className = 'a11ytb-admin-module-card';
  card.dataset.compat = entry.compatStatus;
  card.setAttribute('role', 'listitem');

  const header = document.createElement('header');
  header.className = 'a11ytb-admin-module-card-header';

  const title = document.createElement('h3');
  title.className = 'a11ytb-admin-module-title';
  title.textContent = entry.manifest.name || entry.id;

  const statusBadge = createBadge(entry.status, entry.statusTone);
  statusBadge.setAttribute('aria-label', `Statut : ${entry.status}`);

  const compatBadge = createBadge(
    COMPATIBILITY_LABELS[entry.compatStatus] || COMPATIBILITY_LABELS.none,
    COMPATIBILITY_TONES[entry.compatStatus] || COMPATIBILITY_TONES.none
  );
  compatBadge.classList.add('a11ytb-admin-compat');
  compatBadge.setAttribute('aria-label', `Compatibilité : ${compatBadge.textContent}`);

  header.append(title, statusBadge, compatBadge);

  const description = document.createElement('p');
  description.className = 'a11ytb-admin-module-description';
  description.textContent = entry.manifest.description || 'Description à venir.';

  const flags = renderFlags(entry.flags);

  const meta = document.createElement('div');
  meta.className = 'a11ytb-admin-module-meta';

  const profileGroup = document.createElement('div');
  profileGroup.className = 'a11ytb-admin-module-meta-group';
  const profileLabel = document.createElement('span');
  profileLabel.className = 'a11ytb-admin-module-meta-label';
  profileLabel.textContent = 'Profils';
  const profileCount = document.createElement('span');
  profileCount.className = 'a11ytb-admin-counter';
  profileCount.textContent = entry.profiles.length.toString();
  profileCount.setAttribute('aria-label', `${entry.profiles.length} profil(s)`);
  const profileTags = document.createElement('div');
  profileTags.className = 'a11ytb-admin-tag-list';
  entry.profiles.slice(0, 4).forEach((profileId) => {
    profileTags.append(createTag(profileId));
  });
  if (entry.profiles.length > 4) {
    profileTags.append(createTag(`+${entry.profiles.length - 4}`));
  }
  profileGroup.append(profileLabel, profileCount, profileTags);

  const collectionGroup = document.createElement('div');
  collectionGroup.className = 'a11ytb-admin-module-meta-group';
  const collectionLabel = document.createElement('span');
  collectionLabel.className = 'a11ytb-admin-module-meta-label';
  collectionLabel.textContent = 'Collections';
  const collectionCount = document.createElement('span');
  collectionCount.className = 'a11ytb-admin-counter';
  collectionCount.textContent = entry.collections.length.toString();
  collectionCount.setAttribute('aria-label', `${entry.collections.length} collection(s)`);
  const collectionTags = document.createElement('div');
  collectionTags.className = 'a11ytb-admin-tag-list';
  entry.collections.slice(0, 4).forEach((collectionId) => {
    const data = collectionLookup.get(collectionId);
    const label = data?.label || collectionId;
    const tag = createTag(label);
    const fullLabel = data?.pathLabel || label;
    tag.title = fullLabel;
    tag.setAttribute('aria-label', fullLabel);
    collectionTags.append(tag);
  });
  if (entry.collections.length > 4) {
    collectionTags.append(createTag(`+${entry.collections.length - 4}`));
  }
  collectionGroup.append(collectionLabel, collectionCount, collectionTags);

  meta.append(profileGroup, collectionGroup);

  const metricsList = document.createElement('dl');
  metricsList.className = 'a11ytb-admin-metrics';

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
    metricsList.append(dt, dd);
  });

  const insights = renderDependencies(entry);

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'a11ytb-admin-actions';

  const enableButton = document.createElement('button');
  enableButton.type = 'button';
  enableButton.className = 'a11ytb-admin-action';
  enableButton.textContent = entry.enabled ? 'Désactiver' : 'Activer';
  enableButton.disabled = !actions.canToggle(entry);
  enableButton.setAttribute('aria-pressed', entry.enabled ? 'true' : 'false');
  enableButton.addEventListener('click', () => actions.toggleEnabled(entry));
  if (enableButton.disabled && entry.collectionDisabled) {
    enableButton.title =
      'Désactivation gérée par une collection : ajustez-la depuis le panneau Collections.';
  }

  const pinButton = document.createElement('button');
  pinButton.type = 'button';
  pinButton.className = 'a11ytb-admin-action';
  pinButton.textContent = entry.isPinned ? 'Retirer l’épingle' : 'Épingler';
  pinButton.disabled = !actions.canPin(entry);
  pinButton.setAttribute('aria-pressed', entry.isPinned ? 'true' : 'false');
  pinButton.addEventListener('click', () => actions.togglePin(entry));
  if (pinButton.disabled && entry.collectionDisabled) {
    pinButton.title = 'Épinglage indisponible lorsque la collection est désactivée.';
  }

  actionsContainer.append(enableButton, pinButton);

  const liveRegion = document.createElement('p');
  liveRegion.className = 'a11ytb-sr-only';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.textContent = `${entry.status}. Compatibilité ${compatBadge.textContent}.`;

  card.append(header, description);
  if (flags) {
    card.append(flags);
  }
  card.append(meta, metricsList);
  if (insights) {
    card.append(insights);
  }
  card.append(actionsContainer, liveRegion);
  return card;
}
