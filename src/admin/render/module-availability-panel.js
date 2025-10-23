import { COMPATIBILITY_LABELS, COMPATIBILITY_TONES } from '../constants.js';
import { computeAvailabilityBuckets } from '../data-model.js';
import { createBadge, formatDateRelative } from '../utils.js';

function formatValue(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 'Jamais';
  }
  return formatDateRelative(value);
}

function createAvailabilityButton(bucket, activeBucket, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'a11ytb-admin-availability-toggle';
  button.dataset.bucket = bucket.id;
  button.dataset.tone = bucket.tone || 'info';
  button.disabled = bucket.id !== 'all' && bucket.count === 0;
  button.textContent = `${bucket.label} (${bucket.count})`;
  const isActive = bucket.id === activeBucket;
  if (isActive) {
    button.classList.add('is-active');
  }
  button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  button.addEventListener('click', () => {
    handler(bucket.id);
  });
  return button;
}

function renderModuleItem(entry, actions, handlers) {
  const item = document.createElement('li');
  item.className = 'a11ytb-admin-availability-item';
  item.dataset.moduleId = entry.id;

  const header = document.createElement('div');
  header.className = 'a11ytb-admin-availability-item-head';

  const titleButton = document.createElement('button');
  titleButton.type = 'button';
  titleButton.className = 'a11ytb-admin-availability-item-title';
  titleButton.textContent = entry.manifest.name || entry.id;
  titleButton.addEventListener('click', () => {
    handlers.onFocusModule?.(entry);
  });

  const statusBadge = createBadge(entry.status, entry.statusTone);
  statusBadge.classList.add('a11ytb-admin-availability-status');

  const compatBadge = createBadge(
    COMPATIBILITY_LABELS[entry.compatStatus] || COMPATIBILITY_LABELS.none,
    COMPATIBILITY_TONES[entry.compatStatus] || COMPATIBILITY_TONES.none
  );
  compatBadge.classList.add('a11ytb-admin-availability-compat');

  header.append(titleButton, statusBadge, compatBadge);

  const meta = document.createElement('p');
  meta.className = 'a11ytb-admin-availability-meta';
  const profileCount = entry.profiles.length;
  const collectionCount = entry.collections.length;
  const attemptLabel = formatValue(entry.metrics.lastAttemptAt || entry.runtime.lastAttemptAt);
  meta.textContent = `${profileCount} profil${profileCount > 1 ? 's' : ''} • ${collectionCount} collection${collectionCount > 1 ? 's' : ''} • Dernier essai ${attemptLabel}`;

  const actionBar = document.createElement('div');
  actionBar.className = 'a11ytb-admin-availability-actions';

  if (actions?.canToggle(entry)) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'a11ytb-admin-availability-action';
    toggle.textContent = entry.enabled ? 'Suspendre' : 'Activer';
    toggle.addEventListener('click', () => {
      actions.toggleEnabled(entry);
      handlers.onRefresh?.();
    });
    actionBar.append(toggle);
  }

  if (actions?.canPin(entry)) {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'a11ytb-admin-availability-action';
    pin.textContent = entry.isPinned ? 'Désépingler' : 'Épingler';
    pin.addEventListener('click', () => {
      actions.togglePin(entry);
      handlers.onRefresh?.();
    });
    actionBar.append(pin);
  }

  if (actionBar.childElementCount === 0) {
    actionBar.hidden = true;
  }

  item.append(header, meta, actionBar);
  return item;
}

function renderTaxonomy(list, empty, items, onSelect) {
  list.innerHTML = '';
  if (!Array.isArray(items) || !items.length) {
    empty.hidden = false;
    list.hidden = true;
    return;
  }
  empty.hidden = true;
  list.hidden = false;
  items.slice(0, 6).forEach((item) => {
    const li = document.createElement('li');
    li.className = 'a11ytb-admin-availability-taxonomy-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'a11ytb-admin-availability-taxonomy-button';
    button.textContent = `${item.label} (${item.count})`;
    button.title = item.pathLabel || item.label;
    button.addEventListener('click', () => {
      onSelect?.(item);
    });
    li.append(button);
    list.append(li);
  });
}

export function createModuleAvailabilityPanel(layout, handlers = {}) {
  if (!layout?.root) {
    return {
      update() {},
    };
  }

  const state = {
    activeBucket: 'all',
  };

  function update(entries = [], context = {}) {
    const model = computeAvailabilityBuckets(entries);
    state.activeBucket = context?.filters?.availability || 'all';

    if (layout.counts) {
      layout.counts.total.textContent = model.stats.total.toString();
      layout.counts.active.textContent = model.stats.enabled.toString();
      layout.counts.pinned.textContent = model.stats.pinned.toString();
    }

    if (layout.toolbar) {
      layout.toolbar.innerHTML = '';
      const buckets = [
        { id: 'all', label: 'Tous', count: model.stats.total, tone: 'info' },
        ...model.buckets,
      ];
      buckets.forEach((bucket) => {
        const button = createAvailabilityButton(bucket, state.activeBucket, (bucketId) => {
          state.activeBucket = bucketId;
          layout.toolbar
            .querySelectorAll('.a11ytb-admin-availability-toggle')
            .forEach((toolbarButton) => {
              const isActive = toolbarButton.dataset.bucket === state.activeBucket;
              toolbarButton.classList.toggle('is-active', isActive);
              toolbarButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
          handlers.onAvailabilityChange?.(bucketId);
        });
        layout.toolbar.append(button);
      });
    }

    if (layout.bucketList) {
      layout.bucketList.innerHTML = '';
      let visibleBuckets = 0;
      model.buckets.forEach((bucket) => {
        if (!bucket.count) {
          return;
        }
        visibleBuckets += 1;
        const section = document.createElement('section');
        section.className = 'a11ytb-admin-availability-bucket';
        section.dataset.bucket = bucket.id;
        if (state.activeBucket === bucket.id) {
          section.dataset.active = 'true';
        }

        const header = document.createElement('header');
        header.className = 'a11ytb-admin-availability-bucket-head';

        const title = document.createElement('h3');
        title.className = 'a11ytb-admin-availability-bucket-title';
        title.textContent = bucket.label;

        const countBadge = createBadge(`${bucket.count}`, bucket.tone || 'info');
        countBadge.classList.add('a11ytb-admin-availability-bucket-count');

        const description = document.createElement('p');
        description.className = 'a11ytb-admin-availability-bucket-description';
        description.textContent = bucket.description || '';

        header.append(title, countBadge);
        section.append(header, description);

        const list = document.createElement('ul');
        list.className = 'a11ytb-admin-availability-list';
        list.setAttribute('role', 'list');
        bucket.modules.slice(0, 6).forEach((entry) => {
          list.append(
            renderModuleItem(entry, handlers.actions, {
              onFocusModule: handlers.onFocusModule,
              onRefresh: handlers.onRefresh,
            })
          );
        });
        section.append(list);
        layout.bucketList.append(section);
      });
      if (layout.empty) {
        layout.empty.hidden = visibleBuckets > 0;
      }
      layout.bucketList.hidden = visibleBuckets === 0;
    }

    if (layout.profiles) {
      renderTaxonomy(layout.profiles, layout.profilesEmpty, model.profiles, (item) => {
        handlers.onSelectProfile?.(item);
      });
    }

    if (layout.collections) {
      renderTaxonomy(layout.collections, layout.collectionsEmpty, model.collections, (item) => {
        handlers.onSelectCollection?.(item);
      });
    }
  }

  return {
    update,
  };
}
