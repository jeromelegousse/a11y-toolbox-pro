const STATUS_TONE_DEFAULT = 'info';
const STATUS_TONE_ACTIVE = 'active';
const STATUS_TONE_ALERT = 'alert';
const STATUS_TONE_WARNING = 'warning';
const STATUS_TONE_MUTED = 'muted';

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

function getRuntimeInfo(snapshot, moduleId) {
  return snapshot?.runtime?.modules?.[moduleId] ?? {};
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
    return summary;
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation du module';
    summary.detail = 'Le module de synthèse vocale se charge.';
    return summary;
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger la synthèse vocale.';
    summary.tone = STATUS_TONE_ALERT;
    return summary;
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

  return summary;
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
    return summary;
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation de la dictée';
    summary.detail = 'Le module de dictée vocale se charge.';
    return summary;
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger la dictée vocale.';
    summary.tone = STATUS_TONE_ALERT;
    return summary;
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

  return summary;
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
    return summary;
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation du braille';
    summary.detail = 'Le module braille se charge.';
    return summary;
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger le module braille.';
    summary.tone = STATUS_TONE_ALERT;
    return summary;
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

  return summary;
}

export function summarizeStatuses(snapshot = {}) {
  return [
    buildTtsSummary(snapshot),
    buildSttSummary(snapshot),
    buildBrailleSummary(snapshot)
  ];
}

export const STATUS_TONES = {
  DEFAULT: STATUS_TONE_DEFAULT,
  ACTIVE: STATUS_TONE_ACTIVE,
  ALERT: STATUS_TONE_ALERT,
  WARNING: STATUS_TONE_WARNING,
  MUTED: STATUS_TONE_MUTED
};
