export const manifest = {
  id: 'audit',
  name: 'Audit d’accessibilité',
  version: '0.1.0',
  description: 'Analyse la page courante avec axe-core et synthétise les violations détectées.',
  category: 'diagnostic',
  keywords: ['audit', 'accessibilite', 'axe-core'],
  runtime: {
    preload: 'pointer'
  },
  permissions: ['dom-inspection', 'activity-log'],
  defaults: {
    state: {
      audit: {
        status: 'idle',
        lastRun: null,
        lastReport: null,
        summary: {
          outcome: 'idle',
          totals: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0, total: 0 },
          totalNodes: 0,
          tone: 'info',
          severity: 'info',
          headline: 'Audit en attente',
          detail: ''
        },
        error: null
      }
    }
  }
};

export default manifest;
