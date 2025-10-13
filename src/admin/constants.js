export const COMPATIBILITY_LABELS = {
  full: 'Compatibles',
  partial: 'À risques',
  unknown: 'À vérifier',
  none: 'Non déclarées'
};

export const COMPATIBILITY_TONES = {
  full: 'confirm',
  partial: 'alert',
  unknown: 'warning',
  none: 'muted'
};

export const NAMESPACE_TO_MODULE = new Map([
  ['contrast', 'contrast'],
  ['spacing', 'spacing'],
  ['tts', 'tts'],
  ['stt', 'stt'],
  ['braille', 'braille'],
  ['audio', 'audio-feedback'],
  ['audit', 'audit']
]);
