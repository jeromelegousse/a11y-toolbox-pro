import { formatTimestamp, summarizeReport } from './modules/audit-report.js';

const STATUS_TONE_DEFAULT = 'info';
const STATUS_TONE_ACTIVE = 'active';
const STATUS_TONE_ALERT = 'alert';
const STATUS_TONE_WARNING = 'warning';
const STATUS_TONE_MUTED = 'muted';

const SCORE_PRIORITY = new Map([
  ['AAA', 0],
  ['AA', 1],
  ['A', 2],
  ['B', 3],
  ['C', 4]
]);

function normalizeScore(value) {
  if (typeof value !== 'string') return 'AAA';
  const upper = value.trim().toUpperCase();
  return SCORE_PRIORITY.has(upper) ? upper : 'AAA';
}

function pickWorstScore(current, candidate) {
  const normalizedCurrent = normalizeScore(current);
  const normalizedCandidate = normalizeScore(candidate);
  const currentRank = SCORE_PRIORITY.get(normalizedCurrent) ?? 0;
  const candidateRank = SCORE_PRIORITY.get(normalizedCandidate) ?? 0;
  return candidateRank > currentRank ? normalizedCandidate : normalizedCurrent;
}

function toneFromScore(score) {
  const rank = SCORE_PRIORITY.get(normalizeScore(score)) ?? 0;
  if (rank >= 3) return STATUS_TONE_ALERT;
  if (rank === 2) return STATUS_TONE_WARNING;
  if (rank === 1) return STATUS_TONE_ACTIVE;
  return STATUS_TONE_DEFAULT;
}

function summarizeAuditForScore(snapshot = {}) {
  const summary = snapshot?.audit?.summary;
  if (!summary) {
    if (snapshot?.audit?.status === 'error') {
      return 'A';
    }
    return 'AAA';
  }
  switch (summary.outcome) {
    case 'critical':
      return 'A';
    case 'serious':
      return 'AA';
    case 'moderate':
    case 'minor':
      return 'AA';
    case 'pass':
      return 'AAA';
    default:
      return 'AA';
  }
}

function buildGlobalScoreSummary(snapshot = {}) {
  const runtimeEntries = snapshot?.runtime?.modules ?? {};
  let tracked = 0;
  let ready = 0;
  let errors = 0;
  let warnings = 0;
  let worstScore = 'AAA';

  Object.keys(runtimeEntries).forEach((moduleId) => {
    const runtime = runtimeEntries[moduleId];
    if (!runtime || runtime.enabled === false) {
      return;
    }
    tracked += 1;
    if (runtime.state === 'ready') {
      ready += 1;
    }
    if (runtime.state === 'error') {
      errors += 1;
    }
    const metrics = computeModuleMetrics(runtime, { label: runtime.manifestName || moduleId });
    worstScore = pickWorstScore(worstScore, metrics.riskLevel);
    const failureCount = Number.isFinite(metrics.failures) ? metrics.failures : Number(runtime.metrics?.failures) || 0;
    if (failureCount > 0 && runtime.state !== 'error') {
      warnings += 1;
    }
  });

  const auditScore = summarizeAuditForScore(snapshot);
  worstScore = pickWorstScore(worstScore, auditScore);

  const totalIncidents = errors + warnings;
  const detailParts = [];
  if (tracked > 0) {
    detailParts.push(`${ready}/${tracked} modules prêts`);
  }
  if (errors > 0) {
    detailParts.push(`${errors} en erreur`);
  }
  if (warnings > 0) {
    detailParts.push(`${warnings} à surveiller`);
  }
  if (!detailParts.length) {
    detailParts.push('Aucun incident déclaré');
  }

  return {
    id: 'global-score',
    label: 'Indice de conformité',
    badge: 'Score consolidé',
    value: `Indice ${worstScore}`,
    detail: detailParts.join(' · '),
    tone: toneFromScore(worstScore),
    live: 'polite',
    metaLabels: {
      latency: 'Modules prêts',
      compat: 'Incidents actifs'
    },
    insights: {
      riskLevel: worstScore,
      riskDescription: `Indice global ${worstScore}.`,
      announcement: `Indice global ${worstScore}`,
      latencyLabel: tracked > 0 ? `${ready}/${tracked}` : '0/0',
      compatLabel: totalIncidents > 0 ? `${totalIncidents} incident${totalIncidents > 1 ? 's' : ''}` : 'Aucun incident'
    }
  };
}

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

function getRuntimeInfo(snapshot, moduleId) {
  return snapshot?.runtime?.modules?.[moduleId] ?? {};
}

function normalizeCompatSection(section) {
  if (!section || typeof section !== 'object') {
    return { features: [], browsers: [] };
  }
  const features = Array.isArray(section.features) ? section.features.filter(Boolean) : [];
  const browsers = Array.isArray(section.browsers) ? section.browsers.filter(Boolean) : [];
  return { features, browsers };
}

export function getModuleCompatibilityScore(runtimeEntry = {}) {
  const compat = runtimeEntry?.metrics?.compat;
  if (!compat || typeof compat !== 'object') return 'AAA';
  const score = typeof compat.score === 'string' ? compat.score.trim().toUpperCase() : 'AAA';
  return score || 'AAA';
}

export function computeModuleMetrics(runtimeEntry = {}, { label } = {}) {
  const metrics = runtimeEntry?.metrics || {};
  const attempts = Number.isFinite(metrics.attempts) ? metrics.attempts : 0;
  const successes = Number.isFinite(metrics.successes) ? metrics.successes : 0;
  const failures = Number.isFinite(metrics.failures) ? metrics.failures : 0;
  const retryCount = Number.isFinite(metrics.retryCount) ? metrics.retryCount : Math.max(0, attempts - successes);
  const timings = metrics.timings || {};
  const combinedAverage = Number.isFinite(timings.combinedAverage) ? timings.combinedAverage : null;
  const latencyLabel = Number.isFinite(combinedAverage) && combinedAverage > 0
    ? `${Math.round(combinedAverage)} ms`
    : 'Non mesuré';

  const compat = metrics.compat && typeof metrics.compat === 'object' ? metrics.compat : {};
  const required = normalizeCompatSection(compat.required);
  const missing = normalizeCompatSection(compat.missing);
  const unknown = normalizeCompatSection(compat.unknown);

  let compatLabel = 'Pré-requis non déclarés';
  const hasRequirements = required.features.length > 0 || required.browsers.length > 0;
  if (hasRequirements) {
    const missingParts = [];
    if (missing.features.length) {
      missingParts.push(`fonctions manquantes : ${missing.features.join(', ')}`);
    }
    if (missing.browsers.length) {
      missingParts.push(`navigateurs requis : ${missing.browsers.join(', ')}`);
    }
    if (missingParts.length) {
      compatLabel = `Pré-requis manquants : ${missingParts.join(' ; ')}.`;
    } else {
      const unknownParts = [];
      if (unknown.features.length) {
        unknownParts.push(`fonctions à vérifier : ${unknown.features.join(', ')}`);
      }
      if (unknown.browsers.length) {
        unknownParts.push(`navigateurs ciblés : ${unknown.browsers.join(', ')}`);
      }
      compatLabel = unknownParts.length
        ? `Compatibilité à vérifier : ${unknownParts.join(' ; ')}.`
        : 'Pré-requis satisfaits.';
    }
  }

  let riskLevel = getModuleCompatibilityScore(runtimeEntry);
  if ((runtimeEntry?.state === 'error' || failures > 0) && riskLevel === 'AAA') {
    riskLevel = 'AA';
  }

  const moduleLabel = label || runtimeEntry?.manifestName || 'Module';
  const riskDescription = `${moduleLabel} — indice de fiabilité ${riskLevel}.`;
  const announcement = `${moduleLabel} : indice ${riskLevel}.`;

  return {
    attempts,
    successes,
    failures,
    retryCount,
    latencyLabel,
    compatLabel,
    riskLevel,
    riskDescription,
    announcement,
    compat: { required, missing, unknown }
  };
}

function finalizeSummary(summary, runtime) {
  const moduleLabel = summary.label || runtime?.manifestName || summary.id || 'Module';
  summary.insights = computeModuleMetrics(runtime, { label: moduleLabel });
  return summary;
}

function toneToStatusTone(tone) {
  switch ((tone || '').toLowerCase()) {
    case 'alert':
      return STATUS_TONE_ALERT;
    case 'warning':
      return STATUS_TONE_WARNING;
    case 'confirm':
      return STATUS_TONE_ACTIVE;
    default:
      return STATUS_TONE_DEFAULT;
  }
}

function buildAuditSummary(snapshot = {}) {
  const audit = snapshot.audit ?? {};
  const runtime = getRuntimeInfo(snapshot, 'audit');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'audit',
    label: 'Audit accessibilité',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite'
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Audit désactivé';
    summary.detail = 'Réactivez la carte « Audit accessibilité » pour lancer une analyse.';
    summary.tone = STATUS_TONE_MUTED;
    return summary;
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation de l’audit';
    summary.detail = 'Le module d’audit charge axe-core.';
    summary.tone = STATUS_TONE_DEFAULT;
    return summary;
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger le module d’audit.';
    summary.tone = STATUS_TONE_ALERT;
    return summary;
  }

  if (audit.status === 'running') {
    summary.badge = 'Analyse en cours';
    summary.value = 'Inspection de la page';
    summary.detail = 'axe-core parcourt le DOM pour détecter les violations.';
    summary.tone = STATUS_TONE_ACTIVE;
    summary.live = 'assertive';
    return summary;
  }

  if (audit.status === 'error') {
    summary.badge = 'Échec de l’audit';
    summary.value = 'Analyse interrompue';
    summary.detail = audit.error || 'Une erreur est survenue pendant l’analyse axe-core.';
    summary.tone = STATUS_TONE_WARNING;
    return summary;
  }

  if (!audit.lastReport) {
    summary.badge = 'Audit prêt';
    summary.value = 'En attente';
    summary.detail = 'Lancez une analyse depuis la carte Audit pour obtenir un rapport détaillé.';
    summary.tone = STATUS_TONE_DEFAULT;
    return summary;
  }

  const reportSummary = audit.summary && audit.summary.totals
    ? audit.summary
    : summarizeReport(audit.lastReport);
  const timestamp = formatTimestamp(audit.lastRun);
  summary.badge = 'Dernier audit';
  summary.value = reportSummary.headline || 'Audit réalisé';
  const detailParts = [];
  if (timestamp) detailParts.push(`Le ${timestamp}`);
  if (reportSummary.detail) detailParts.push(reportSummary.detail);
  detailParts.push('Export disponible dans le journal d’activité.');
  summary.detail = detailParts.join(' · ');
  summary.tone = toneToStatusTone(reportSummary.tone);

  return summary;
}

function buildTtsSummary(snapshot = {}) {
  const tts = snapshot.tts ?? {};
  const runtime = getRuntimeInfo(snapshot, 'tts');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'tts',
    label: 'Synthèse vocale',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite'
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Synthèse désactivée';
    summary.detail = 'Réactivez la carte « Lecture vocale » depuis l’onglet Organisation.';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation du module';
    summary.detail = 'Le module de synthèse vocale se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger la synthèse vocale.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  summary.badge = 'Module prêt';

  switch (tts.status) {
    case 'speaking': {
      const progress = Math.round((tts.progress ?? 0) * 100);
      summary.value = 'Lecture en cours';
      summary.detail = `Progression\u00A0: ${Number.isFinite(progress) ? progress : 0}\u00A0%`;
      summary.tone = STATUS_TONE_ACTIVE;
      summary.live = 'assertive';
      break;
    }
    case 'unsupported':
      summary.value = 'Synthèse non disponible';
      summary.detail = 'La synthèse vocale n’est pas prise en charge par ce navigateur.';
      summary.tone = STATUS_TONE_ALERT;
      summary.badge = 'Pré-requis manquants';
      break;
    case 'error':
      summary.value = 'Erreur de lecture';
      summary.detail = 'Une erreur est survenue pendant la lecture vocale.';
      summary.tone = STATUS_TONE_WARNING;
      break;
    default: {
      const voices = Array.isArray(tts.availableVoices) ? tts.availableVoices : [];
      const selectedVoice = voices.find((voice) => voice.voiceURI === tts.voice);
      const voiceLabel = selectedVoice ? `${selectedVoice.name} (${selectedVoice.lang})` : 'Voix du navigateur';
      summary.value = 'En veille';
      summary.detail = `Voix active\u00A0: ${voiceLabel}`;
      break;
    }
  }

  return finalizeSummary(summary, runtime);
}

function buildSttSummary(snapshot = {}) {
  const stt = snapshot.stt ?? {};
  const runtime = getRuntimeInfo(snapshot, 'stt');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'stt',
    label: 'Reconnaissance vocale',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite'
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Dictée désactivée';
    summary.detail = 'Rendez-vous dans Organisation pour réactiver la carte « Dictée vocale ».';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation de la dictée';
    summary.detail = 'Le module de dictée vocale se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger la dictée vocale.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  summary.badge = 'Module prêt';

  switch (stt.status) {
    case 'listening':
      summary.value = 'Écoute en cours';
      summary.detail = 'Parlez pour dicter du texte.';
      summary.tone = STATUS_TONE_ACTIVE;
      summary.live = 'assertive';
      break;
    case 'unsupported':
      summary.value = 'Dictée non disponible';
      summary.detail = 'La reconnaissance vocale n’est pas prise en charge sur ce navigateur.';
      summary.tone = STATUS_TONE_ALERT;
      summary.badge = 'Pré-requis manquants';
      break;
    case 'error':
      summary.value = 'Erreur de dictée';
      summary.detail = runtime.error || 'Une erreur est survenue pendant la dictée.';
      summary.tone = STATUS_TONE_WARNING;
      break;
    default:
      summary.value = 'En veille';
      summary.detail = 'Prêt à démarrer une dictée vocale.';
      break;
  }

  return finalizeSummary(summary, runtime);
}

function buildBrailleSummary(snapshot = {}) {
  const braille = snapshot.braille ?? {};
  const runtime = getRuntimeInfo(snapshot, 'braille');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'braille',
    label: 'Transcription braille',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite'
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Transcription désactivée';
    summary.detail = 'Réactivez la carte « Braille » pour convertir le texte sélectionné.';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation du braille';
    summary.detail = 'Le module braille se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger le module braille.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  summary.badge = 'Module prêt';

  if (!isEmpty(braille.output)) {
    const length = String(braille.output).length;
    summary.value = 'Sortie disponible';
    summary.detail = `Dernière transcription\u00A0: ${length} caractère${length > 1 ? 's' : ''}.`;
    summary.tone = STATUS_TONE_ACTIVE;
  } else {
    summary.value = 'En veille';
    summary.detail = 'Aucune transcription active pour le moment.';
  }

  return finalizeSummary(summary, runtime);
}

function buildContrastSummary(snapshot = {}) {
  const contrast = snapshot.contrast ?? {};
  const runtime = getRuntimeInfo(snapshot, 'contrast');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'contrast',
    label: 'Contraste renforcé',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite'
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Contraste désactivé';
    summary.detail = 'Activez la carte « Contraste élevé » pour appliquer le thème renforcé.';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation du thème';
    summary.detail = 'Le module de contraste se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Contraste indisponible';
    summary.detail = runtime.error || 'Impossible de charger le module de contraste.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  const isActive = contrast.enabled === true;
  summary.badge = isActive ? 'Actif' : 'Module prêt';
  summary.value = isActive ? 'Thème actif' : 'En veille';
  summary.detail = isActive
    ? 'Contraste élevé appliqué sur la page.'
    : 'Prêt à renforcer le contraste.';
  if (isActive) {
    summary.tone = STATUS_TONE_ACTIVE;
    summary.live = 'assertive';
  }

  return finalizeSummary(summary, runtime);
}

function buildSpacingSummary(snapshot = {}) {
  const spacing = snapshot.spacing ?? {};
  const runtime = getRuntimeInfo(snapshot, 'spacing');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'spacing',
    label: 'Espacements typographiques',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite'
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Espacements désactivés';
    summary.detail = 'Réactivez la carte « Espacements » pour ajuster interlignage et lettres.';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation des espacements';
    summary.detail = 'Le module d’espacements se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Espacements indisponibles';
    summary.detail = runtime.error || 'Impossible de charger le module d’espacements.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  const lineHeight = Number(spacing.lineHeight ?? 1.5);
  const letterSpacing = Number(spacing.letterSpacing ?? 0);
  const hasCustomLineHeight = Number.isFinite(lineHeight) && Math.abs(lineHeight - 1.5) > 0.05;
  const hasCustomLetterSpacing = Number.isFinite(letterSpacing) && Math.abs(letterSpacing - 0) > 0.01;
  const hasCustomSettings = hasCustomLineHeight || hasCustomLetterSpacing;

  if (hasCustomSettings) {
    const readableLineHeight = Number.isFinite(lineHeight) ? `${lineHeight.toFixed(1)}×` : '—';
    const readableLetterSpacing = Number.isFinite(letterSpacing)
      ? `${Math.round(letterSpacing * 100)} %`
      : '—';
    summary.badge = 'Réglages personnalisés';
    summary.value = 'Espacements ajustés';
    summary.detail = `Interlignage ${readableLineHeight} • Lettres ${readableLetterSpacing}`;
    summary.tone = STATUS_TONE_ACTIVE;
  } else {
    summary.badge = 'Module prêt';
    summary.value = 'Réglages standards';
    summary.detail = 'Utilise les valeurs par défaut, prêtes à personnaliser.';
  }

  return finalizeSummary(summary, runtime);
}

export function summarizeStatuses(snapshot = {}) {
  return [
    buildGlobalScoreSummary(snapshot),
    buildAuditSummary(snapshot),
    buildTtsSummary(snapshot),
    buildSttSummary(snapshot),
    buildBrailleSummary(snapshot),
    buildContrastSummary(snapshot),
    buildSpacingSummary(snapshot)
  ];
}

export const STATUS_TONES = {
  DEFAULT: STATUS_TONE_DEFAULT,
  ACTIVE: STATUS_TONE_ACTIVE,
  ALERT: STATUS_TONE_ALERT,
  WARNING: STATUS_TONE_WARNING,
  MUTED: STATUS_TONE_MUTED
};
