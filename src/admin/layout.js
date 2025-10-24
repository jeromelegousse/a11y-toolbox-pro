export function createAdminLayout(runtimePanel) {
  const layout = document.createElement('div');
  layout.className = 'a11ytb-admin-app-layout';

  const introSection = document.createElement('section');
  introSection.className = 'a11ytb-admin-section';

  const introTitle = document.createElement('h2');
  introTitle.className = 'a11ytb-admin-section-title';
  introTitle.textContent = 'Guide rapide';

  const introList = document.createElement('ol');
  introList.className = 'a11ytb-admin-steps';
  [
    'Ouvrez n’importe quelle page publique pour afficher la boîte à outils.',
    'Utilisez Alt+Shift+A ou le bouton flottant pour la barre latérale.',
    'Explorez les vues Modules, Options & Profils puis Organisation.',
  ].forEach((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    introList.append(item);
  });

  const tipsTitle = document.createElement('h3');
  tipsTitle.className = 'a11ytb-admin-subtitle';
  tipsTitle.textContent = 'Raccourcis utiles';

  const tipsList = document.createElement('ul');
  tipsList.className = 'a11ytb-admin-shortcuts';
  [
    'Alt+Shift+O : Options & Profils',
    'Alt+Shift+G : Organisation des modules',
    'Alt+Shift+H : Raccourcis complets',
  ].forEach((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    tipsList.append(item);
  });

  const compareNote = document.createElement('p');
  compareNote.className = 'a11ytb-admin-compare';
  compareNote.textContent =
    'Inspiré des workflows guidés d’Accessibility Insights et de Stark : suivez les indicateurs pour prioriser les correctifs rapides.';

  introSection.append(introTitle, introList, tipsTitle, tipsList, compareNote);

  const dashboard = document.createElement('section');
  dashboard.className = 'a11ytb-admin-section';

  const dashboardHeader = document.createElement('div');
  dashboardHeader.className = 'a11ytb-admin-section-header';

  const dashboardTitle = document.createElement('h2');
  dashboardTitle.className = 'a11ytb-admin-section-title';
  dashboardTitle.textContent = 'Suivi des modules';

  const dashboardDescription = document.createElement('p');
  dashboardDescription.className = 'a11ytb-admin-section-description';
  dashboardDescription.textContent =
    'Filtrez le catalogue, examinez la compatibilité et déclenchez les actions directes sur les modules.';

  dashboardHeader.append(dashboardTitle, dashboardDescription);

  const connectionStatus = document.createElement('p');
  connectionStatus.className = 'a11ytb-admin-connection';
  connectionStatus.setAttribute('role', 'status');
  connectionStatus.setAttribute('aria-live', 'polite');
  connectionStatus.textContent = 'Connexion à l’aperçu en cours…';
  dashboardHeader.append(connectionStatus);

  const geminiStatus = document.createElement('p');
  geminiStatus.className = 'a11ytb-admin-gemini';
  geminiStatus.hidden = true;
  dashboardHeader.append(geminiStatus);

  const llavaStatus = document.createElement('p');
  llavaStatus.className = 'a11ytb-admin-llava';
  llavaStatus.hidden = true;
  dashboardHeader.append(llavaStatus);

  const statusGrid = document.createElement('div');
  statusGrid.className = 'a11ytb-admin-status-grid';

  const manifestDiff = document.createElement('section');
  manifestDiff.className = 'a11ytb-admin-manifest-diff';
  manifestDiff.hidden = true;

  const filterBar = document.createElement('div');
  filterBar.className = 'a11ytb-admin-filters';

  const buildSelect = (id, label, className = 'a11ytb-admin-filter-select') => {
    const wrapper = document.createElement('label');
    wrapper.className = 'a11ytb-admin-filter';
    wrapper.setAttribute('for', id);
    wrapper.textContent = label;
    const select = document.createElement('select');
    select.id = id;
    select.className = className;
    select.setAttribute('aria-label', label);
    wrapper.append(select);
    return { wrapper, control: select };
  };

  const profileFilter = buildSelect('a11ytb-filter-profile', 'Profils');
  const collectionFilter = buildSelect('a11ytb-filter-collection', 'Collections');
  const compatibilityFilter = buildSelect('a11ytb-filter-compat', 'Compatibilité');
  const sortFilter = buildSelect('a11ytb-filter-sort', 'Tri', 'a11ytb-admin-sort-select');

  const searchWrapper = document.createElement('label');
  searchWrapper.className = 'a11ytb-admin-search';
  searchWrapper.setAttribute('for', 'a11ytb-filter-search');
  searchWrapper.textContent = 'Recherche';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'a11ytb-filter-search';
  searchInput.className = 'a11ytb-admin-search-field';
  searchInput.placeholder = 'Rechercher un module ou une permission…';
  searchInput.setAttribute('aria-describedby', 'a11ytb-search-hint');
  searchWrapper.append(searchInput);

  const searchHint = document.createElement('span');
  searchHint.id = 'a11ytb-search-hint';
  searchHint.className = 'a11ytb-sr-only';
  searchHint.textContent = 'Filtre par nom, description, mots-clés ou permissions.';
  searchWrapper.append(searchHint);

  const pinnedWrapper = document.createElement('label');
  pinnedWrapper.className = 'a11ytb-admin-filter-toggle';
  pinnedWrapper.setAttribute('for', 'a11ytb-filter-pinned');
  const pinnedCheckbox = document.createElement('input');
  pinnedCheckbox.type = 'checkbox';
  pinnedCheckbox.id = 'a11ytb-filter-pinned';
  pinnedCheckbox.className = 'a11ytb-admin-filter-checkbox';
  pinnedCheckbox.setAttribute('aria-label', 'Afficher uniquement les modules épinglés');
  const pinnedLabel = document.createElement('span');
  pinnedLabel.textContent = 'Modules épinglés';
  pinnedWrapper.append(pinnedCheckbox, pinnedLabel);

  filterBar.append(
    profileFilter.wrapper,
    collectionFilter.wrapper,
    compatibilityFilter.wrapper,
    sortFilter.wrapper,
    searchWrapper,
    pinnedWrapper
  );

  const moduleGrid = document.createElement('div');
  moduleGrid.className = 'a11ytb-admin-module-grid';
  moduleGrid.setAttribute('role', 'list');

  const emptyState = document.createElement('p');
  emptyState.className = 'a11ytb-admin-empty';
  emptyState.textContent = 'Aucun module ne correspond aux filtres sélectionnés.';
  emptyState.hidden = true;

  dashboard.append(dashboardHeader, statusGrid, manifestDiff, filterBar, moduleGrid, emptyState);

  const metricsSection = document.createElement('section');
  metricsSection.className = 'a11ytb-admin-section';

  const metricsHeader = document.createElement('div');
  metricsHeader.className = 'a11ytb-admin-section-header';

  const metricsTitle = document.createElement('h2');
  metricsTitle.className = 'a11ytb-admin-section-title';
  metricsTitle.textContent = 'Métriques consolidées';

  const metricsDescription = document.createElement('p');
  metricsDescription.className = 'a11ytb-admin-section-description';
  metricsDescription.textContent =
    'Analysez les performances globales, les incidents récents et les collections à surveiller.';

  const metricsStatus = document.createElement('p');
  metricsStatus.className = 'a11ytb-admin-live';
  metricsStatus.setAttribute('role', 'status');
  metricsStatus.setAttribute('aria-live', 'polite');
  metricsStatus.textContent = 'En attente de données métriques.';

  metricsHeader.append(metricsTitle, metricsDescription, metricsStatus);

  const metricsSummary = document.createElement('div');
  metricsSummary.className = 'a11ytb-admin-metrics-summary';

  const metricsEmpty = document.createElement('p');
  metricsEmpty.className = 'a11ytb-admin-empty';
  metricsEmpty.textContent = 'Aucune donnée métrique disponible pour le moment.';

  const metricsDetail = document.createElement('div');
  metricsDetail.className = 'a11ytb-admin-metrics-detail';

  const metricsTableWrapper = document.createElement('div');
  metricsTableWrapper.className = 'a11ytb-admin-metrics-table-wrapper';

  const metricsTable = document.createElement('table');
  metricsTable.className = 'a11ytb-admin-metrics-table';
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
  metricsTableEmpty.className = 'a11ytb-admin-metrics-subempty';
  metricsTableEmpty.textContent = 'Aucun échec enregistré.';

  metricsTableWrapper.append(metricsTable, metricsTableEmpty);

  const metricsSide = document.createElement('div');
  metricsSide.className = 'a11ytb-admin-metrics-side';

  const buildMetricsGroup = (titleText, emptyText) => {
    const group = document.createElement('section');
    group.className = 'a11ytb-admin-metrics-group';
    const title = document.createElement('h3');
    title.className = 'a11ytb-admin-metrics-subtitle';
    title.textContent = titleText;
    const list = document.createElement('ul');
    list.className = 'a11ytb-admin-metrics-list';
    list.setAttribute('role', 'list');
    const empty = document.createElement('p');
    empty.className = 'a11ytb-admin-metrics-subempty';
    empty.textContent = emptyText;
    group.append(title, list, empty);
    return { group, list, empty };
  };

  const latencyGroup = buildMetricsGroup(
    'Temps de réponse les plus élevés',
    'Aucune mesure de latence disponible.'
  );
  const incidentGroup = buildMetricsGroup('Incidents récents', 'Aucun incident enregistré.');
  const collectionGroup = buildMetricsGroup(
    'Collections sous surveillance',
    'Aucune collection en alerte.'
  );

  metricsSide.append(latencyGroup.group, incidentGroup.group, collectionGroup.group);

  metricsDetail.append(metricsTableWrapper, metricsSide);

  const metricsExport = document.createElement('div');
  metricsExport.className = 'a11ytb-admin-metrics-export';

  const exportJsonButton = document.createElement('button');
  exportJsonButton.type = 'button';
  exportJsonButton.className = 'a11ytb-admin-metrics-export-button';
  exportJsonButton.textContent = 'Exporter JSON';
  exportJsonButton.disabled = true;

  const exportCsvButton = document.createElement('button');
  exportCsvButton.type = 'button';
  exportCsvButton.className = 'a11ytb-admin-metrics-export-button';
  exportCsvButton.textContent = 'Exporter CSV';
  exportCsvButton.disabled = true;

  metricsExport.append(exportJsonButton, exportCsvButton);

  metricsSection.append(metricsHeader, metricsSummary, metricsEmpty, metricsDetail, metricsExport);

  const syncSection = document.createElement('section');
  syncSection.className = 'a11ytb-admin-section';

  const syncHeader = document.createElement('div');
  syncHeader.className = 'a11ytb-admin-section-header';

  const syncTitle = document.createElement('h2');
  syncTitle.className = 'a11ytb-admin-section-title';
  syncTitle.textContent = 'Synchronisations externes';

  const syncDescription = document.createElement('p');
  syncDescription.className = 'a11ytb-admin-section-description';
  syncDescription.textContent =
    'Suivez les envois automatiques (webhook, Jira, Linear, Slack) et vérifiez les dernières tentatives.';

  const syncStatus = document.createElement('p');
  syncStatus.className = 'a11ytb-admin-live';
  syncStatus.setAttribute('role', 'status');
  syncStatus.setAttribute('aria-live', 'polite');
  syncStatus.textContent = 'Aucune synchronisation enregistrée pour le moment.';

  syncHeader.append(syncTitle, syncDescription, syncStatus);

  const syncList = document.createElement('ul');
  syncList.className = 'a11ytb-admin-sync-list';
  syncList.setAttribute('role', 'list');
  syncList.hidden = true;

  const syncEmpty = document.createElement('p');
  syncEmpty.className = 'a11ytb-admin-empty';
  syncEmpty.textContent = 'Aucune synchronisation planifiée ou exécutée.';

  syncSection.append(syncHeader, syncList, syncEmpty);

  const exportSection = document.createElement('section');
  exportSection.className = 'a11ytb-admin-section';

  const exportHeader = document.createElement('div');
  exportHeader.className = 'a11ytb-admin-section-header';

  const exportTitle = document.createElement('h2');
  exportTitle.className = 'a11ytb-admin-section-title';
  exportTitle.textContent = 'Statut des exports';

  const exportDescription = document.createElement('p');
  exportDescription.className = 'a11ytb-admin-section-description';
  exportDescription.textContent =
    'Historique des exports JSON/CSV et copies du journal d’activité.';

  const exportStatus = document.createElement('p');
  exportStatus.className = 'a11ytb-admin-live';
  exportStatus.setAttribute('role', 'status');
  exportStatus.setAttribute('aria-live', 'polite');
  exportStatus.textContent = 'Aucun export recensé.';

  exportHeader.append(exportTitle, exportDescription, exportStatus);

  const exportList = document.createElement('ul');
  exportList.className = 'a11ytb-admin-export-list';
  exportList.setAttribute('role', 'list');
  exportList.hidden = true;

  const exportEmpty = document.createElement('p');
  exportEmpty.className = 'a11ytb-admin-empty';
  exportEmpty.textContent = 'Aucun export enregistré.';

  exportSection.append(exportHeader, exportList, exportEmpty);

  const shareSection = document.createElement('section');
  shareSection.className = 'a11ytb-admin-section';

  const shareHeader = document.createElement('div');
  shareHeader.className = 'a11ytb-admin-section-header';

  const shareTitle = document.createElement('h2');
  shareTitle.className = 'a11ytb-admin-section-title';
  shareTitle.textContent = 'Partages de profils';

  const shareDescription = document.createElement('p');
  shareDescription.className = 'a11ytb-admin-section-description';
  shareDescription.textContent =
    'Journal des profils diffusés auprès de l’équipe et des retraits de partage.';

  const shareStatus = document.createElement('p');
  shareStatus.className = 'a11ytb-admin-live';
  shareStatus.setAttribute('role', 'status');
  shareStatus.setAttribute('aria-live', 'polite');
  shareStatus.textContent = 'Aucun partage enregistré.';

  shareHeader.append(shareTitle, shareDescription, shareStatus);

  const shareList = document.createElement('ul');
  shareList.className = 'a11ytb-admin-share-list';
  shareList.setAttribute('role', 'list');
  shareList.hidden = true;

  const shareEmpty = document.createElement('p');
  shareEmpty.className = 'a11ytb-admin-empty';
  shareEmpty.textContent = 'Aucun destinataire enregistré pour le moment.';

  shareSection.append(shareHeader, shareList, shareEmpty);

  const automationSection = document.createElement('section');
  automationSection.className = 'a11ytb-admin-section';

  const automationHeader = document.createElement('div');
  automationHeader.className = 'a11ytb-admin-section-header';

  const automationTitle = document.createElement('h2');
  automationTitle.className = 'a11ytb-admin-section-title';
  automationTitle.textContent = 'Automatisations & raccourcis';

  const automationDescription = document.createElement('p');
  automationDescription.className = 'a11ytb-admin-section-description';
  automationDescription.textContent =
    'Suivi des raccourcis appliqués automatiquement et des presets configurés par profil.';

  const automationStatus = document.createElement('p');
  automationStatus.className = 'a11ytb-admin-live';
  automationStatus.setAttribute('role', 'status');
  automationStatus.setAttribute('aria-live', 'polite');
  automationStatus.textContent = 'Aucune automatisation enregistrée.';

  automationHeader.append(automationTitle, automationDescription, automationStatus);

  const automationList = document.createElement('ul');
  automationList.className = 'a11ytb-admin-automation-list';
  automationList.setAttribute('role', 'list');
  automationList.hidden = true;

  const automationEmpty = document.createElement('p');
  automationEmpty.className = 'a11ytb-admin-empty';
  automationEmpty.textContent = 'Aucun preset de raccourci n’a encore été appliqué.';

  automationSection.append(automationHeader, automationList, automationEmpty);

  const suggestionSection = document.createElement('section');
  suggestionSection.className = 'a11ytb-admin-section';

  const suggestionHeader = document.createElement('div');
  suggestionHeader.className = 'a11ytb-admin-section-header';

  const suggestionTitle = document.createElement('h2');
  suggestionTitle.className = 'a11ytb-admin-section-title';
  suggestionTitle.textContent = 'Collections suggérées';

  const suggestionDescription = document.createElement('p');
  suggestionDescription.className = 'a11ytb-admin-section-description';
  suggestionDescription.textContent =
    'Identifiez les packs à compléter en fonction des modules activés dans vos profils.';

  const suggestionStatus = document.createElement('p');
  suggestionStatus.className = 'a11ytb-admin-live';
  suggestionStatus.setAttribute('role', 'status');
  suggestionStatus.setAttribute('aria-live', 'polite');
  suggestionStatus.textContent = 'Aucune recommandation disponible.';

  suggestionHeader.append(suggestionTitle, suggestionDescription, suggestionStatus);

  const suggestionList = document.createElement('div');
  suggestionList.className = 'a11ytb-admin-suggestions';
  suggestionList.setAttribute('role', 'list');
  suggestionList.hidden = true;

  const suggestionEmpty = document.createElement('p');
  suggestionEmpty.className = 'a11ytb-admin-empty';
  suggestionEmpty.textContent = 'Aucune recommandation pour le moment.';

  suggestionSection.append(suggestionHeader, suggestionList, suggestionEmpty);

  const orderedSections = [
    dashboard,
    metricsSection,
    syncSection,
    exportSection,
    shareSection,
    automationSection,
    suggestionSection,
  ];

  const availabilityPanel = document.createElement('aside');
  availabilityPanel.className = 'a11ytb-admin-availability';

  const availabilityHeader = document.createElement('header');
  availabilityHeader.className = 'a11ytb-admin-availability-header';

  const availabilityTitle = document.createElement('h2');
  availabilityTitle.className = 'a11ytb-admin-availability-title';
  availabilityTitle.textContent = 'Modules disponibles';

  const availabilityDescription = document.createElement('p');
  availabilityDescription.className = 'a11ytb-admin-availability-description';
  availabilityDescription.textContent =
    'Repérez les modules prêts à l’usage, identifiez les blocages et appliquez des filtres croisés.';

  const availabilityCounts = document.createElement('dl');
  availabilityCounts.className = 'a11ytb-admin-availability-counts';

  const makeCount = (label, id) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.className = 'a11ytb-admin-availability-count';
    dd.id = `a11ytb-availability-${id}`;
    dd.textContent = '0';
    availabilityCounts.append(dt, dd);
    return dd;
  };

  const totalCount = makeCount('Modules suivis', 'total');
  const activeCount = makeCount('Actifs', 'active');
  const pinnedCount = makeCount('Épinglés', 'pinned');

  availabilityHeader.append(availabilityTitle, availabilityDescription, availabilityCounts);

  const availabilityToolbar = document.createElement('div');
  availabilityToolbar.className = 'a11ytb-admin-availability-toolbar';

  const availabilityBucketList = document.createElement('div');
  availabilityBucketList.className = 'a11ytb-admin-availability-buckets';

  const availabilityEmpty = document.createElement('p');
  availabilityEmpty.className = 'a11ytb-admin-availability-empty';
  availabilityEmpty.textContent = 'Aucun module à afficher pour cette catégorie.';
  availabilityEmpty.hidden = true;

  const taxonomy = document.createElement('div');
  taxonomy.className = 'a11ytb-admin-availability-taxonomy';

  const buildTaxonomySection = (titleText, listClass) => {
    const section = document.createElement('section');
    section.className = 'a11ytb-admin-availability-taxonomy-section';
    const title = document.createElement('h3');
    title.className = 'a11ytb-admin-availability-taxonomy-title';
    title.textContent = titleText;
    const list = document.createElement('ul');
    list.className = listClass;
    list.setAttribute('role', 'list');
    const empty = document.createElement('p');
    empty.className = 'a11ytb-admin-availability-taxonomy-empty';
    empty.textContent = 'Aucune donnée disponible.';
    empty.hidden = true;
    section.append(title, list, empty);
    return { section, list, empty };
  };

  const profileSection = buildTaxonomySection(
    'Profils concernés',
    'a11ytb-admin-availability-profiles'
  );
  const collectionSection = buildTaxonomySection(
    'Collections associées',
    'a11ytb-admin-availability-collections'
  );

  taxonomy.append(profileSection.section, collectionSection.section);

  availabilityPanel.append(
    availabilityHeader,
    availabilityToolbar,
    availabilityBucketList,
    availabilityEmpty,
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
    root: layout,
    introSection,
    dashboard,
    statusGrid,
    manifestDiff,
    moduleGrid,
    emptyState,
    connectionStatus,
    geminiStatus,
    llavaStatus,
    syncList,
    syncEmpty,
    syncStatus,
    metrics: {
      section: metricsSection,
      status: metricsStatus,
      summary: metricsSummary,
      empty: metricsEmpty,
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
    exportList,
    exportEmpty,
    exportStatus,
    shareList,
    shareEmpty,
    shareStatus,
    automationList,
    automationEmpty,
    automationStatus,
    suggestionsList: suggestionList,
    suggestionsEmpty: suggestionEmpty,
    suggestionsStatus: suggestionStatus,
    availability: {
      root: availabilityPanel,
      toolbar: availabilityToolbar,
      bucketList: availabilityBucketList,
      empty: availabilityEmpty,
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
      search: searchInput,
      pinned: pinnedCheckbox,
    },
  };
}
