function normalizeModules(modules) {
  if (!Array.isArray(modules)) {
    return [];
  }
  return Array.from(new Set(modules.filter(Boolean)));
}

export const moduleCollections = [
  {
    id: 'vision-plus',
    label: 'Confort visuel renforcé',
    description:
      'Active les ajustements de contraste, d’espacement et d’affichage tactile pour soulager la lecture prolongée.',
    modules: ['contrast', 'spacing', 'braille'],
    children: [
      {
        id: 'vision-plus.contraste',
        label: 'Renfort de contraste',
        description: 'Ajuste les couleurs et le thème pour garantir un ratio AA ou supérieur sur les interfaces critiques.',
        modules: ['contrast']
      },
      {
        id: 'vision-plus.espacements',
        label: 'Espacements confort',
        description: 'Optimise interlignage et espacement des lettres pour réduire la fatigue visuelle prolongée.',
        modules: ['spacing']
      },
      {
        id: 'vision-plus.braille',
        label: 'Lecture tactile',
        description: 'Prépare la sortie braille et l’affichage tactile pour compléter les aides à la lecture.',
        modules: ['braille']
      }
    ]
  },
  {
    id: 'voix-et-audio',
    label: 'Voix et retours audio',
    description: 'Réunit les modules de lecture vocale et de feedback sonore pour un accompagnement auditif complet.',
    modules: ['tts', 'audio-feedback'],
    children: [
      {
        id: 'voix-et-audio.tts',
        label: 'Synthèse vocale guidée',
        description: 'Centralise les paramètres de voix, de diction et de rythme pour la lecture assistée.',
        modules: ['tts']
      },
      {
        id: 'voix-et-audio.feedback',
        label: 'Retours audio contextuels',
        description: 'Ajuste les sons d’alerte et de confirmation pour suivre les actions et les états critiques.',
        modules: ['audio-feedback']
      }
    ]
  },
  {
    id: 'interaction-hybride',
    label: 'Interaction hybride',
    description: 'Combine dictée et synthèse vocale pour faciliter les allers-retours entre parole et texte.',
    modules: ['stt', 'tts'],
    children: [
      {
        id: 'interaction-hybride.capture',
        label: 'Capture vocale précise',
        description: 'Optimise la reconnaissance vocale et les dictionnaires pour limiter les corrections manuelles.',
        modules: ['stt']
      },
      {
        id: 'interaction-hybride.boucle',
        label: 'Boucle voix ↔ texte',
        description: 'Synchronise dictée et restitution vocale pour accélérer les revues et validations.',
        modules: ['stt', 'tts']
      }
    ]
  }
];

function flattenCollections(collections, meta = { parentId: null, depth: 0, ancestors: [], ancestorLabels: [] }) {
  const result = [];

  collections.forEach((collection) => {
    if (!collection || !collection.id) {
      return;
    }

    const directModules = normalizeModules(collection.modules);
    const childMeta = {
      parentId: collection.id,
      depth: (meta.depth || 0) + 1,
      ancestors: [...(meta.ancestors || []), collection.id],
      ancestorLabels: [...(meta.ancestorLabels || []), collection.label || collection.id]
    };

    const childEntries = Array.isArray(collection.children)
      ? flattenCollections(collection.children, childMeta)
      : [];

    const aggregatedModules = new Set(directModules);
    const descendantIds = [];
    childEntries.forEach((child) => {
      child.modules.forEach((moduleId) => aggregatedModules.add(moduleId));
      descendantIds.push(child.id, ...(child.descendants || []));
    });

    const pathLabels = meta.ancestorLabels || [];
    const entry = {
      id: collection.id,
      label: collection.label || collection.id,
      description: collection.description || '',
      modules: Array.from(aggregatedModules),
      directModules,
      parentId: meta.parentId,
      ancestors: meta.ancestors || [],
      depth: meta.depth || 0,
      descendants: Array.from(new Set(descendantIds)),
      pathLabel: pathLabels.length ? `${pathLabels.join(' › ')} › ${collection.label || collection.id}` : collection.label || collection.id
    };

    result.push(entry, ...childEntries);
  });

  return result;
}

export const flattenedModuleCollections = flattenCollections(moduleCollections);

export const moduleCollectionsById = new Map(flattenedModuleCollections.map((entry) => [entry.id, entry]));
