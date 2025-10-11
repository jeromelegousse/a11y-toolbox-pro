import { describe, expect, it } from 'vitest';
import { summarizeStatuses } from '../src/status-center.js';

describe('summarizeStatuses', () => {
  it('retourne un état prêt par défaut pour les modules critiques', () => {
    const snapshot = {
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
          tts: { enabled: true, state: 'ready' },
          stt: { enabled: true, state: 'ready' },
          braille: { enabled: true, state: 'ready' },
          contrast: { enabled: true, state: 'ready' },
          spacing: { enabled: true, state: 'ready' }
        }
      }
    };

    const statuses = summarizeStatuses(snapshot);
    expect(statuses).toHaveLength(5);

    const ttsSummary = statuses.find((status) => status.id === 'tts');
    expect(ttsSummary.value).toBe('En veille');
    expect(ttsSummary.detail).toContain('Voix active');

    const sttSummary = statuses.find((status) => status.id === 'stt');
    expect(sttSummary.value).toBe('En veille');
    expect(sttSummary.tone).toBe('info');

    const brailleSummary = statuses.find((status) => status.id === 'braille');
    expect(brailleSummary.value).toBe('En veille');
    expect(brailleSummary.tone).toBe('info');

    const contrastSummary = statuses.find((status) => status.id === 'contrast');
    expect(contrastSummary.value).toBe('En veille');
    expect(contrastSummary.detail).toContain('Prêt à renforcer le contraste');

    const spacingSummary = statuses.find((status) => status.id === 'spacing');
    expect(spacingSummary.value).toBe('Réglages standards');
    expect(spacingSummary.detail).toContain('valeurs par défaut');
  });

  it('signale les erreurs de chargement et les modules désactivés', () => {
    const snapshot = {
      tts: { status: 'error' },
      stt: { status: 'idle' },
      braille: { output: '' },
      contrast: { enabled: false },
      spacing: { lineHeight: 1.5, letterSpacing: 0 },
      runtime: {
        modules: {
          tts: { enabled: true, state: 'error', error: 'Échec de chargement' },
          stt: { enabled: false, state: 'idle' },
          braille: { enabled: true, state: 'ready' },
          contrast: { enabled: false, state: 'idle' },
          spacing: { enabled: true, state: 'error', error: 'Espacement indisponible' }
        }
      }
    };

    const statuses = summarizeStatuses(snapshot);

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
  });

  it('priorise les états actifs pour lecture, dictée et braille', () => {
    const snapshot = {
      tts: { status: 'speaking', progress: 0.42 },
      stt: { status: 'listening' },
      braille: { output: '⠞⠑⠎⠞' },
      contrast: { enabled: true },
      spacing: { lineHeight: 1.9, letterSpacing: 0.1 },
      runtime: {
        modules: {
          tts: { enabled: true, state: 'ready' },
          stt: { enabled: true, state: 'ready' },
          braille: { enabled: true, state: 'ready' },
          contrast: { enabled: true, state: 'ready' },
          spacing: { enabled: true, state: 'ready' }
        }
      }
    };

    const statuses = summarizeStatuses(snapshot);

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
  });
});
