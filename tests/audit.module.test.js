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

  it('charge axe-core depuis le script local vendorié par défaut', async () => {
    const scripts = [];
    document.createElement = vi.fn((tag) => {
      if (tag !== 'script') throw new Error('Expected script tag');
      return createScriptStub(scripts);
    });
    document.head.appendChild = vi.fn((node) => {
      expect(node.src).toBe(testing.LOCAL_AXE_CORE_SRC);
      window.axe = { run: vi.fn() };
      node.onload?.();
    });

    const axe = await testing.loadAxeCore();

    expect(document.createElement).toHaveBeenCalledWith('script');
    expect(document.head.appendChild).toHaveBeenCalledTimes(1);
    expect(scripts[0].src).toBe(testing.LOCAL_AXE_CORE_SRC);
    expect(axe).toBe(window.axe);
  });

  it('bascule sur le CDN si le chargement local échoue', async () => {
    const scripts = [];
    document.createElement = vi.fn((tag) => {
      if (tag !== 'script') throw new Error('Expected script tag');
      return createScriptStub(scripts);
    });
    document.head.appendChild = vi.fn((node) => {
      if (scripts.length === 1) {
        expect(node.src).toBe(testing.LOCAL_AXE_CORE_SRC);
        node.onerror?.(new Error('local failed'));
        return;
      }
      expect(node.src).toBe(testing.CDN_AXE_CORE_SRC);
      expect(node.integrity).toBe(testing.CDN_AXE_CORE_INTEGRITY);
      expect(node.crossOrigin).toBe('anonymous');
      window.axe = { run: vi.fn() };
      node.onload?.();
    });

    const axe = await testing.loadAxeCore();

    expect(document.createElement).toHaveBeenCalledWith('script');
    expect(document.head.appendChild).toHaveBeenCalledTimes(2);
    expect(scripts[0].src).toBe(testing.LOCAL_AXE_CORE_SRC);
    expect(scripts[1].src).toBe(testing.CDN_AXE_CORE_SRC);
    expect(scripts[1].integrity).toBe(testing.CDN_AXE_CORE_INTEGRITY);
    expect(scripts[1].crossOrigin).toBe('anonymous');
    expect(axe).toBe(window.axe);
  });

  it('réinitialise les loaders si le CDN échoue après l’actif local', async () => {
    const scripts = [];
    document.createElement = vi.fn((tag) => {
      if (tag !== 'script') throw new Error('Expected script tag');
      return createScriptStub(scripts);
    });
    document.head.appendChild = vi.fn((node) => {
      if (scripts.length === 1) {
        node.onerror?.(new Error('local failed'));
        return;
      }
      node.onerror?.(new Error('cdn failed'));
    });

    await expect(testing.loadAxeCore()).rejects.toThrow('axe-core indisponible');

    const axeMock = { run: vi.fn() };
    const importSuccess = vi.fn().mockResolvedValue({ default: axeMock });
    const axe = await testing.loadAxeCore({ importModule: importSuccess });

    expect(importSuccess).toHaveBeenCalledTimes(1);
    expect(axe).toBe(axeMock);
  });
});
