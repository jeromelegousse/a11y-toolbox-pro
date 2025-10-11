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

const QUICKSTART_STEPS = [
  {
    id: 'apply-profile',
    label: 'Appliquer un profil préconfiguré',
    detail: 'Choisissez un profil Vision, Dyslexie ou Lecture rapide pour personnaliser les réglages de départ.',
    type: 'auto',
    check: (snapshot) => {
      const activeProfile = snapshot?.ui?.activeProfile;
      return !!activeProfile && activeProfile !== 'custom';
    }
  },
  {
    id: 'pin-critical-modules',
    label: 'Épingler vos modules critiques',
    detail: 'Ajoutez vos modules essentiels en favoris pour les garder visibles en permanence.',
    type: 'auto',
    check: (snapshot) => Array.isArray(snapshot?.ui?.pinned) && snapshot.ui.pinned.length >= 2
  },
  {
    id: 'reinforce-contrast',
    label: 'Vérifier le contraste renforcé',
    detail: 'Activez le thème haute visibilité ou confirmez qu’il est désactivé selon vos besoins.',
    type: 'auto',
    check: (snapshot) => readPath(snapshot, 'contrast.enabled', false) === true
  },
  {
    id: 'adjust-spacing',
    label: 'Ajuster les espacements du texte',
    detail: 'Modifiez l’interlignage ou l’espacement des lettres pour trouver un confort de lecture.',
    type: 'auto',
    check: (snapshot) => {
      const lineHeight = Number(readPath(snapshot, 'spacing.lineHeight', 1.5));
      const letterSpacing = Number(readPath(snapshot, 'spacing.letterSpacing', 0));
      return !Number.isNaN(lineHeight) && !Number.isNaN(letterSpacing)
        && (Math.abs(lineHeight - 1.5) > 0.001 || Math.abs(letterSpacing - 0) > 0.001);
    }
  }
];

const STATUS_STEPS = [
  {
    id: 'check-status-center',
    label: 'Contrôler le centre d’état',
    detail: 'Ouvrez le panneau et consultez les cartes vocales/braille pour vérifier la disponibilité des services.',
    type: 'manual'
  },
  {
    id: 'load-tts-module',
    label: 'Charger la lecture vocale',
    detail: 'Assurez-vous que le module TTS est prêt à l’emploi et signale un état « prêt » ou « lecture en cours ».',
    type: 'auto',
    check: (snapshot) => {
      const runtime = snapshot?.runtime?.modules?.tts;
      if (!runtime) return false;
      if (runtime.state === 'ready' || runtime.state === 'loading') return true;
      return runtime.enabled === true;
    }
  },
  {
    id: 'monitor-status-alerts',
    label: 'Surveiller les alertes de modules',
    detail: 'Repérez les badges d’alerte sur les cartes de statut pour réagir rapidement aux erreurs.',
    type: 'auto',
    check: (snapshot) => {
      const summaries = summarizeStatuses(snapshot || {});
      return summaries.some((entry) => entry.tone === 'alert');
    }
  }
];

export const GUIDED_CHECKLISTS = [
  {
    id: 'quickstart',
    title: 'Prise en main rapide',
    description: 'Validez les fondamentaux pour offrir une expérience accessible cohérente.',
    tone: 'confirm',
    steps: QUICKSTART_STEPS
  },
  {
    id: 'observability',
    title: 'Surveillance en direct',
    description: 'Gardez un œil sur les services vocaux et braille afin d’anticiper les incidents.',
    tone: 'info',
    steps: STATUS_STEPS
  }
];

export function buildGuidedChecklists(snapshot = {}) {
  const manualMap = snapshot?.ui?.guides?.completedSteps || {};
  return GUIDED_CHECKLISTS.map((checklist) => {
    const steps = checklist.steps.map((step) => {
      const detail = typeof step.detail === 'function' ? step.detail(snapshot) : step.detail || '';
      if (step.type === 'auto') {
        const completed = typeof step.check === 'function' ? step.check(snapshot) : false;
        return { ...step, detail, completed, state: 'auto' };
      }
      const manualState = !!manualMap[step.id];
      return { ...step, detail, completed: manualState, state: 'manual' };
    });
    const completedCount = steps.filter((step) => step.completed).length;
    const total = steps.length || 1;
    const progress = Math.min(1, Math.max(0, completedCount / total));
    const nextStep = steps.find((step) => !step.completed) || null;
    return {
      ...checklist,
      steps,
      completedCount,
      total,
      progress,
      nextStep
    };
  });
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
