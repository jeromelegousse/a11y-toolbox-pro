import { describe, expect, it } from 'vitest';
import { normalizeAxeReport, summarizeReport } from '../src/modules/audit-report.js';
import { buildAuditStatusText, renderAuditViolations, renderAuditStats } from '../src/modules/audit-view.js';

describe('audit report helpers', () => {
  it('normalise un rapport axe-core et calcule les totaux', () => {
    const raw = {
      url: 'https://example.test',
      timestamp: 1700000000000,
      violations: [
        {
          id: 'color-contrast',
          impact: 'critical',
          description: 'Contraste insuffisant',
          help: 'Augmentez le contraste',
          helpUrl: 'https://axe.test/color',
          nodes: [
            { target: ['.btn-primary'], failureSummary: 'ratio 2.1:1' },
            { target: ['.btn-secondary'], failureSummary: 'ratio 2.4:1' }
          ]
        },
        {
          id: 'label',
          impact: 'minor',
          description: 'Ajouter une étiquette explicite',
          nodes: [{ target: ['#search'], failureSummary: 'label manquant' }]
        }
      ],
      passes: [{ id: 'page-has-title' }],
      incomplete: []
    };

    const normalized = normalizeAxeReport(raw, { now: 1700000001234 });
    expect(normalized.url).toBe('https://example.test');
    expect(normalized.timestamp).toBe(1700000000000);
    expect(normalized.violations).toHaveLength(2);
    expect(normalized.violations[0].nodes).toHaveLength(2);
    expect(normalized.stats).toEqual({ critical: 1, serious: 0, moderate: 0, minor: 1, unknown: 0, total: 2 });
  });

  it('synthétise le rapport en détectant la sévérité dominante', () => {
    const normalized = {
      violations: [
        { impact: 'critical', nodes: [{}, {}] },
        { impact: 'serious', nodes: [{}] }
      ],
      stats: { critical: 1, serious: 1, moderate: 0, minor: 0, unknown: 0, total: 2 }
    };

    const summary = summarizeReport(normalized);
    expect(summary.outcome).toBe('critical');
    expect(summary.tone).toBe('alert');
    expect(summary.severity).toBe('alert');
    expect(summary.totalNodes).toBe(3);
    expect(summary.detail).toContain('critique');
  });

  it('génère un statut lisible pour la carte audit', () => {
    const state = {
      status: 'critical',
      lastRun: 1700000000000,
      summary: {
        headline: '1 erreur critique',
        detail: '1 critique',
        totals: { critical: 1, serious: 0, moderate: 0, minor: 0, unknown: 0, total: 1 },
        tone: 'alert'
      }
    };

    const statusText = buildAuditStatusText(state);
    expect(statusText.label).toBe('1 erreur critique');
    expect(statusText.detail).toContain('Dernier audit');
    expect(statusText.detail).toContain('critique');
  });

  it('produit un HTML accessible pour les violations et les statistiques', () => {
    const report = {
      violations: [
        {
          id: 'color-contrast',
          impact: 'critical',
          description: 'Contraste insuffisant',
          helpUrl: 'https://axe.test/color',
          nodes: [{ target: ['.btn-primary'], failureSummary: 'ratio 2.1:1' }]
        }
      ]
    };
    const violationsMarkup = renderAuditViolations(report);
    expect(violationsMarkup).toContain('<ol');
    expect(violationsMarkup).toContain('Contraste insuffisant');
    expect(violationsMarkup).toContain('Critique');
    expect(violationsMarkup).toContain('<code>.btn-primary</code>');
    expect(violationsMarkup).toContain('axe-core');

    const statsMarkup = renderAuditStats({ totals: { critical: 1, serious: 0, moderate: 0, minor: 0, total: 1 }, totalNodes: 1 });
    expect(statsMarkup).toContain('Critiques');
    expect(statsMarkup).toContain('1');
  });
});
