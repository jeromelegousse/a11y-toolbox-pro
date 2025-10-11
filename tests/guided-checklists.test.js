import { describe, it, expect } from 'vitest';
import { buildGuidedChecklists, toggleManualChecklistStep } from '../src/guided-checklists.js';

describe('buildGuidedChecklists', () => {
  it('computes quickstart progress based on accessibility presets', () => {
    const snapshot = {
      ui: {
        activeProfile: 'vision-basse',
        pinned: ['contrast-controls', 'tts-controls']
      },
      contrast: { enabled: true },
      spacing: { lineHeight: 1.8, letterSpacing: 0.05 }
    };
    const [quickstart] = buildGuidedChecklists(snapshot);
    expect(quickstart.id).toBe('quickstart');
    expect(quickstart.completedCount).toBe(4);
    expect(quickstart.progress).toBe(1);
    expect(quickstart.steps.every((step) => step.completed)).toBe(true);
  });

  it('surfaces manual steps stored in ui.guides.completedSteps', () => {
    const snapshot = {
      ui: {
        guides: {
          completedSteps: {
            'check-status-center': true
          }
        }
      },
      runtime: {
        modules: {
          tts: { state: 'ready', enabled: true }
        }
      }
    };
    const [, observability] = buildGuidedChecklists(snapshot);
    expect(observability.id).toBe('observability');
    const manualStep = observability.steps.find((step) => step.id === 'check-status-center');
    expect(manualStep?.completed).toBe(true);
    expect(observability.completedCount).toBeGreaterThanOrEqual(1);
  });
});

describe('toggleManualChecklistStep', () => {
  function createStubState(initial = {}) {
    const store = structuredClone({ ui: { guides: { completedSteps: {} } }, ...initial });
    return {
      get(path) {
        if (!path) return undefined;
        return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), store);
      },
      set(path, value) {
        const parts = path.split('.');
        let target = store;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const key = parts[i];
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          target = target[key];
        }
        target[parts[parts.length - 1]] = value;
      }
    };
  }

  it('toggles the stored value and returns true on change', () => {
    const state = createStubState();
    expect(toggleManualChecklistStep(state, 'check-status-center')).toBe(true);
    expect(state.get('ui.guides.completedSteps')['check-status-center']).toBe(true);
    expect(toggleManualChecklistStep(state, 'check-status-center')).toBe(true);
    expect(state.get('ui.guides.completedSteps')['check-status-center']).toBe(false);
  });

  it('returns false when forcing the same value', () => {
    const state = createStubState({ ui: { guides: { completedSteps: { 'check-status-center': true } } } });
    expect(toggleManualChecklistStep(state, 'check-status-center', true)).toBe(false);
    expect(state.get('ui.guides.completedSteps')['check-status-center']).toBe(true);
  });
});
