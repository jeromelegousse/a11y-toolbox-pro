const FALLBACK_LOCALE = 'fr';

const TRANSLATIONS = {
  fr: {
    meta: {
      label: 'fr',
      nativeName: 'Français',
    },
    panel: {
      title: 'A11y Toolbox Pro',
      openFab: 'Ouvrir la boîte à outils d’accessibilité',
    },
    toolbar: {
      ariaLabel: 'Actions d’interface',
      dockLeft: 'Dock gauche',
      dockRight: 'Dock droite',
      dockBottom: 'Dock bas',
      fullscreenEnter: 'Plein écran',
      fullscreenExit: 'Quitter le plein écran',
      fullscreenEnterTitle: 'Agrandir la boîte à outils',
      fullscreenExitTitle: 'Revenir à la vue compacte',
      reset: 'Réinitialiser',
      close: 'Fermer',
    },
    language: {
      label: 'Langue',
      helper: 'Choisir la langue de l’interface',
    },
    notifications: {
      regionLabel: 'Notifications système',
      dismiss: 'Masquer',
      dismissAria: 'Masquer la notification « {title} »',
      fallbackMessage: 'Une notification a été reçue.',
      defaultAlertTitle: 'Alerte',
      alertFallbackMessage: 'Une alerte système a été reçue.',
      empty: 'Aucune notification active.',
    },
    status: {
      regionLabel: 'État en temps réel des modules vocaux, braille et vision',
      title: 'État en temps réel',
      description:
        'Consultez l’indice global de conformité et l’état des modules Lecture vocale, Dictée, Braille, Contraste et Espacements.',
      aggregatedRegionLabel: 'Synthèse agrégée des métriques',
      aggregatedTitle: 'Tendances consolidées',
      aggregatedDescription: 'Comparez les performances des modules par profil ou collection.',
      profileLabel: 'Profil',
      profileFilter: 'Filtrer les métriques agrégées par profil',
      collectionLabel: 'Collection',
      collectionFilter: 'Filtrer les métriques agrégées par collection',
      launcherLabel: 'Suivi audit en temps réel',
      launcherTitle: 'Ouvrir le suivi audit en temps réel',
      allProfiles: 'Tous les profils',
      allCollections: 'Toutes les collections',
      empty: 'Aucune mesure agrégée pour les filtres sélectionnés.',
      noAlerts: 'Aucune alerte consolidée.',
      alertSummary: 'Alertes consolidées : {alerts}.',
      alertCritical: {
        one: '{count} alerte critique',
        other: '{count} alertes critiques',
      },
      alertWarning: {
        one: '{count} avertissement modéré',
        other: '{count} avertissements modérés',
      },
      successCount: {
        one: '{count} succès',
        other: '{count} succès',
      },
      failureCount: {
        one: '{count} échec',
        other: '{count} échecs',
      },
      samples: {
        one: '{count} échantillon',
        other: '{count} échantillons',
      },
      latencyCombined: 'Latence combinée',
      retries: 'Retentatives',
      latencyAverage: 'Latence moyenne',
      compatibility: 'Compatibilité',
      notMeasured: 'Non mesuré',
      compatibilityUnknown: 'Pré-requis non déclarés',
      scoreLabel: 'Indice {score}',
      chartSuccessShare: '{percent} % succès',
      chartFailureShare: '{percent} % échecs',
      chartNoSamples: 'Aucun échantillon',
      windowUnavailable: 'Fenêtre temporelle indisponible',
      windowDaySingle: '{day}',
      windowDayRange: '{start} → {end}',
      windowTimeRange: '{start} → {end}',
      windowCombined: '{days} · {times}',
      windowFallback: 'Fenêtre {start} → {end}',
    },
  },
  en: {
    meta: {
      label: 'en',
      nativeName: 'English',
    },
    panel: {
      title: 'A11y Toolbox Pro',
      openFab: 'Open the accessibility toolbox',
    },
    toolbar: {
      ariaLabel: 'Interface actions',
      dockLeft: 'Dock left',
      dockRight: 'Dock right',
      dockBottom: 'Dock bottom',
      fullscreenEnter: 'Enter fullscreen',
      fullscreenExit: 'Exit fullscreen',
      fullscreenEnterTitle: 'Expand the toolbox',
      fullscreenExitTitle: 'Return to compact view',
      reset: 'Reset',
      close: 'Close',
    },
    language: {
      label: 'Language',
      helper: 'Choose the interface language',
    },
    notifications: {
      regionLabel: 'System notifications',
      dismiss: 'Dismiss',
      dismissAria: 'Dismiss notification “{title}”',
      fallbackMessage: 'A notification was received.',
      defaultAlertTitle: 'Alert',
      alertFallbackMessage: 'A system alert was received.',
      empty: 'No active notifications.',
    },
    status: {
      regionLabel: 'Real-time status for speech, braille and vision modules',
      title: 'Real-time status',
      description:
        'Review the global compliance index and the state of Text to Speech, Dictation, Braille, Contrast and Spacing modules.',
      aggregatedRegionLabel: 'Aggregated metrics summary',
      aggregatedTitle: 'Consolidated trends',
      aggregatedDescription: 'Compare module performance per profile or collection.',
      profileLabel: 'Profile',
      profileFilter: 'Filter aggregated metrics by profile',
      collectionLabel: 'Collection',
      collectionFilter: 'Filter aggregated metrics by collection',
      launcherLabel: 'Real-time audit status',
      launcherTitle: 'Open the real-time audit tracker',
      allProfiles: 'All profiles',
      allCollections: 'All collections',
      empty: 'No aggregated metric for the selected filters.',
      noAlerts: 'No consolidated alert.',
      alertSummary: 'Consolidated alerts: {alerts}.',
      alertCritical: {
        one: '{count} critical alert',
        other: '{count} critical alerts',
      },
      alertWarning: {
        one: '{count} warning',
        other: '{count} warnings',
      },
      successCount: {
        one: '{count} success',
        other: '{count} successes',
      },
      failureCount: {
        one: '{count} failure',
        other: '{count} failures',
      },
      samples: {
        one: '{count} sample',
        other: '{count} samples',
      },
      latencyCombined: 'Combined latency',
      retries: 'Retries',
      latencyAverage: 'Average latency',
      compatibility: 'Compatibility',
      notMeasured: 'Not measured',
      compatibilityUnknown: 'Requirements not declared',
      scoreLabel: '{score} rating',
      chartSuccessShare: '{percent}% successes',
      chartFailureShare: '{percent}% failures',
      chartNoSamples: 'No samples',
      windowUnavailable: 'Time window unavailable',
      windowDaySingle: '{day}',
      windowDayRange: '{start} → {end}',
      windowTimeRange: '{start} → {end}',
      windowCombined: '{days} · {times}',
      windowFallback: 'Window {start} → {end}',
    },
  },
};

const pluralRulesCache = new Map();

function getPluralRules(locale) {
  if (!pluralRulesCache.has(locale)) {
    pluralRulesCache.set(locale, new Intl.PluralRules(locale));
  }
  return pluralRulesCache.get(locale);
}

function formatTemplate(template, replacements = {}) {
  if (typeof template !== 'string') {
    return '';
  }
  return template.replace(/\{([^}]+)\}/g, (_, token) => {
    if (Object.prototype.hasOwnProperty.call(replacements, token)) {
      return String(replacements[token]);
    }
    return '';
  });
}

function resolveMessage(locale, keyPath) {
  const segments = keyPath.split('.');
  const bundle = TRANSLATIONS[locale];
  return segments.reduce(
    (acc, segment) => (acc && acc[segment] !== undefined ? acc[segment] : undefined),
    bundle
  );
}

function pickMessageValue(locale, key, replacements, fallbackLocale) {
  const primary = resolveMessage(locale, key);
  const fallback =
    fallbackLocale && fallbackLocale !== locale ? resolveMessage(fallbackLocale, key) : undefined;
  return primary !== undefined ? primary : fallback;
}

function normalizeLocale(input) {
  if (!input || typeof input !== 'string') {
    return FALLBACK_LOCALE;
  }
  const lower = input.toLowerCase();
  if (TRANSLATIONS[lower]) {
    return lower;
  }
  const base = lower.split('-')[0];
  if (TRANSLATIONS[base]) {
    return base;
  }
  return FALLBACK_LOCALE;
}

function formatMessage(locale, value, replacements = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (!('count' in replacements)) {
      const template = value.other ?? Object.values(value)[0];
      return formatTemplate(String(template ?? ''), replacements);
    }
    const count = Number(replacements.count);
    const rules = getPluralRules(locale);
    const category = rules.select(Number.isFinite(count) ? count : 0);
    const template = value[category] ?? value.other ?? Object.values(value)[0];
    if (template !== undefined) {
      return formatTemplate(String(template), replacements);
    }
    return '';
  }
  if (typeof value === 'string') {
    return formatTemplate(value, replacements);
  }
  return '';
}

export function translate(locale, key, replacements = {}, fallbackLocale = FALLBACK_LOCALE) {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedFallback = normalizeLocale(fallbackLocale);
  const message = pickMessageValue(normalizedLocale, key, replacements, normalizedFallback);
  if (message === undefined) {
    return '';
  }
  return (
    formatMessage(normalizedLocale, message, replacements) ||
    formatMessage(normalizedFallback, message, replacements)
  );
}

export function getAvailableLocales() {
  return Object.keys(TRANSLATIONS).map((code) => ({
    code,
    label: TRANSLATIONS[code].meta?.nativeName || code,
  }));
}

export function resolveLocale(input) {
  return normalizeLocale(input);
}

export function getLocaleLabel(code) {
  const locale = normalizeLocale(code);
  return TRANSLATIONS[locale]?.meta?.nativeName || locale;
}

export function createI18n({ initialLocale, fallbackLocale } = {}) {
  let locale = normalizeLocale(initialLocale);
  const fallback = normalizeLocale(fallbackLocale || FALLBACK_LOCALE);
  const listeners = new Set();

  function t(key, replacements) {
    return translate(locale, key, replacements, fallback);
  }

  function setLocale(nextLocale) {
    const normalized = normalizeLocale(nextLocale);
    if (normalized !== locale) {
      locale = normalized;
      listeners.forEach((fn) => fn(locale));
    }
    return locale;
  }

  function getLocale() {
    return locale;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    t,
    setLocale,
    getLocale,
    onChange,
    getAvailableLocales: () => getAvailableLocales(),
    getLocaleLabel: (code) => getLocaleLabel(code),
  };
}

export default {
  createI18n,
  getAvailableLocales,
  getLocaleLabel,
  resolveLocale,
  translate,
};
