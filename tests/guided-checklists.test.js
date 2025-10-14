import { describe, it, expect } from 'vitest';
import { buildGuidedChecklists, fastPassFlows, toggleManualChecklistStep } from '../src/guided-checklists.js';

describe('buildGuidedChecklists', () => {
  it('builds a core services overview using runtime metrics', () => {
    const snapshot = {
      runtime: {
        modules: {
          tts: { enabled: true, state: 'ready', metrics: { compat: { status: 'full' } } },
          stt: { enabled: false, state: 'idle' },
          braille: { enabled: true, state: 'error', error: 'Driver manquant' }
        }
      }
    };
    const [coreServices] = buildGuidedChecklists(snapshot);
    expect(coreServices.id).toBe('core-services');
    const brailleStep = coreServices.steps.find((step) => step.id === 'critical-braille');
    expect(brailleStep).toBeTruthy();
    expect(brailleStep?.completed).toBe(false);
    expect(coreServices.completedCount).toBeLessThan(coreServices.total);
  });

  it('reflects manual completion stored in ui.guides.completedSteps', () => {
    const snapshot = {
      ui: {
        guides: {
          completedSteps: {
            'audit-fastpass:audit-share': true
          }
        }
      },
      runtime: {
        modules: {
          audit: { enabled: true, state: 'ready' }
        }
      },
      audit: {
        lastRun: Date.now(),
        summary: { totals: { critical: 0, serious: 0, moderate: 0, minor: 0 } }
      }
    };
    const scenarios = buildGuidedChecklists(snapshot);
    const auditScenario = scenarios.find((scenario) => scenario.id === 'audit-fastpass');
    expect(auditScenario).toBeTruthy();
    const manualStep = auditScenario?.steps.find((step) => step.id === 'audit-share');
    expect(manualStep?.completed).toBe(true);
    expect(auditScenario?.completedCount).toBeGreaterThan(0);
  });

  it('aligne les flux FastPass sur les vérifications runtime et les ressources assistives', () => {
    const now = Date.now();
    const snapshot = {
      runtime: {
        modules: {
          tts: { enabled: true, state: 'ready' },
          audit: { enabled: true, state: 'ready', metrics: { compat: { status: 'full' } } }
        }
      },
      tts: {
        availableVoices: [
          { voiceURI: 'fr-FR-demo', name: 'Demo FR', lang: 'fr-FR' }
        ],
        voice: 'fr-FR-demo'
      },
      audit: {
        lastRun: now,
        summary: {
          headline: 'Audit terminé',
          totals: { critical: 0, serious: 0 }
        }
      }
    };
    const scenarios = buildGuidedChecklists(snapshot);
    const ttsScenario = scenarios.find((scenario) => scenario.id === 'tts-onboarding');
    expect(ttsScenario).toBeTruthy();
    expect(ttsScenario?.prerequisites?.[0]?.status).toBe('met');
    const autoStep = ttsScenario?.steps.find((step) => step.mode === 'auto');
    expect(autoStep?.announcement).toContain('Synthèse vocale');
    expect(ttsScenario?.assistance?.resources?.length).toBeGreaterThan(0);

    const auditScenario = scenarios.find((scenario) => scenario.id === 'audit-fastpass');
    const reviewStep = auditScenario?.steps.find((step) => step.id === 'audit-critical');
    expect(reviewStep?.announcement).toContain('violations');
  });
});

describe('fastPassFlows', () => {
  it('expose des ressources et des modules cibles pour les parcours standardisés', () => {
    const auditFlow = fastPassFlows.find((flow) => flow.id === 'audit-fastpass');
    expect(auditFlow?.moduleId).toBe('audit');
    expect(auditFlow?.assistance?.resources?.length).toBeGreaterThan(0);
    expect(auditFlow?.steps?.some((step) => step.mode === 'manual')).toBe(true);
  });
});

describe('toggleManualChecklistStep', () => {
  function createStubState(initial = {}) {
    const store = structuredClone({ ui: { guides: { completedSteps: {}, selectedScenario: null, cursors: {} } }, ...initial });
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
    expect(toggleManualChecklistStep(state, 'audit-fastpass:audit-share')).toBe(true);
    expect(state.get('ui.guides.completedSteps')['audit-fastpass:audit-share']).toBe(true);
    expect(toggleManualChecklistStep(state, 'audit-fastpass:audit-share')).toBe(true);
    expect(state.get('ui.guides.completedSteps')['audit-fastpass:audit-share']).toBe(false);
  });

  it('returns false when forcing the same value', () => {
    const state = createStubState({ ui: { guides: { completedSteps: { 'audit-fastpass:audit-share': true } } } });
    expect(toggleManualChecklistStep(state, 'audit-fastpass:audit-share', true)).toBe(false);
    expect(state.get('ui.guides.completedSteps')['audit-fastpass:audit-share']).toBe(true);
  });
});
