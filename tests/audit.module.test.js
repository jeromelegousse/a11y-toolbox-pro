import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createScriptStub(registry = []) {
  const script = {
    _src: '',
    async: false,
    onload: null,
    onerror: null
  };
  Object.defineProperty(script, 'src', {
    get() {
      return this._src;
    },
    set(value) {
      this._src = value;
    }
  });
  registry.push(script);
  return script;
}

describe('audit module — axe loader fallback', () => {
  let testing;

  beforeEach(async () => {
    vi.resetModules();
    globalThis.window = {};
    globalThis.document = {
      head: { appendChild: vi.fn() },
      createElement: vi.fn((tag) => {
        if (tag !== 'script') {
          throw new Error(`Unexpected tag ${tag}`);
        }
        return createScriptStub([]);
      })
    };
    ({ __testing: testing } = await import('../src/modules/audit.js'));
    testing.resetAxeLoaders();
  });

  afterEach(() => {
    testing.resetAxeLoaders();
    vi.restoreAllMocks();
    delete globalThis.window;
    delete globalThis.document;
  });

  it('charge axe-core via import direct quand disponible', async () => {
    const axeMock = { run: vi.fn() };
    const importModule = vi.fn().mockResolvedValue({ default: axeMock });

    const axe = await testing.loadAxeCore({ importModule });

    expect(importModule).toHaveBeenCalledTimes(1);
    expect(axe).toBe(axeMock);
  });

  it('bascule sur le CDN si l\'import échoue', async () => {
    const scripts = [];
    document.createElement = vi.fn((tag) => {
      if (tag !== 'script') throw new Error('Expected script tag');
      return createScriptStub(scripts);
    });
    document.head.appendChild = vi.fn((node) => {
      window.axe = { run: vi.fn() };
      node.onload?.();
    });

    const importModule = vi.fn().mockRejectedValue(new Error('dynamic import failed'));

    const axe = await testing.loadAxeCore({ importModule });

    expect(importModule).toHaveBeenCalledTimes(1);
    expect(document.createElement).toHaveBeenCalledWith('script');
    expect(document.head.appendChild).toHaveBeenCalledTimes(1);
    expect(scripts[0].src).toBe(testing.CDN_AXE_CORE_SRC);
    expect(axe).toBe(window.axe);
  });

  it('réinitialise les loaders si le CDN échoue', async () => {
    const importModule = vi.fn().mockRejectedValue(new Error('dynamic import failed'));
    document.createElement = vi.fn((tag) => {
      if (tag !== 'script') throw new Error('Expected script tag');
      return createScriptStub([]);
    });
    document.head.appendChild = vi.fn((node) => {
      node.onerror?.(new Error('cdn failed'));
    });

    await expect(testing.loadAxeCore({ importModule })).rejects.toThrow('axe-core indisponible');

    const axeMock = { run: vi.fn() };
    const importSuccess = vi.fn().mockResolvedValue({ default: axeMock });
    const axe = await testing.loadAxeCore({ importModule: importSuccess });

    expect(importSuccess).toHaveBeenCalledTimes(1);
    expect(axe).toBe(axeMock);
  });
});
