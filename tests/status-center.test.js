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
      runtime: {
        modules: {
          tts: { enabled: true, state: 'ready' },
          stt: { enabled: true, state: 'ready' },
          braille: { enabled: true, state: 'ready' }
        }
      }
    };

    const statuses = summarizeStatuses(snapshot);
    expect(statuses).toHaveLength(3);

    const ttsSummary = statuses.find((status) => status.id === 'tts');
    expect(ttsSummary.value).toBe('En veille');
    expect(ttsSummary.detail).toContain('Voix active');

    const sttSummary = statuses.find((status) => status.id === 'stt');
    expect(sttSummary.value).toBe('En veille');
    expect(sttSummary.tone).toBe('info');

    const brailleSummary = statuses.find((status) => status.id === 'braille');
    expect(brailleSummary.value).toBe('En veille');
    expect(brailleSummary.tone).toBe('info');
  });

  it('signale les erreurs de chargement et les modules désactivés', () => {
    const snapshot = {
      tts: { status: 'error' },
      stt: { status: 'idle' },
      braille: { output: '' },
      runtime: {
        modules: {
          tts: { enabled: true, state: 'error', error: 'Échec de chargement' },
          stt: { enabled: false, state: 'idle' },
          braille: { enabled: true, state: 'ready' }
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
  });

  it('priorise les états actifs pour lecture, dictée et braille', () => {
    const snapshot = {
      tts: { status: 'speaking', progress: 0.42 },
      stt: { status: 'listening' },
      braille: { output: '⠞⠑⠎⠞' },
      runtime: {
        modules: {
          tts: { enabled: true, state: 'ready' },
          stt: { enabled: true, state: 'ready' },
          braille: { enabled: true, state: 'ready' }
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
  });
});
