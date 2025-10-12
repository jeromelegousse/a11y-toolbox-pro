export const moduleCollections = [
  {
    id: 'vision-plus',
    label: 'Confort visuel renforcé',
    description: 'Active les ajustements de contraste, d’espacement et d’affichage tactile pour soulager la lecture prolongée.',
    modules: ['contrast', 'spacing', 'braille']
  },
  {
    id: 'voix-et-audio',
    label: 'Voix et retours audio',
    description: 'Réunit les modules de lecture vocale et de feedback sonore pour un accompagnement auditif complet.',
    modules: ['tts', 'audio-feedback']
  },
  {
    id: 'interaction-hybride',
    label: 'Interaction hybride',
    description: 'Combine dictée et synthèse vocale pour faciliter les allers-retours entre parole et texte.',
    modules: ['stt', 'tts']
  }
];

export const moduleCollectionsById = new Map(moduleCollections.map((entry) => [entry.id, entry]));
