import { createI18n, resolveLocale } from '../languages/index.js';

const DEFAULT_FALLBACK_LOCALE = 'fr';

function getLocaleFromState(state) {
  if (!state || typeof state.get !== 'function') {
    return null;
  }
  return state.get('ui.locale');
}

function ensureStateLocale(state, locale) {
  if (!state || typeof state.set !== 'function') {
    return;
  }
  if (state.get('ui.locale') !== locale) {
    state.set('ui.locale', locale);
  }
}

export function createI18nService({
  state,
  initialLocale,
  fallbackLocale = DEFAULT_FALLBACK_LOCALE,
} = {}) {
  const resolvedInitial = resolveLocale(initialLocale ?? getLocaleFromState(state));
  const i18n = createI18n({
    initialLocale: resolvedInitial,
    fallbackLocale,
  });
  let currentLocale = i18n.getLocale();

  ensureStateLocale(state, currentLocale);

  const teardown = [];

  if (state && typeof state.on === 'function') {
    const unsubscribeState = state.on((snapshot) => {
      const nextLocale = snapshot?.ui?.locale;
      if (typeof nextLocale === 'string' && nextLocale && nextLocale !== currentLocale) {
        currentLocale = i18n.setLocale(nextLocale);
      }
    });
    teardown.push(unsubscribeState);
  }

  const unsubscribeI18n = i18n.onChange((nextLocale) => {
    currentLocale = nextLocale;
    ensureStateLocale(state, nextLocale);
  });
  teardown.push(unsubscribeI18n);

  return {
    ...i18n,
    translate: i18n.t,
    use(locale) {
      return i18n.setLocale(locale);
    },
    dispose() {
      while (teardown.length) {
        const fn = teardown.pop();
        if (typeof fn === 'function') {
          fn();
        }
      }
    },
  };
}

export default {
  createI18nService,
};
