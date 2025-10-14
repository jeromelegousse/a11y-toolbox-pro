export function createAdminLayout(runtimePanel) {
  const layout = document.createElement('div');
  layout.className = 'a11ytb-admin-app-grid';

  const mainColumn = document.createElement('div');
  mainColumn.className = 'a11ytb-admin-app-main';

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
    'Explorez les vues Modules, Options & Profils puis Organisation.'
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
    'Alt+Shift+H : Raccourcis complets'
  ].forEach((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    tipsList.append(item);
  });

  const compareNote = document.createElement('p');
  compareNote.className = 'a11ytb-admin-compare';
  compareNote.textContent = 'Inspiré des workflows guidés d’Accessibility Insights et de Stark : suivez les indicateurs pour prioriser les correctifs rapides.';

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
  dashboardDescription.textContent = 'Filtrez le catalogue, examinez la compatibilité et déclenchez les actions directes sur les modules.';

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

  const statusGrid = document.createElement('div');
  statusGrid.className = 'a11ytb-admin-status-grid';

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

  dashboard.append(dashboardHeader, statusGrid, filterBar, moduleGrid, emptyState);

  mainColumn.append(introSection, dashboard);
  layout.append(mainColumn, runtimePanel.element);

  return {
    root: layout,
    introSection,
    dashboard,
    statusGrid,
    moduleGrid,
    emptyState,
    connectionStatus,
    geminiStatus,
    filters: {
      profile: profileFilter.control,
      collection: collectionFilter.control,
      compatibility: compatibilityFilter.control,
      sort: sortFilter.control,
      search: searchInput,
      pinned: pinnedCheckbox
    }
  };
}
