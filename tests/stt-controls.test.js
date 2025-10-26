import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui.js', () => ({
  mountUI: vi.fn(),
}));

vi.mock('../src/status-center.js', () => ({
  createMetricsSyncService: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    ingest: vi.fn(),
  })),
}));

vi.mock('../src/feedback.js', () => ({
  createFeedback: vi.fn(() => ({
    play: vi.fn(),
    configure: vi.fn(),
  })),
}));

vi.mock('../src/audio-feedback.js', () => ({
  setupAudioFeedback: vi.fn(),
}));

vi.mock('../src/modules/audit-view.js', () => ({
  buildAuditStatusText: vi.fn(() => ''),
  renderAuditStats: vi.fn(() => ''),
  renderAuditViolations: vi.fn(() => ''),
}));

vi.mock('../src/integrations/preferences.js', () => ({
  createPreferenceSync: vi.fn(() => ({
    flush: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('../src/integrations/inline-triggers.js', () => ({
  attachModuleTriggers: vi.fn(() => null),
}));

vi.mock('../src/notifications.js', () => ({
  createNotificationCenter: vi.fn(() => ({
    notify: vi.fn(),
    dismiss: vi.fn(),
    clear: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  })),
}));

vi.mock('../src/modules/audio.manifest.js', () => ({
  manifest: {
    id: 'audio',
    version: '1.0.0',
    defaults: {
      state: {
        tts: { status: 'idle', progress: 0 },
        stt: { status: 'idle', transcript: '', inputSource: '' },
      },
    },
  },
}));

vi.mock('../src/module-catalog.js', () => ({
  moduleCatalog: [],
}));

vi.mock('../src/module-collections.js', () => ({
  moduleCollections: [],
}));

vi.mock('../src/module-runtime.js', () => ({
  setupModuleRuntime: vi.fn(),
}));

vi.mock('../languages/index.js', () => ({
  resolveLocale: vi.fn(() => 'fr-FR'),
  createI18n: vi.fn(() => ({
    t: vi.fn(() => ''),
    translate: vi.fn(() => ''),
    getLocale: vi.fn(() => 'fr-FR'),
    setLocale: vi.fn(),
    use: vi.fn(),
    onChange: vi.fn(() => vi.fn()),
  })),
}));

function clone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('structuredClone failed in test helper', error);
    }
  }
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function createTestState(initial) {
  let snapshot = clone(initial);
  const listeners = new Set();
  const state = {
    get(path) {
      if (!path) {
        return clone(snapshot);
      }
      const keys = path.split('.');
      let ref = snapshot;
      for (const key of keys) {
        if (ref == null) {
          return undefined;
        }
        ref = ref[key];
      }
      return clone(ref);
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return {
    state,
    emit(next) {
      snapshot = clone(next);
      listeners.forEach((fn) => fn(clone(snapshot)));
    },
  };
}

describe('stt-controls block escaping', () => {
  let block;

  beforeAll(async () => {
    document.body.innerHTML = '<div id="a11ytb-root"></div>';
    window.a11ytbPluginConfig = {
      defaults: {
        tts: { status: 'idle', progress: 0 },
        stt: { status: 'idle', transcript: '', inputSource: '' },
      },
    };
    window.a11ytb = window.a11ytb || {};
    const registry = await import('../src/registry.js');
    await import('../src/main.js');
    block = registry.getBlock('stt-controls');
    document.body.innerHTML = '';
  });

  afterAll(() => {
    delete window.a11ytbPluginConfig;
  });

  it('renders sanitized markup and applies escaped labels safely', () => {
    expect(block).toBeTruthy();

    const initialLabel = 'Micro "Focus" & Co';
    const { state, emit } = createTestState({
      stt: { status: 'idle', transcript: '', inputSource: initialLabel },
    });

    const markup = block.render(state);
    expect(markup).toContain('Source audio : Micro &quot;Focus&quot; &amp; Co');
    expect(markup).toContain('data-ref="source-label"></span>');

    const root = document.createElement('article');
    root.innerHTML = markup;
    block.wire({ root, state });

    const sourceLabel = root.querySelector('[data-ref="source-label"]');
    const sourceButton = root.querySelector('[data-ref="source-button"]');
    expect(sourceLabel?.textContent).toBe(initialLabel);
    expect(sourceButton?.getAttribute('aria-label')).toBe(`Source audio : ${initialLabel}`);
    expect(sourceButton?.getAttribute('title')).toBe(`Source audio : ${initialLabel}`);

    const nextLabel = "Entrée 'Studio'";
    emit({ stt: { status: 'listening', transcript: '...', inputSource: nextLabel } });

    expect(sourceLabel?.textContent).toBe(nextLabel);
    expect(sourceButton?.getAttribute('aria-label')).toBe(`Source audio : ${nextLabel}`);
    expect(sourceButton?.getAttribute('title')).toBe(`Source audio : ${nextLabel}`);
  });
});
