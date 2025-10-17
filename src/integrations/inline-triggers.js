const ACTION_HANDLERS = {
  toggle({ state, path, button, module }) {
    if (!state || typeof state.get !== 'function' || typeof state.set !== 'function' || !path) {
      return;
    }
    const current = !!state.get(path);
    const next = !current;
    state.set(path, next);
    if (button) {
      button.setAttribute('aria-pressed', String(next));
    }
    if (module) {
      window.a11ytb?.logActivity?.(`Déclencheur ${module} ${next ? 'activé' : 'désactivé'}`, {
        module,
        tone: next ? 'confirm' : 'toggle',
        tags: ['inline-trigger'],
      });
    }
  },
  'tts-read'() {
    const api = window.a11ytb?.tts;
    if (!api) {
      return;
    }
    if (typeof api.readSelection === 'function') {
      const selectionLaunched = api.readSelection();
      if (selectionLaunched) {
        return;
      }
    }
    if (typeof api.readPage === 'function') {
      api.readPage();
    }
  },
  'stt-toggle'({ state }) {
    const api = window.a11ytb?.stt;
    if (!api) {
      return;
    }
    const status = typeof state?.get === 'function' ? state.get('stt.status') : 'idle';
    if (status === 'listening') {
      api.stop?.();
    } else {
      api.start?.();
    }
  },
  'braille-selection'() {
    if (typeof window.brailleSelection === 'function') {
      window.brailleSelection();
    }
  },
  'open-panel'({ state, module, view }) {
    if (!state || typeof state.set !== 'function') {
      return;
    }
    state.set('ui.view', view || 'modules');
    state.set('ui.moduleFlyoutOpen', true);
    if (module) {
      window.a11ytb?.logActivity?.(`Ouverture du module ${module} depuis un déclencheur inline`, {
        module,
        tone: 'info',
        tags: ['inline-trigger'],
      });
    }
  },
};

function updateToggleState(element, state, path) {
  if (!element || !state || typeof state.get !== 'function' || !path) {
    return;
  }
  const button = element.querySelector('.a11ytb-inline-trigger__button');
  if (!button) {
    return;
  }
  const current = !!state.get(path);
  button.setAttribute('aria-pressed', String(current));
}

export function attachModuleTriggers({ state, root = document } = {}) {
  if (typeof window === 'undefined' || !root) {
    return null;
  }

  const bound = new Set();
  const subscriptions = new Map();

  function cleanup(element) {
    if (!element) {
      return;
    }
    if (subscriptions.has(element)) {
      const unsubscribe = subscriptions.get(element);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      subscriptions.delete(element);
    }
    bound.delete(element);
  }

  function bind(element) {
    if (!element || bound.has(element)) {
      return;
    }
    bound.add(element);

    const action = element.dataset.a11ytbAction || 'open-panel';
    const path = element.dataset.a11ytbPath || '';
    const view = element.dataset.a11ytbView || '';
    const module = element.dataset.a11ytbModule || '';
    const button = element.querySelector('.a11ytb-inline-trigger__button') || element;

    const handler = ACTION_HANDLERS[action] || ACTION_HANDLERS['open-panel'];

    button.addEventListener('click', (event) => {
      event.preventDefault();
      try {
        handler({ state, path, view, module, button: button });
      } catch (error) {
        console.warn('a11ytb: erreur lors de l’exécution du déclencheur inline', error);
      }
    });

    if (action === 'toggle' && state && path) {
      updateToggleState(element, state, path);
      const unsubscribe = state.on(() => updateToggleState(element, state, path));
      subscriptions.set(element, unsubscribe);
    }
  }

  const initial = root.querySelectorAll('[data-a11ytb-module-trigger]');
  initial.forEach((element) => bind(element));

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        if (node.matches?.('[data-a11ytb-module-trigger]')) {
          bind(node);
        }
        node.querySelectorAll?.('[data-a11ytb-module-trigger]').forEach((child) => bind(child));
      });
      mutation.removedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        if (bound.has(node)) {
          cleanup(node);
        }
        node.querySelectorAll?.('[data-a11ytb-module-trigger]').forEach((child) => cleanup(child));
      });
    });
  });

  if (document?.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  return {
    stop() {
      observer.disconnect();
      bound.forEach((element) => cleanup(element));
    },
  };
}

export default attachModuleTriggers;
