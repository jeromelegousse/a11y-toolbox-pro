export const manifest = {
  id: 'audit',
  name: 'Audit d’accessibilité',
  version: '0.1.0',
  description: 'Analyse la page courante avec axe-core et synthétise les violations détectées.',
  category: 'diagnostic',
  keywords: ['audit', 'accessibilite', 'axe-core'],
  guides: [
    {
      id: 'audit-fastpass',
      title: 'Audit axe-core express',
      description: 'Préparez, lancez et interprétez un audit axe-core ciblé pour prioriser vos correctifs.',
      category: 'diagnostic',
      order: 20,
      prerequisites: [
        { type: 'module', id: 'audit' },
        { type: 'module', id: 'tts', optional: true, label: 'Synthèse vocale (optionnel)' }
      ],
      assistance: {
        microcopy: 'Planifiez un audit après chaque livraison majeure et consignez les rapports dans votre outil de suivi.',
        examples: [
          {
            id: 'audit-fastpass-example-1',
            title: 'Astuce',
            description: 'Exportez le CSV depuis le module pour partager rapidement les violations critiques avec les développeurs.'
          },
          {
            id: 'audit-fastpass-example-2',
            title: 'Bonnes pratiques',
            description: 'Relancez un audit après chaque correction afin de confirmer la résolution des violations majeures.'
          }
        ]
      },
      steps: [
        {
          id: 'audit-module-ready',
          label: 'Vérifier la disponibilité du module Audit',
          mode: 'auto',
          detail: ({ moduleName, runtime }) => {
            const name = moduleName || 'Audit';
            if (!runtime?.enabled) return `${name} est désactivé dans la vue Organisation.`;
            if (runtime?.state === 'error') return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
            if (runtime?.state === 'loading') return `${name} se charge…`;
            if (runtime?.state === 'ready') return `${name} est prêt à lancer une analyse.`;
            return `${name} est en attente d’activation.`;
          },
          check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready'
        },
        {
          id: 'audit-run',
          label: 'Lancer un audit axe-core sur la page courante',
          mode: 'auto',
          detail: ({ snapshot, helpers }) => {
            const lastRun = snapshot?.audit?.lastRun;
            const summary = snapshot?.audit?.summary;
            if (!lastRun) return 'Aucun audit enregistré sur cette page.';
            const when = helpers.formatDateTime(lastRun);
            const headline = summary?.headline || 'Audit terminé';
            return when ? `${headline} (le ${when}).` : headline;
          },
          check: ({ snapshot }) => Boolean(snapshot?.audit?.lastRun)
        },
        {
          id: 'audit-critical',
          label: 'Prioriser les violations critiques et majeures',
          mode: 'auto',
          detail: ({ snapshot }) => {
            const totals = snapshot?.audit?.summary?.totals;
            if (!totals) return 'Aucun résultat axe-core à interpréter.';
            const critical = totals.critical ?? 0;
            const serious = totals.serious ?? 0;
            if (critical > 0) return `${critical} violation${critical > 1 ? 's' : ''} critique${critical > 1 ? 's' : ''} à corriger en priorité.`;
            if (serious > 0) return `${serious} violation${serious > 1 ? 's' : ''} majeure${serious > 1 ? 's' : ''} restante${serious > 1 ? 's' : ''}.`;
            return 'Aucune violation critique ou majeure détectée.';
          },
          check: ({ snapshot }) => {
            const totals = snapshot?.audit?.summary?.totals;
            if (!totals) return false;
            return (totals.critical ?? 0) === 0 && (totals.serious ?? 0) === 0;
          }
        },
        {
          id: 'audit-share',
          label: 'Partager le rapport et planifier les corrections',
          mode: 'manual',
          detail: 'Exportez le rapport (CSV ou JSON) et assignez les correctifs aux équipes concernées.',
          toggleLabels: {
            complete: 'Marquer comme partagé',
            reset: 'Marquer à refaire'
          }
        }
      ]
    }
  ],
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
