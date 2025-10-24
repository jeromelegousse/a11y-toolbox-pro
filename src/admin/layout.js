const SECTION_SPACING = 20;

function createSection(id, titleText, descriptionText) {
  const section = document.createElement('section');
  section.className = 'a11ytb-admin-section';
  section.dataset.section = id;

  const title = document.createElement('h2');
  title.textContent = titleText;
  section.append(title);

  if (descriptionText) {
    const description = document.createElement('p');
    description.className = 'description';
    description.textContent = descriptionText;
    section.append(description);
  }

  return { section, title };
}

function createNotice(tone, message) {
  const notice = document.createElement('div');
  notice.className = `notice notice-${tone}`;
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  notice.append(paragraph);
  return { notice, paragraph };
}

function createFiltersRow() {
  const wrapper = document.createElement('div');
  wrapper.className = 'tablenav top';

  const left = document.createElement('div');
  left.className = 'alignleft actions';

  const right = document.createElement('div');
  right.className = 'tablenav-pages';
  right.setAttribute('aria-hidden', 'true');
  right.hidden = true;

  wrapper.append(left, right);
  return { wrapper, left };
}

function createSelectControl(id, labelText) {
  const container = document.createElement('label');
  container.className = 'screen-reader-text';
  container.setAttribute('for', id);
  container.textContent = labelText;

  const select = document.createElement('select');
  select.id = id;
  select.className = 'a11ytb-admin-select';

  const wrap = document.createElement('div');
  wrap.className = 'a11ytb-admin-filter';
  wrap.append(container, select);

  return { wrap, control: select };
}

function createSearchControl() {
  const searchLabel = document.createElement('label');
  searchLabel.className = 'screen-reader-text';
  searchLabel.setAttribute('for', 'a11ytb-filter-search');
  searchLabel.textContent = 'Recherche de modules';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'a11ytb-filter-search';
  searchInput.className = 'regular-text';
  searchInput.placeholder = 'Rechercher un module ou une permission…';

  const container = document.createElement('div');
  container.className = 'a11ytb-admin-search';
  container.append(searchLabel, searchInput);

  return { container, input: searchInput };
}

function createPinnedToggle() {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'a11ytb-filter-pinned';

  const label = document.createElement('label');
  label.setAttribute('for', 'a11ytb-filter-pinned');
  label.textContent = 'Modules épinglés uniquement';

  const container = document.createElement('div');
  container.className = 'a11ytb-admin-pinned';
  container.append(checkbox, label);

  return { container, checkbox };
}

export function createAdminLayout(runtimePanel) {
  const layout = document.createElement('div');
  layout.className = 'a11ytb-admin-app-layout';

  const headerActions = document.createElement('p');
  headerActions.className = 'a11ytb-admin-header-actions';

  const fullscreenButton = document.createElement('button');
  fullscreenButton.type = 'button';
  fullscreenButton.className = 'button button-secondary';
  fullscreenButton.dataset.adminAction = 'open-fullscreen';
  fullscreenButton.textContent = 'Ouvrir la boîte à outils en plein écran';

  headerActions.append(fullscreenButton);

  const intro = createSection(
    'guide',
    'Guide rapide',
    'Découvrez les chemins les plus utilisés pour ouvrir la boîte à outils et accéder aux profils.'
  );

  const introCard = document.createElement('div');
  introCard.className = 'card';

  const introSteps = document.createElement('ol');
  ['Ouvrez n’importe quelle page publique pour afficher la boîte à outils.',
   'Utilisez Alt+Shift+A ou le bouton flottant pour la barre latérale.',
   'Explorez les vues Modules, Options & Profils puis Organisation.'].forEach((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    introSteps.append(item);
  });

  const shortcutsTitle = document.createElement('h3');
  shortcutsTitle.textContent = 'Raccourcis utiles';

  const shortcutsList = document.createElement('ul');
  ['Alt+Shift+O : Options & Profils', 'Alt+Shift+G : Organisation des modules', 'Alt+Shift+H : Raccourcis complets'].forEach((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    shortcutsList.append(item);
  });

  const compareNote = document.createElement('p');
  compareNote.className = 'description';
  compareNote.textContent =
    'Inspiré des workflows guidés d’Accessibility Insights et de Stark : suivez les indicateurs pour prioriser les correctifs rapides.';

  introCard.append(introSteps, shortcutsTitle, shortcutsList, compareNote);
  intro.section.append(introCard);

  const dashboard = createSection(
    'modules',
    'Suivi des modules',
    'Filtrez le catalogue, examinez la compatibilité et déclenchez les actions directes sur les modules.'
  );

  const connectionNotice = createNotice('info', 'Connexion à l’aperçu en cours…');
  connectionNotice.notice.setAttribute('role', 'status');
  connectionNotice.notice.setAttribute('aria-live', 'polite');

  const geminiNotice = createNotice('info', '');
  geminiNotice.notice.classList.add('a11ytb-admin-gemini');
  geminiNotice.notice.hidden = true;

  const llavaNotice = createNotice('info', '');
  llavaNotice.notice.classList.add('a11ytb-admin-llava');
  llavaNotice.notice.hidden = true;

  const statusContainer = document.createElement('div');
  statusContainer.className = 'a11ytb-status-list';
  statusContainer.dataset.role = 'status-cards';

  const manifestDiff = document.createElement('div');
  manifestDiff.className = 'a11ytb-admin-manifest';
  manifestDiff.hidden = true;

  const filtersRow = createFiltersRow();
  const profileFilter = createSelectControl('a11ytb-filter-profile', 'Profils');
  const collectionFilter = createSelectControl('a11ytb-filter-collection', 'Collections');
  const compatibilityFilter = createSelectControl('a11ytb-filter-compat', 'Compatibilité');
  const sortFilter = createSelectControl('a11ytb-filter-sort', 'Tri');
  const searchControl = createSearchControl();
  const pinnedToggle = createPinnedToggle();

  [profileFilter.wrap, collectionFilter.wrap, compatibilityFilter.wrap, sortFilter.wrap].forEach((element) => {
    element.classList.add('alignleft');
    filtersRow.left.append(element);
  });

  filtersRow.left.append(searchControl.container, pinnedToggle.container);

  const moduleTable = document.createElement('table');
  moduleTable.className = 'wp-list-table widefat striped table-view-list a11ytb-admin-modules';
  moduleTable.setAttribute('aria-describedby', 'a11ytb-modules-caption');

  const moduleCaption = document.createElement('caption');
  moduleCaption.id = 'a11ytb-modules-caption';
  moduleCaption.textContent = 'Liste des modules disponibles dans la boîte à outils.';

  const moduleHead = document.createElement('thead');
  const moduleHeadRow = document.createElement('tr');
  ['Module', 'Statut', 'Compatibilité', 'Profils', 'Collections', 'Activité'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    moduleHeadRow.append(th);
  });
  moduleHead.append(moduleHeadRow);

  const moduleBody = document.createElement('tbody');

  moduleTable.append(moduleCaption, moduleHead, moduleBody);

  const moduleEmpty = createNotice(
    'info',
    'Aucun module ne correspond aux filtres sélectionnés.'
  );
  moduleEmpty.notice.hidden = true;

  dashboard.section.append(
    connectionNotice.notice,
    geminiNotice.notice,
    llavaNotice.notice,
    statusContainer,
    manifestDiff,
    filtersRow.wrapper,
    moduleTable,
    moduleEmpty.notice
  );

  const metrics = createSection(
    'metrics',
    'Métriques consolidées',
    'Analysez les performances globales, les incidents récents et les collections à surveiller.'
  );

  const metricsStatus = createNotice('info', 'En attente de données métriques.');
  metricsStatus.notice.setAttribute('role', 'status');
  metricsStatus.notice.setAttribute('aria-live', 'polite');

  const metricsSummary = document.createElement('div');
  metricsSummary.className = 'a11ytb-metrics-summary';

  const metricsEmpty = createNotice('info', 'Aucune donnée métrique disponible pour le moment.');

  const metricsDetail = document.createElement('div');
  metricsDetail.className = 'a11ytb-metrics-detail';

  const metricsTableWrapper = document.createElement('div');
  metricsTableWrapper.className = 'card';

  const metricsTable = document.createElement('table');
  metricsTable.className = 'widefat striped';
  metricsTable.setAttribute('aria-describedby', 'a11ytb-metrics-caption');

  const metricsCaption = document.createElement('caption');
  metricsCaption.id = 'a11ytb-metrics-caption';
  metricsCaption.textContent = 'Modules présentant le plus de difficultés récentes.';

  const metricsHead = document.createElement('thead');
  const metricsHeadRow = document.createElement('tr');
  ['Module', 'Tentatives', 'Échecs', 'Taux', 'Latence', 'Incidents'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    metricsHeadRow.append(th);
  });
  metricsHead.append(metricsHeadRow);

  const metricsBody = document.createElement('tbody');

  metricsTable.append(metricsCaption, metricsHead, metricsBody);

  const metricsTableEmpty = document.createElement('p');
  metricsTableEmpty.className = 'description';
  metricsTableEmpty.textContent = 'Aucun échec enregistré.';

  metricsTableWrapper.append(metricsTable, metricsTableEmpty);

  const metricsSide = document.createElement('div');
  metricsSide.className = 'a11ytb-metrics-side';

  const buildMetricsGroup = (titleText, emptyText) => {
    const group = document.createElement('div');
    group.className = 'card';
    const title = document.createElement('h3');
    title.textContent = titleText;
    const list = document.createElement('ul');
    list.className = 'a11ytb-metrics-list';
    list.setAttribute('role', 'list');
    const empty = document.createElement('p');
    empty.className = 'description';
    empty.textContent = emptyText;
    group.append(title, list, empty);
    return { group, list, empty };
  };

  const latencyGroup = buildMetricsGroup('Temps de réponse les plus élevés', 'Aucune mesure de latence disponible.');
  const incidentGroup = buildMetricsGroup('Incidents récents', 'Aucun incident enregistré.');
  const collectionGroup = buildMetricsGroup('Collections sous surveillance', 'Aucune collection en alerte.');

  metricsSide.append(latencyGroup.group, incidentGroup.group, collectionGroup.group);

  metricsDetail.append(metricsTableWrapper, metricsSide);

  const metricsExport = document.createElement('div');
  metricsExport.className = 'a11ytb-metrics-export';

  const exportJsonButton = document.createElement('button');
  exportJsonButton.type = 'button';
  exportJsonButton.className = 'button';
  exportJsonButton.textContent = 'Exporter JSON';
  exportJsonButton.disabled = true;

  const exportCsvButton = document.createElement('button');
  exportCsvButton.type = 'button';
  exportCsvButton.className = 'button';
  exportCsvButton.textContent = 'Exporter CSV';
  exportCsvButton.disabled = true;

  metricsExport.append(exportJsonButton, exportCsvButton);

  metrics.section.append(
    metricsStatus.notice,
    metricsSummary,
    metricsEmpty.notice,
    metricsDetail,
    metricsExport
  );

  const buildTimelineSection = (id, title, description, emptyText) => {
    const block = createSection(id, title, description);
    const status = createNotice('info', emptyText);
    status.notice.setAttribute('role', 'status');
    status.notice.setAttribute('aria-live', 'polite');

    const list = document.createElement('ul');
    list.className = 'a11ytb-timeline';
    list.setAttribute('role', 'list');
    list.hidden = true;

    block.section.append(status.notice, list);
    return { ...block, status: status.paragraph, list, empty: status.notice };
  };

  const syncSection = buildTimelineSection(
    'sync',
    'Synchronisations externes',
    'Suivez les envois automatiques (webhook, Jira, Linear, Slack) et vérifiez les dernières tentatives.',
    'Aucune synchronisation enregistrée pour le moment.'
  );

  const exportSection = buildTimelineSection(
    'exports',
    'Statut des exports',
    'Historique des exports JSON/CSV et copies du journal d’activité.',
    'Aucun export recensé.'
  );

  const shareSection = buildTimelineSection(
    'shares',
    'Partages de profils',
    'Journal des profils diffusés auprès de l’équipe et des retraits de partage.',
    'Aucun partage enregistré.'
  );

  const automationSection = buildTimelineSection(
    'automations',
    'Automatisations & raccourcis',
    'Suivi des raccourcis appliqués automatiquement et des presets configurés par profil.',
    'Aucune automatisation enregistrée.'
  );

  const orderedSections = [
    dashboard,
    metricsSection,
    syncSection,
    exportSection,
    shareSection,
    automationSection,
    suggestionSection,
  ];

  const suggestionsStatus = createNotice('info', 'Aucune recommandation disponible.');
  suggestionsStatus.notice.setAttribute('role', 'status');
  suggestionsStatus.notice.setAttribute('aria-live', 'polite');

  const suggestionsList = document.createElement('div');
  suggestionsList.className = 'a11ytb-suggestions';
  suggestionsList.setAttribute('role', 'list');
  suggestionsList.hidden = true;

  suggestionsSection.section.append(suggestionsStatus.notice, suggestionsList);

  const availabilitySection = createSection(
    'availability',
    'Disponibilité des modules',
    'Repérez les modules prêts à l’usage, identifiez les blocages et appliquez des filtres croisés.'
  );

  const availabilityCounts = document.createElement('dl');
  availabilityCounts.className = 'a11ytb-availability-counts';

  const makeCount = (label, id) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.id = `a11ytb-availability-${id}`;
    dd.textContent = '0';
    availabilityCounts.append(dt, dd);
    return dd;
  };

  const totalCount = makeCount('Modules suivis', 'total');
  const activeCount = makeCount('Actifs', 'active');
  const pinnedCount = makeCount('Épinglés', 'pinned');

  const availabilityToolbar = document.createElement('div');
  availabilityToolbar.className = 'a11ytb-availability-toolbar';

  const availabilityBucketList = document.createElement('div');
  availabilityBucketList.className = 'a11ytb-availability-buckets';

  const availabilityEmpty = createNotice(
    'info',
    'Aucun module à afficher pour cette catégorie.'
  );
  availabilityEmpty.notice.hidden = true;

  const taxonomy = document.createElement('div');
  taxonomy.className = 'a11ytb-availability-taxonomy';

  const buildTaxonomySection = (titleText, id) => {
    const container = document.createElement('div');
    container.className = 'card';
    const title = document.createElement('h3');
    title.textContent = titleText;
    const list = document.createElement('ul');
    list.className = `a11ytb-availability-${id}`;
    list.setAttribute('role', 'list');
    const empty = document.createElement('p');
    empty.className = 'description';
    empty.textContent = 'Aucune donnée disponible.';
    empty.hidden = true;
    container.append(title, list, empty);
    return { container, list, empty };
  };

  const profileSection = buildTaxonomySection('Profils concernés', 'profiles');
  const collectionSection = buildTaxonomySection('Collections associées', 'collections');

  taxonomy.append(profileSection.container, collectionSection.container);

  availabilitySection.section.append(
    availabilityCounts,
    availabilityToolbar,
    availabilityBucketList,
    availabilityEmpty.notice,
    taxonomy
  );

  orderedSections.forEach((section) => {
    layout.append(section);
  });

  availabilityPanel.classList.add('a11ytb-admin-section');
  layout.append(availabilityPanel);

  runtimePanel.element.classList.add('a11ytb-admin-section');
  layout.append(runtimePanel.element);

  layout.append(introSection);

  return {
    root,
    introSection: intro.section,
    dashboard: dashboard.section,
    statusGrid: statusContainer,
    manifestDiff,
    moduleGrid: moduleBody,
    emptyState: moduleEmpty.notice,
    connectionStatus: connectionNotice.notice,
    geminiStatus: geminiNotice.notice,
    llavaStatus: llavaNotice.notice,
    syncList: syncSection.list,
    syncEmpty: syncSection.empty,
    syncStatus: syncSection.status,
    metrics: {
      section: metrics.section,
      status: metricsStatus.paragraph,
      summary: metricsSummary,
      empty: metricsEmpty.notice,
      table: metricsTable,
      tableBody: metricsBody,
      tableEmpty: metricsTableEmpty,
      latencyList: latencyGroup.list,
      latencyEmpty: latencyGroup.empty,
      incidentsList: incidentGroup.list,
      incidentsEmpty: incidentGroup.empty,
      collectionsList: collectionGroup.list,
      collectionsEmpty: collectionGroup.empty,
      exports: {
        json: exportJsonButton,
        csv: exportCsvButton,
      },
    },
    exportList: exportSection.list,
    exportEmpty: exportSection.empty,
    exportStatus: exportSection.status,
    shareList: shareSection.list,
    shareEmpty: shareSection.empty,
    shareStatus: shareSection.status,
    automationList: automationSection.list,
    automationEmpty: automationSection.empty,
    automationStatus: automationSection.status,
    suggestionsList,
    suggestionsEmpty: suggestionsStatus.notice,
    suggestionsStatus: suggestionsStatus.paragraph,
    availability: {
      root: availabilitySection.section,
      toolbar: availabilityToolbar,
      bucketList: availabilityBucketList,
      empty: availabilityEmpty.notice,
      counts: {
        total: totalCount,
        active: activeCount,
        pinned: pinnedCount,
      },
      profiles: profileSection.list,
      profilesEmpty: profileSection.empty,
      collections: collectionSection.list,
      collectionsEmpty: collectionSection.empty,
    },
    filters: {
      profile: profileFilter.control,
      collection: collectionFilter.control,
      compatibility: compatibilityFilter.control,
      sort: sortFilter.control,
      search: searchControl.input,
      pinned: pinnedToggle.checkbox,
    },
  };
}
