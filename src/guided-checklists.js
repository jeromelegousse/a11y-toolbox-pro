import { moduleCatalog, moduleCatalogById } from './module-catalog.js';
import { summarizeStatuses } from './status-center.js';

function readPath(snapshot, path, fallback) {
  if (!snapshot || typeof snapshot !== 'object') return fallback;
  const segments = path.split('.');
  let current = snapshot;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      return fallback;
    }
  }
  return current;
}

const CRITICAL_MODULES = [
  { id: 'tts', label: 'Synthèse vocale' },
  { id: 'stt', label: 'Reconnaissance vocale' },
  { id: 'braille', label: 'Transcription braille' },
];

const DEFAULT_GUIDE_ORDER = 100;

export const fastPassFlows = [
  {
    id: 'audit-fastpass',
    moduleId: 'audit',
    title: 'Audit axe-core express',
    description: 'Préparez, lancez et diffusez un audit axe-core ciblé.',
    category: 'diagnostic',
    order: 20,
    prerequisites: [
      { type: 'module', id: 'audit' },
      { type: 'module', id: 'tts', optional: true, label: 'Synthèse vocale (optionnel)' },
    ],
    assistance: {
      microcopy:
        'Planifiez un audit après chaque livraison majeure et consignez les rapports dans votre outil de suivi.',
      examples: [
        {
          id: 'audit-fastpass-example-1',
          title: 'Astuce',
          description:
            'Exportez le CSV pour partager rapidement les violations critiques avec les équipes produit.',
        },
        {
          id: 'audit-fastpass-example-2',
          title: 'Bonnes pratiques',
          description:
            'Relancez un audit après chaque correctif majeur pour confirmer la résolution.',
        },
      ],
      resources: [
        {
          id: 'audit-fastpass-axe-doc',
          href: 'https://dequeuniversity.com/axe/devtools',
          label: 'Documentation axe DevTools',
          external: true,
        },
        {
          id: 'audit-fastpass-fastpass',
          href: 'https://accessibilityinsights.io/docs/en/web/fastpass/',
          label: 'Référence FastPass Accessibility Insights',
          external: true,
        },
      ],
    },
    steps: [
      {
        id: 'audit-module-ready',
        label: 'Vérifier la disponibilité du module Audit',
        mode: 'auto',
        detail: ({ moduleName, runtime }) => {
          const name = moduleName || 'Audit';
          if (!runtime?.enabled) return `${name} est désactivé dans la vue Organisation.`;
          if (runtime?.state === 'error')
            return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
          if (runtime?.state === 'loading') return `${name} se charge…`;
          if (runtime?.state === 'ready') return `${name} est prêt à lancer une analyse.`;
          return `${name} est en attente d’activation.`;
        },
        check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready',
        announce: 'Module Audit vérifié.',
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
        check: ({ snapshot }) => Boolean(snapshot?.audit?.lastRun),
        announce: 'Audit axe-core exécuté.',
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
          if (critical > 0)
            return `${critical} violation${critical > 1 ? 's' : ''} critique${critical > 1 ? 's' : ''} à corriger en priorité.`;
          if (serious > 0)
            return `${serious} violation${serious > 1 ? 's' : ''} majeure${serious > 1 ? 's' : ''} restante${serious > 1 ? 's' : ''}.`;
          return 'Aucune violation critique ou majeure détectée.';
        },
        check: ({ snapshot }) => {
          const totals = snapshot?.audit?.summary?.totals;
          if (!totals) return false;
          return (totals.critical ?? 0) === 0 && (totals.serious ?? 0) === 0;
        },
        announce: 'Synthèse des violations critiques mise à jour.',
      },
      {
        id: 'audit-share',
        label: 'Partager le rapport et planifier les corrections',
        mode: 'manual',
        detail:
          'Exportez le rapport (CSV ou JSON) et assignez les correctifs aux équipes concernées.',
        toggleLabels: {
          complete: 'Marquer comme partagé',
          reset: 'Marquer à refaire',
        },
      },
    ],
    tags: ['fastpass', 'audit'],
  },
  {
    id: 'tts-onboarding',
    moduleId: 'tts',
    title: 'Lecture vocale opérationnelle',
    description: 'Activez la synthèse vocale, vérifiez les voix et testez la lecture.',
    category: 'services',
    order: 30,
    prerequisites: [{ type: 'module', id: 'tts' }],
    assistance: {
      microcopy:
        'Proposez un test de lecture lors de l’onboarding et ajustez vitesse/timbre selon le profil utilisateur.',
      examples: [
        {
          id: 'tts-onboarding-example-1',
          title: 'Astuce',
          description:
            'Conservez une voix de secours (navigateur) si la voix personnalisée disparaît après une mise à jour.',
        },
      ],
      resources: [
        {
          id: 'tts-fastpass-api',
          href: 'https://developer.mozilla.org/docs/Web/API/SpeechSynthesis',
          label: 'API SpeechSynthesis (MDN)',
          external: true,
        },
      ],
    },
    steps: [
      {
        id: 'tts-module-ready',
        label: 'Vérifier que la synthèse vocale est activée',
        mode: 'auto',
        detail: ({ moduleName, runtime }) => {
          const name = moduleName || 'Synthèse vocale';
          if (!runtime?.enabled) return `${name} est désactivée dans la vue Organisation.`;
          if (runtime?.state === 'error')
            return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
          if (runtime?.state === 'loading') return `${name} se charge…`;
          if (runtime?.state === 'ready') return `${name} est prête.`;
          return `${name} est en attente d’activation.`;
        },
        check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready',
        announce: 'Synthèse vocale prête.',
      },
      {
        id: 'tts-voices',
        label: 'Recenser les voix disponibles',
        mode: 'auto',
        detail: ({ snapshot }) => {
          const voices = snapshot?.tts?.availableVoices ?? [];
          if (!voices.length) return 'Aucune voix détectée pour le moment.';
          const selectedId = snapshot?.tts?.voice || '';
          const selected = voices.find((voice) => voice.voiceURI === selectedId);
          if (selected) {
            return `${voices.length} voix détectées · ${selected.name} (${selected.lang}) sélectionnée.`;
          }
          return `${voices.length} voix détectées. Sélectionnez la plus claire pour l’utilisateur.`;
        },
        check: ({ snapshot }) => (snapshot?.tts?.availableVoices ?? []).length > 0,
        announce: 'Voix disponibles vérifiées.',
      },
      {
        id: 'tts-default-voice',
        label: 'Définir la voix par défaut',
        mode: 'auto',
        detail: ({ snapshot }) => {
          const voices = snapshot?.tts?.availableVoices ?? [];
          const selectedId = snapshot?.tts?.voice;
          if (!voices.length) return 'En attente de voix détectées.';
          if (!selectedId) return 'Aucune voix sélectionnée : choisissez une option adaptée.';
          const selected = voices.find((voice) => voice.voiceURI === selectedId);
          if (selected) {
            return `Voix active : ${selected.name} (${selected.lang}).`;
          }
          return 'Voix personnalisée sélectionnée.';
        },
        check: ({ snapshot }) => {
          const voices = snapshot?.tts?.availableVoices ?? [];
          const selected = snapshot?.tts?.voice;
          if (!voices.length) return false;
          return !!selected;
        },
        announce: 'Voix par défaut confirmée.',
      },
      {
        id: 'tts-test',
        label: 'Tester la lecture d’un extrait',
        mode: 'manual',
        detail: 'Lancez la lecture d’un paragraphe représentatif et vérifiez le confort d’écoute.',
        toggleLabels: {
          complete: 'Test effectué',
          reset: 'Tester à nouveau',
        },
      },
    ],
    tags: ['fastpass', 'tts'],
  },
  {
    id: 'stt-onboarding',
    moduleId: 'stt',
    title: 'Configurer la dictée vocale',
    description: 'Activez la reconnaissance vocale, validez la compatibilité et réalisez un test.',
    category: 'interaction',
    order: 50,
    prerequisites: [{ type: 'module', id: 'stt' }],
    assistance: {
      microcopy:
        'Informez l’utilisateur de la collecte audio et invitez-le à autoriser le micro avant la première dictée.',
      resources: [
        {
          id: 'stt-fastpass-mdn',
          href: 'https://developer.mozilla.org/docs/Web/API/SpeechRecognition',
          label: 'API SpeechRecognition (MDN)',
          external: true,
        },
      ],
    },
    steps: [
      {
        id: 'stt-module-ready',
        label: 'Vérifier que la dictée est activée',
        mode: 'auto',
        detail: ({ moduleName, runtime }) => {
          const name = moduleName || 'Reconnaissance vocale';
          if (!runtime?.enabled) return `${name} est désactivée.`;
          if (runtime?.state === 'error')
            return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
          if (runtime?.state === 'loading') return `${name} se charge…`;
          if (runtime?.state === 'ready') return `${name} est prête.`;
          return `${name} est en attente d’activation.`;
        },
        check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready',
        announce: 'Dictée vocale prête.',
      },
      {
        id: 'stt-compatibility',
        label: 'Contrôler la compatibilité navigateur',
        mode: 'auto',
        detail: ({ runtime }) => {
          const compat = runtime?.metrics?.compat;
          if (!compat) return 'Compatibilité non évaluée.';
          if (compat.status === 'partial') {
            const missing = compat.missing?.features?.[0] || 'Fonctionnalité manquante';
            return `Compatibilité partielle (${missing}).`;
          }
          if (compat.status === 'full') return 'Compatibilité confirmée.';
          if (compat.status === 'unknown') return 'Compatibilité à vérifier manuellement.';
          return 'Compatibilité non déterminée.';
        },
        check: ({ runtime }) => {
          const compat = runtime?.metrics?.compat;
          if (!compat) return false;
          return compat.status === 'full' || compat.status === 'unknown';
        },
        announce: 'Compatibilité dictée vérifiée.',
      },
      {
        id: 'stt-test',
        label: 'Effectuer un test de dictée',
        mode: 'manual',
        detail: ({ snapshot }) => {
          const transcript = snapshot?.stt?.transcript || '';
          if (!transcript)
            return 'Aucun texte dicté pour le moment. Lancez une courte phrase test.';
          return `Dernière dictée : « ${transcript.slice(0, 60)}${transcript.length > 60 ? '…' : ''} ».`;
        },
        toggleLabels: {
          complete: 'Dictée validée',
          reset: 'Retester',
        },
      },
    ],
    tags: ['fastpass', 'stt'],
  },
  {
    id: 'braille-setup',
    moduleId: 'braille',
    title: 'Transcription braille prête',
    description: 'Activez la transcription et validez un extrait braille.',
    category: 'conversion',
    order: 60,
    prerequisites: [{ type: 'module', id: 'braille' }],
    assistance: {
      microcopy:
        'Gardez un extrait récurrent (formulaire ou bouton) pour tester rapidement la transcription braille.',
      resources: [
        {
          id: 'braille-fastpass-w3c',
          href: 'https://www.w3.org/WAI/WCAG21/Techniques/general/G101',
          label: 'WCAG G101 — Sortie braille cohérente',
          external: true,
        },
      ],
    },
    steps: [
      {
        id: 'braille-ready',
        label: 'Vérifier l’activation de la transcription braille',
        mode: 'auto',
        detail: ({ moduleName, runtime }) => {
          const name = moduleName || 'Transcription braille';
          if (!runtime?.enabled) return `${name} est désactivée.`;
          if (runtime?.state === 'error')
            return runtime?.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
          if (runtime?.state === 'loading') return `${name} se charge…`;
          if (runtime?.state === 'ready') return `${name} est prête.`;
          return `${name} est en attente d’activation.`;
        },
        check: ({ runtime }) => !!runtime?.enabled && runtime.state === 'ready',
        announce: 'Module braille prêt.',
      },
      {
        id: 'braille-output',
        label: 'Générer un extrait braille',
        mode: 'manual',
        detail: ({ snapshot }) => {
          const output = snapshot?.braille?.output || '';
          if (!output)
            return 'Aucune transcription générée : testez avec un texte simple (ex. « Formulaire envoyé »).';
          return `Dernière sortie : ${output.slice(0, 16)}${output.length > 16 ? '…' : ''}`;
        },
        toggleLabels: {
          complete: 'Transcription validée',
          reset: 'Re-tester',
        },
      },
    ],
    tags: ['fastpass', 'braille'],
  },
  {
    id: 'contrast-fastpass',
    moduleId: 'contrast',
    title: 'Thème haute visibilité vérifié',
    description:
      'Activez le thème renforcé, contrôlez la lisibilité et validez la restitution clavier.',
    category: 'vision',
    order: 25,
    prerequisites: [{ type: 'module', id: 'contrast' }],
    assistance: {
      microcopy:
        'Couplez le thème avec un profil Vision basse pour offrir un raccourci à vos testeurs et product owners.',
      resources: [
        {
          id: 'contrast-fastpass-wcag',
          href: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum',
          label: 'WCAG 1.4.3 — Contraste minimum',
          external: true,
        },
      ],
    },
    steps: [
      {
        id: 'contrast-enabled-check',
        label: 'Activer le thème renforcé',
        mode: 'auto',
        detail: ({ snapshot }) =>
          snapshot?.contrast?.enabled
            ? 'Thème haute visibilité actif.'
            : 'Le thème renforcé est désactivé.',
        check: ({ snapshot }) => !!snapshot?.contrast?.enabled,
        announce: 'Thème contraste activé.',
      },
      {
        id: 'contrast-ui-review',
        label: 'Revue visuelle rapide',
        mode: 'manual',
        detail: 'Contrôlez la lisibilité des zones interactives et l’absence d’inversion gênante.',
        toggleLabels: {
          complete: 'Revue terminée',
          reset: 'À revoir',
        },
      },
      {
        id: 'contrast-keyboard',
        label: 'Tester le contraste au clavier',
        mode: 'manual',
        detail: 'Parcourez quelques composants au clavier pour vérifier le focus visible.',
        toggleLabels: {
          complete: 'Focus validé',
          reset: 'Re-tester',
        },
      },
    ],
    tags: ['fastpass', 'vision'],
  },
  {
    id: 'vision-personalization',
    moduleId: 'spacing',
    title: 'Personnalisation vision & confort de lecture',
    description:
      'Combinez contraste renforcé, espacements personnalisés et vitesse vocale adaptée.',
    category: 'vision',
    order: 40,
    prerequisites: [
      { type: 'module', id: 'contrast' },
      { type: 'module', id: 'spacing' },
      { type: 'module', id: 'tts', optional: true, label: 'Synthèse vocale (optionnel)' },
    ],
    assistance: {
      microcopy:
        'Ajustez progressivement les paramètres et sauvegardez un profil dédié pour le reproduire facilement.',
      examples: [
        {
          id: 'vision-personalization-example-1',
          title: 'Exemple',
          description:
            'Profil Vision basse : interlignage 1,9 · espacement 12 % · vitesse vocale 0,9×.',
        },
      ],
      resources: [
        {
          id: 'vision-personalization-wcag',
          href: 'https://www.w3.org/WAI/WCAG21/Understanding/text-spacing',
          label: 'WCAG 1.4.12 — Espacement du texte',
          external: true,
        },
      ],
    },
    steps: [
      {
        id: 'contrast-enabled',
        label: 'Activer le thème à fort contraste',
        mode: 'auto',
        detail: ({ snapshot }) =>
          snapshot?.contrast?.enabled
            ? 'Thème haute visibilité actif.'
            : 'Le thème renforcé est désactivé.',
        check: ({ snapshot }) => !!snapshot?.contrast?.enabled,
        announce: 'Contraste renforcé validé.',
      },
      {
        id: 'spacing-adjustment',
        label: 'Adapter les espacements du texte',
        mode: 'auto',
        detail: ({ snapshot }) => {
          const lineHeight = Number(snapshot?.spacing?.lineHeight ?? 1.5);
          const letterSpacing = Number(snapshot?.spacing?.letterSpacing ?? 0);
          if (Number.isNaN(lineHeight) || Number.isNaN(letterSpacing))
            return 'Valeurs d’espacement non définies.';
          if (Math.abs(lineHeight - 1.5) < 0.05 && Math.abs(letterSpacing - 0) < 0.01) {
            return 'Espacements par défaut encore appliqués.';
          }
          return `Interlignage ${lineHeight.toFixed(1)} · Espacement ${Math.round(letterSpacing * 100)} %.`;
        },
        check: ({ snapshot }) => {
          const lineHeight = Number(snapshot?.spacing?.lineHeight ?? 1.5);
          const letterSpacing = Number(snapshot?.spacing?.letterSpacing ?? 0);
          if (Number.isNaN(lineHeight) || Number.isNaN(letterSpacing)) return false;
          return Math.abs(lineHeight - 1.5) >= 0.05 || Math.abs(letterSpacing - 0) >= 0.01;
        },
        announce: 'Espacements personnalisés appliqués.',
      },
      {
        id: 'tts-adjustment',
        label: 'Ajuster la vitesse de lecture vocale',
        mode: 'auto',
        when: ({ getRuntime }) => !!getRuntime('tts')?.enabled,
        detail: ({ snapshot }) => {
          if (!snapshot?.tts) return 'Synthèse vocale non configurée.';
          const rate = Number(snapshot.tts.rate ?? 1);
          if (Number.isNaN(rate)) return 'Vitesse vocale inconnue.';
          if (Math.abs(rate - 1) < 0.05) return 'Vitesse par défaut (1,0×).';
          return `Vitesse actuelle : ${rate.toFixed(1)}×.`;
        },
        check: ({ snapshot }) => {
          if (!snapshot?.tts) return true;
          const rate = Number(snapshot.tts.rate ?? 1);
          if (Number.isNaN(rate)) return false;
          return Math.abs(rate - 1) >= 0.05;
        },
        announce: 'Réglage de vitesse vocale vérifié.',
      },
      {
        id: 'vision-profile-save',
        label: 'Sauvegarder un profil personnalisé',
        mode: 'manual',
        detail: 'Enregistrez ou exportez un profil dédié pour partager ces réglages.',
        toggleLabels: {
          complete: 'Profil sauvegardé',
          reset: 'À revoir',
        },
      },
    ],
    tags: ['fastpass', 'vision', 'profil'],
  },
];

function ensureArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function formatDateTime(timestamp) {
  if (!timestamp) return null;
  const time = Number(timestamp);
  if (!Number.isFinite(time) || time <= 0) return null;
  try {
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return formatter.format(new Date(time));
  } catch (error) {
    try {
      return new Date(time).toLocaleString('fr-FR');
    } catch (fallbackError) {
      return String(time);
    }
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return null;
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return null;
  const diff = Date.now() - value;
  if (!Number.isFinite(diff)) return null;
  const absolute = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (absolute < minute) {
    return 'il y a moins d’une minute';
  }
  if (absolute < hour) {
    const minutes = Math.round(absolute / minute);
    return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  if (absolute < day) {
    const hours = Math.round(absolute / hour);
    return `il y a ${hours} heure${hours > 1 ? 's' : ''}`;
  }
  const formatted = formatDateTime(value);
  return formatted ? `le ${formatted}` : null;
}

function describeRuntimeState(name, runtime = {}) {
  if (!runtime.enabled) {
    return `${name} est désactivé. Activez le module depuis la vue Organisation.`;
  }
  if (runtime.state === 'error') {
    return runtime.error ? `Erreur signalée : ${runtime.error}` : `${name} est en erreur.`;
  }
  if (runtime.state === 'loading') {
    const relative = formatRelativeTime(runtime.metrics?.lastAttemptAt);
    return relative ? `Chargement en cours (${relative}).` : 'Chargement en cours.';
  }
  if (runtime.state === 'ready') {
    const compat = runtime.metrics?.compat;
    if (compat?.status === 'partial') {
      return 'Module prêt (compatibilité partielle détectée).';
    }
    return 'Module opérationnel.';
  }
  return 'Statut non communiqué.';
}

function getRuntime(runtimeMap, moduleId) {
  if (!moduleId) return {};
  return runtimeMap?.[moduleId] || {};
}

function evaluatePrerequisites(prerequisites, context) {
  const list = ensureArray(prerequisites);
  if (!list.length) return [];
  return list
    .map((entry, index) => {
      if (typeof entry === 'string') {
        return evaluatePrerequisite({ type: 'module', id: entry }, context, index);
      }
      if (!entry || typeof entry !== 'object') return null;
      return evaluatePrerequisite(entry, context, index);
    })
    .filter(Boolean);
}

function evaluatePrerequisite(entry, context, index) {
  const type = typeof entry.type === 'string' ? entry.type.toLowerCase() : 'module';
  const optional = entry.optional === true;
  if (type === 'module') {
    const targetId =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : typeof entry.module === 'string'
          ? entry.module.trim()
          : null;
    if (!targetId) return null;
    const manifest = moduleCatalogById.get(targetId)?.manifest;
    const runtime = getRuntime(context.runtimeMap, targetId);
    const label = typeof entry.label === 'string' ? entry.label : manifest?.name || targetId;
    const customCheck =
      typeof entry.check === 'function'
        ? !!entry.check({ ...context, moduleId: targetId, manifest, runtime })
        : null;
    const met = customCheck !== null ? customCheck : !!runtime.enabled && runtime.state !== 'error';
    let detail = '';
    if (typeof entry.detail === 'function') {
      detail = entry.detail({ ...context, moduleId: targetId, manifest, runtime }) || '';
    } else if (typeof entry.detail === 'string') {
      detail = entry.detail;
    } else {
      detail = describeRuntimeState(label, runtime);
    }
    return {
      id: targetId,
      label,
      type: 'module',
      optional,
      met,
      status: met ? 'met' : optional ? 'optional' : 'missing',
      detail,
      index,
    };
  }

  const label =
    typeof entry.label === 'string'
      ? entry.label
      : typeof entry.id === 'string'
        ? entry.id
        : `Prérequis ${index + 1}`;
  const met = typeof entry.check === 'function' ? !!entry.check(context) : false;
  const detail = typeof entry.detail === 'function' ? entry.detail(context) : entry.detail || '';
  return {
    id: typeof entry.id === 'string' ? entry.id : `prerequisite-${index}`,
    label,
    type,
    optional,
    met,
    status: met ? 'met' : optional ? 'optional' : 'missing',
    detail,
    index,
  };
}

function evaluateStep(stepDefinition, context, manualMap, scenarioId, index) {
  if (!stepDefinition || typeof stepDefinition !== 'object') return null;
  if (typeof stepDefinition.when === 'function' && !stepDefinition.when(context)) {
    return null;
  }
  const rawId =
    typeof stepDefinition.id === 'string' && stepDefinition.id.trim()
      ? stepDefinition.id.trim()
      : `step-${index}`;
  const key = `${scenarioId}:${rawId}`;
  const mode = stepDefinition.mode === 'manual' ? 'manual' : 'auto';
  const detail =
    typeof stepDefinition.detail === 'function'
      ? stepDefinition.detail(context) || ''
      : stepDefinition.detail || '';
  let completed = false;
  if (mode === 'auto') {
    completed =
      typeof stepDefinition.check === 'function' ? !!stepDefinition.check(context) : false;
  } else {
    completed = !!manualMap[key];
  }
  const announcement =
    typeof stepDefinition.announce === 'function'
      ? stepDefinition.announce({ ...context, detail, completed }) || ''
      : stepDefinition.announce || [stepDefinition.label, detail].filter(Boolean).join('. ');
  const toggleLabels = {
    complete: stepDefinition.toggleLabels?.complete || 'Marquer comme fait',
    reset: stepDefinition.toggleLabels?.reset || 'Marquer à refaire',
  };
  const tag =
    typeof stepDefinition.tag === 'string'
      ? stepDefinition.tag
      : mode === 'auto'
        ? 'Suivi automatique'
        : 'Étape manuelle';
  return {
    id: rawId,
    key,
    label: stepDefinition.label || rawId,
    detail,
    mode,
    state: mode,
    completed,
    status: completed ? 'done' : 'todo',
    announcement,
    toggleLabels,
    tag,
    hints: ensureArray(stepDefinition.hints),
    index,
  };
}

function buildScenarioFromDefinition(definition, baseContext) {
  if (!definition || typeof definition !== 'object') return null;
  const scenarioId =
    typeof definition.id === 'string' && definition.id.trim() ? definition.id.trim() : null;
  if (!scenarioId) return null;

  const manifest =
    baseContext.manifest || moduleCatalogById.get(baseContext.moduleId || '')?.manifest || null;
  const moduleName = manifest?.name || baseContext.moduleId || '';
  const runtime = getRuntime(baseContext.runtimeMap, baseContext.moduleId);

  const context = {
    ...baseContext,
    scenarioId,
    manifest,
    moduleName,
    runtime,
    helpers: {
      formatDateTime,
      formatRelativeTime,
      readPath,
    },
    getRuntime: (moduleId) => getRuntime(baseContext.runtimeMap, moduleId),
    getManifest: (moduleId) => moduleCatalogById.get(moduleId)?.manifest || null,
  };

  const prerequisites = evaluatePrerequisites(definition.prerequisites, context);

  const steps = [];
  const rawSteps = ensureArray(definition.steps);
  rawSteps.forEach((stepDefinition, index) => {
    const step = evaluateStep(stepDefinition, context, baseContext.manualMap, scenarioId, index);
    if (step) steps.push(step);
  });

  if (!steps.length) return null;

  const completedCount = steps.filter((step) => step.completed).length;
  const total = steps.length;
  const progress = total > 0 ? completedCount / total : 0;
  const nextIndex = steps.findIndex((step) => !step.completed);
  const recommendedIndex = nextIndex >= 0 ? nextIndex : steps.length ? steps.length - 1 : 0;
  const nextStep = nextIndex >= 0 ? steps[nextIndex] : null;
  const blocked = prerequisites.some((entry) => !entry.met && !entry.optional);

  const assistance = definition.assistance || {};
  const assistanceMicrocopy =
    typeof assistance.microcopy === 'function'
      ? assistance.microcopy(context)
      : assistance.microcopy || '';
  const assistanceExamples = ensureArray(assistance.examples)
    .map((example, index) => {
      if (typeof example === 'string') {
        return {
          id: `${scenarioId}-example-${index}`,
          title: '',
          description: example,
        };
      }
      if (!example || typeof example !== 'object') return null;
      const id = typeof example.id === 'string' ? example.id : `${scenarioId}-example-${index}`;
      const title =
        typeof example.title === 'function' ? example.title(context) : example.title || '';
      const description =
        typeof example.description === 'function'
          ? example.description(context)
          : example.description || '';
      if (!title && !description) return null;
      return { id, title, description };
    })
    .filter(Boolean);
  const assistanceResources = ensureArray(assistance.resources)
    .map((resource, index) => {
      if (!resource || typeof resource !== 'object' || !resource.href) return null;
      const id = typeof resource.id === 'string' ? resource.id : `${scenarioId}-resource-${index}`;
      const label =
        typeof resource.label === 'function'
          ? resource.label(context)
          : resource.label || resource.href;
      return {
        id,
        href: resource.href,
        label,
        external: resource.external === true,
      };
    })
    .filter(Boolean);

  const tone =
    definition.tone || (blocked ? 'warning' : completedCount === total ? 'confirm' : 'info');

  const summary =
    typeof definition.summary === 'function'
      ? definition.summary(context)
      : definition.summary || '';

  const statusLabel = blocked
    ? 'Prérequis manquants'
    : completedCount === total
      ? 'Parcours terminé'
      : `${total - completedCount} étape${total - completedCount > 1 ? 's' : ''} restante${total - completedCount > 1 ? 's' : ''}`;

  return {
    id: scenarioId,
    title: definition.title || moduleName || scenarioId,
    description:
      typeof definition.description === 'function'
        ? definition.description(context)
        : definition.description || '',
    tone,
    category: definition.category || manifest?.category || 'general',
    order: Number.isFinite(definition.order) ? definition.order : DEFAULT_GUIDE_ORDER,
    moduleId: baseContext.moduleId || null,
    moduleName,
    steps,
    completedCount,
    total,
    progress: Math.min(1, Math.max(0, progress)),
    nextStep,
    nextStepIndex: nextIndex,
    recommendedStepIndex: recommendedIndex,
    prerequisites,
    blocked,
    assistance: {
      microcopy: assistanceMicrocopy,
      examples: assistanceExamples,
      resources: assistanceResources,
    },
    tags: ensureArray(definition.tags),
    summary,
    statusLabel,
    liveAnnouncement:
      typeof definition.announce === 'function'
        ? definition.announce({ ...context, steps })
        : definition.announce || '',
    toneExplicit: !!definition.tone,
  };
}

function buildCriticalServicesScenario(baseContext) {
  const runtimeMap = baseContext.runtimeMap || {};
  const steps = [];
  CRITICAL_MODULES.forEach((entry, index) => {
    const manifest = moduleCatalogById.get(entry.id)?.manifest;
    const name = manifest?.name || entry.label || entry.id;
    const runtime = getRuntime(runtimeMap, entry.id);
    const detail = describeRuntimeState(name, runtime);
    const completed = !!runtime.enabled && runtime.state === 'ready';
    steps.push({
      id: `critical-${entry.id}`,
      key: `core-services:${entry.id}`,
      label: `${name} opérationnel`,
      detail,
      mode: 'auto',
      state: 'auto',
      completed,
      status: completed ? 'done' : 'todo',
      announcement: `${name}. ${detail}`,
      toggleLabels: {
        complete: 'Marquer comme fait',
        reset: 'Marquer à refaire',
      },
      tag: 'Suivi automatique',
      hints: [],
      index,
    });
  });

  if (!steps.length) return null;

  const summaries = summarizeStatuses(baseContext.snapshot || {});
  const alerts = summaries.filter((entry) => entry.tone === 'alert');
  const hasAlerts = alerts.length > 0;
  const alertDetail = hasAlerts
    ? `${alerts.length} alerte${alerts.length > 1 ? 's' : ''} critique${alerts.length > 1 ? 's' : ''} à traiter.`
    : 'Aucune alerte critique active.';

  steps.push({
    id: 'critical-alerts',
    key: 'core-services:alerts',
    label: 'Surveiller les alertes en cours',
    detail: alertDetail,
    mode: 'auto',
    state: 'auto',
    completed: !hasAlerts,
    status: !hasAlerts ? 'done' : 'todo',
    announcement: `Alertes modules. ${alertDetail}`,
    toggleLabels: {
      complete: 'Marquer comme fait',
      reset: 'Marquer à refaire',
    },
    tag: 'Suivi automatique',
    hints: [],
    index: steps.length,
  });

  const completedCount = steps.filter((step) => step.completed).length;
  const total = steps.length;
  const progress = total > 0 ? completedCount / total : 0;
  const nextIndex = steps.findIndex((step) => !step.completed);
  const recommendedIndex = nextIndex >= 0 ? nextIndex : steps.length ? steps.length - 1 : 0;
  const nextStep = nextIndex >= 0 ? steps[nextIndex] : null;

  return {
    id: 'core-services',
    title: 'Surveillance des services critiques',
    description:
      'Validez l’état des modules temps réel (voix, dictée, braille) et repérez les alertes actives.',
    tone: completedCount === total ? 'confirm' : 'warning',
    category: 'monitoring',
    order: 0,
    moduleId: null,
    moduleName: null,
    steps,
    completedCount,
    total,
    progress: Math.min(1, Math.max(0, progress)),
    nextStep,
    nextStepIndex: nextIndex,
    recommendedStepIndex: recommendedIndex,
    prerequisites: [],
    blocked: false,
    assistance: {
      microcopy:
        'Relancez les modules en erreur depuis la barre d’administration ou actualisez la page si un service reste bloqué.',
      examples: [
        {
          id: 'core-services-example',
          title: 'Astuce',
          description:
            'Si la synthèse vocale reste en « chargement », vérifiez que SpeechSynthesis est disponible ou testez depuis un navigateur alternatif.',
        },
      ],
      resources: [],
    },
    tags: ['critique', 'surveillance'],
    summary: '',
    statusLabel:
      completedCount === total
        ? 'Tous les services sont opérationnels'
        : `${total - completedCount} service${total - completedCount > 1 ? 's' : ''} à rétablir`,
    liveAnnouncement: '',
  };
}

export function buildGuidedChecklists(snapshot = {}) {
  const manualMap = snapshot?.ui?.guides?.completedSteps || {};
  const runtimeMap = snapshot?.runtime?.modules || {};
  const baseContext = { snapshot, manualMap, runtimeMap };

  const scenarios = [];
  const seenScenarioIds = new Set();

  const criticalScenario = buildCriticalServicesScenario(baseContext);
  if (criticalScenario) {
    scenarios.push(criticalScenario);
    seenScenarioIds.add(criticalScenario.id);
  }

  fastPassFlows.forEach((definition) => {
    const moduleId = definition.moduleId || null;
    const manifest = moduleId ? moduleCatalogById.get(moduleId)?.manifest || null : null;
    const scenario = buildScenarioFromDefinition(definition, {
      ...baseContext,
      moduleId,
      manifest: manifest || definition.manifest || null,
    });
    if (scenario && !seenScenarioIds.has(scenario.id)) {
      scenarios.push(scenario);
      seenScenarioIds.add(scenario.id);
    }
  });

  moduleCatalog.forEach(({ id, manifest }) => {
    const guides = ensureArray(manifest?.guides);
    guides.forEach((guideDefinition) => {
      if (guideDefinition?.id && seenScenarioIds.has(guideDefinition.id)) return;
      const scenario = buildScenarioFromDefinition(guideDefinition, {
        ...baseContext,
        moduleId: id,
        manifest,
      });
      if (scenario && !seenScenarioIds.has(scenario.id)) {
        scenarios.push(scenario);
        seenScenarioIds.add(scenario.id);
      }
    });
  });

  scenarios.sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : DEFAULT_GUIDE_ORDER;
    const orderB = Number.isFinite(b.order) ? b.order : DEFAULT_GUIDE_ORDER;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title, 'fr');
  });

  return scenarios;
}

export function toggleManualChecklistStep(state, stepId, force) {
  if (!state || typeof state.set !== 'function') return false;
  const current = state.get('ui.guides.completedSteps') || {};
  const currentValue = !!current[stepId];
  const nextValue = typeof force === 'boolean' ? force : !currentValue;
  if (currentValue === nextValue) return false;
  const updated = { ...current, [stepId]: nextValue };
  state.set('ui.guides.completedSteps', updated);
  return true;
}

export function resetManualChecklistStep(state, stepId) {
  if (!state || typeof state.set !== 'function') return;
  const current = state.get('ui.guides.completedSteps') || {};
  if (!(stepId in current)) return;
  const updated = { ...current };
  delete updated[stepId];
  state.set('ui.guides.completedSteps', updated);
}
