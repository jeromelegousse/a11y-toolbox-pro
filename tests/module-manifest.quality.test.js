import { describe, expect, it } from 'vitest';
import { assessManifestQuality } from '../src/module-manifest.js';

describe('assessManifestQuality', () => {
  it('classe un manifest complet au niveau AAA', () => {
    const manifest = {
      id: 'demo-module',
      name: 'Module démo complet',
      description:
        'Ce module fictif illustre toutes les métadonnées attendues pour rivaliser avec les suites professionnelles.',
      category: 'vision',
      keywords: ['demo', 'accessibilite'],
      config: {
        fields: [{ type: 'toggle', path: 'demo.enabled', label: 'Activer' }],
      },
      defaults: {
        state: { demo: { enabled: true } },
      },
      compat: {
        features: ['SpeechSynthesis'],
      },
      permissions: ['speechSynthesis'],
      guides: [{ id: 'demo-guide', steps: [{ id: 'step-1', label: 'Étape 1' }] }],
      authors: ['Équipe Accessibilité'],
      license: 'MIT',
    };

    const quality = assessManifestQuality(manifest);

    expect(quality.level).toBe('AAA');
    expect(quality.coverage).toBe(1);
    expect(quality.missing).toEqual([]);
    expect(quality.recommendations).toEqual([]);
    expect(quality.summary).toMatch(/Couverture métadonnées/);
  });

  it('met en évidence les manques d’un manifest minimal', () => {
    const manifest = { id: 'minimal' };
    const quality = assessManifestQuality(manifest);

    expect(['B', 'C']).toContain(quality.level);
    expect(quality.coverage).toBeLessThan(0.3);
    expect(quality.missing).toContain('Guides FastPass');
    expect(quality.recommendations.length).toBeGreaterThan(0);
    expect(quality.detail).toMatch(/À compléter/);
  });
});
