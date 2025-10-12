import { describe, expect, it } from 'vitest';
import { summarizeStatuses, computeModuleMetrics, getModuleCompatibilityScore } from '../src/status-center.js';

describe('summarizeStatuses', () => {
  it('retourne un état prêt par défaut pour les modules critiques', () => {
    const snapshot = {
      audit: {
        status: 'idle',
        lastReport: null,
        summary: {
          headline: 'Audit en attente',
          detail: '',
          tone: 'info',
          totals: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0, total: 0 }
        }
      },
      tts: {
        status: 'idle',
        voice: 'fr-default',
        availableVoices: [{ voiceURI: 'fr-default', name: 'Louise', lang: 'fr-FR' }]
      },
      stt: { status: 'idle' },
      braille: { output: '' },
      contrast: { enabled: false },
      spacing: { lineHeight: 1.5, letterSpacing: 0 },
      runtime: {
        modules: {
          audit: { enabled: true, state: 'ready' },
          tts: { enabled: true, state: 'ready' },
          stt: { enabled: true, state: 'ready' },
          braille: { enabled: true, state: 'ready' },
          contrast: { enabled: true, state: 'ready' },
          spacing: { enabled: true, state: 'ready' }
        }
      }
    };

    const statuses = summarizeStatuses(snapshot);
    expect(statuses).toHaveLength(7);

    const globalSummary = statuses.find((status) => status.id === 'global-score');
    expect(globalSummary).toBeDefined();
    expect(globalSummary.value).toBe('Indice AA');
    expect(globalSummary.detail).toContain('6/6 modules prêts');
    expect(globalSummary.insights.compatLabel).toBe('Aucun incident');
    expect(globalSummary.tone).toBe('active');

    const auditSummary = statuses.find((status) => status.id === 'audit');
    expect(auditSummary.value).toBe('En attente');
    expect(auditSummary.detail).toContain('Lancez une analyse');

    const ttsSummary = statuses.find((status) => status.id === 'tts');
    expect(ttsSummary.value).toBe('En veille');
    expect(ttsSummary.detail).toContain('Voix active');
    expect(ttsSummary.insights.latencyLabel).toBe('Non mesuré');
    expect(ttsSummary.insights.riskLevel).toBe('AAA');

    const sttSummary = statuses.find((status) => status.id === 'stt');
    expect(sttSummary.value).toBe('En veille');
    expect(sttSummary.tone).toBe('info');
    expect(sttSummary.insights.compatLabel).toBe('Pré-requis non déclarés');

    const brailleSummary = statuses.find((status) => status.id === 'braille');
    expect(brailleSummary.value).toBe('En veille');
    expect(brailleSummary.tone).toBe('info');

    const contrastSummary = statuses.find((status) => status.id === 'contrast');
    expect(contrastSummary.value).toBe('En veille');
    expect(contrastSummary.detail).toContain('Prêt à renforcer le contraste');

    const spacingSummary = statuses.find((status) => status.id === 'spacing');
    expect(spacingSummary.value).toBe('Réglages standards');
    expect(spacingSummary.detail).toContain('valeurs par défaut');
    expect(spacingSummary.insights.riskLevel).toBe('AAA');
  });

  it('signale les erreurs de chargement et les modules désactivés', () => {
    const snapshot = {
      audit: {
        status: 'error',
        error: 'axe-core indisponible',
        lastReport: null,
        summary: {
          headline: 'Audit en attente',
          detail: '',
          tone: 'info',
          totals: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0, total: 0 }
        }
      },
      tts: { status: 'error' },
      stt: { status: 'idle' },
      braille: { output: '' },
      contrast: { enabled: false },
      spacing: { lineHeight: 1.5, letterSpacing: 0 },
      runtime: {
        modules: {
          audit: { enabled: true, state: 'ready' },
          tts: { enabled: true, state: 'error', error: 'Échec de chargement' },
          stt: { enabled: false, state: 'idle' },
          braille: { enabled: true, state: 'ready' },
          contrast: { enabled: false, state: 'idle' },
          spacing: { enabled: true, state: 'error', error: 'Espacement indisponible' }
        }
      }
    };

    const statuses = summarizeStatuses(snapshot);

    const globalSummary = statuses.find((status) => status.id === 'global-score');
    expect(globalSummary.value).toBe('Indice AA');
    expect(globalSummary.detail).toContain('2/4 modules prêts');
    expect(globalSummary.detail).toContain('2 en erreur');
    expect(globalSummary.insights.compatLabel).toBe('2 incidents');

    const auditSummary = statuses.find((status) => status.id === 'audit');
    expect(auditSummary.tone).toBe('warning');
    expect(auditSummary.value).toBe('Analyse interrompue');
    expect(auditSummary.detail).toContain('axe-core');

    const ttsSummary = statuses.find((status) => status.id === 'tts');
    expect(ttsSummary.tone).toBe('alert');
    expect(ttsSummary.detail).toContain('chargement');

    const sttSummary = statuses.find((status) => status.id === 'stt');
    expect(sttSummary.tone).toBe('muted');
    expect(sttSummary.badge).toBe('Module désactivé');
    expect(sttSummary.value).toBe('Dictée désactivée');

    const contrastSummary = statuses.find((status) => status.id === 'contrast');
    expect(contrastSummary.tone).toBe('muted');
    expect(contrastSummary.value).toBe('Contraste désactivé');

    const spacingSummary = statuses.find((status) => status.id === 'spacing');
    expect(spacingSummary.tone).toBe('alert');
    expect(spacingSummary.value).toBe('Espacements indisponibles');
    expect(spacingSummary.detail).toContain('Espacement indisponible');
    expect(spacingSummary.insights.riskLevel).toBe('AA');
  });

  it('priorise les états actifs pour lecture, dictée et braille', () => {
    const snapshot = {
      audit: {
        status: 'critical',
        lastRun: 1700000000000,
        lastReport: {
          violations: [
            {
              id: 'color-contrast',
              impact: 'critical',
              description: 'Contraste insuffisant',
              help: 'Augmentez le contraste',
              helpUrl: 'https://example.test',
              nodes: [{ target: ['.btn'], failureSummary: 'ratio insuffisant' }]
            }
          ]
        },
        summary: {
          outcome: 'critical',
          headline: '1 erreur critique',
          detail: '1 critique',
          tone: 'alert',
          totals: { critical: 1, serious: 0, moderate: 0, minor: 0, unknown: 0, total: 1 },
          totalNodes: 1
        }
      },
      tts: { status: 'speaking', progress: 0.42 },
      stt: { status: 'listening' },
      braille: { output: '⠞⠑⠎⠞' },
      contrast: { enabled: true },
      spacing: { lineHeight: 1.9, letterSpacing: 0.1 },
      runtime: {
        modules: {
          audit: { enabled: true, state: 'ready' },
          tts: { enabled: true, state: 'ready' },
          stt: { enabled: true, state: 'ready' },
          braille: { enabled: true, state: 'ready' },
          contrast: { enabled: true, state: 'ready' },
          spacing: { enabled: true, state: 'ready' }
        }
      }
    };

    const statuses = summarizeStatuses(snapshot);

    const globalSummary = statuses.find((status) => status.id === 'global-score');
    expect(globalSummary.value).toBe('Indice A');
    expect(globalSummary.detail).toContain('6/6 modules prêts');
    expect(globalSummary.insights.compatLabel).toBe('Aucun incident');
    expect(globalSummary.tone).toBe('warning');

    const auditSummary = statuses.find((status) => status.id === 'audit');
    expect(auditSummary.tone).toBe('alert');
    expect(auditSummary.value).toBe('1 erreur critique');
    expect(auditSummary.detail).toContain('Export disponible');

    const ttsSummary = statuses.find((status) => status.id === 'tts');
    expect(ttsSummary.tone).toBe('active');
    expect(ttsSummary.detail).toContain('Progression');

    const sttSummary = statuses.find((status) => status.id === 'stt');
    expect(sttSummary.tone).toBe('active');
    expect(sttSummary.value).toBe('Écoute en cours');

    const brailleSummary = statuses.find((status) => status.id === 'braille');
    expect(brailleSummary.tone).toBe('active');
    expect(brailleSummary.value).toBe('Sortie disponible');

    const contrastSummary = statuses.find((status) => status.id === 'contrast');
    expect(contrastSummary.tone).toBe('active');
    expect(contrastSummary.value).toBe('Thème actif');

    const spacingSummary = statuses.find((status) => status.id === 'spacing');
    expect(spacingSummary.tone).toBe('active');
    expect(spacingSummary.value).toBe('Espacements ajustés');
    expect(spacingSummary.detail).toContain('Interlignage 1.9×');
    expect(spacingSummary.insights.latencyLabel).toBe('Non mesuré');
  });

  it('met en avant les métriques de compatibilité et de risque', () => {
    const runtimeEntry = {
      metrics: {
        attempts: 2,
        successes: 1,
        failures: 1,
        retryCount: 1,
        timings: {
          load: { last: 150, average: 120, samples: 1 },
          init: { last: null, average: null, samples: 0 },
          combinedAverage: 120
        },
        compat: {
          required: { features: ['SpeechRecognition'], browsers: [] },
          missing: { features: ['SpeechRecognition'], browsers: [] },
          unknown: { features: [], browsers: [] },
          status: 'partial',
          score: 'AA'
        }
      }
    };

    const metrics = computeModuleMetrics(runtimeEntry, { label: 'Reconnaissance vocale' });
    expect(metrics.latencyLabel).toBe('120 ms');
    expect(metrics.compatLabel).toContain('Pré-requis manquants');
    expect(metrics.riskLevel).toBe('AA');
    expect(metrics.announcement).toContain('indice AA');
    expect(getModuleCompatibilityScore(runtimeEntry)).toBe('AA');
  });
});
