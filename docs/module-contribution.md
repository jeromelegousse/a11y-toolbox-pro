# Processus de contribution des modules

Ce guide explique comment proposer un nouveau module ou mettre à jour un manifest pour A11y Toolbox Pro.
Il s’appuie sur les pratiques observées chez les suites professionnelles (Deque axe DevTools, Microsoft Accessibility Insights, Stark) afin de garantir un niveau de qualité équivalent.

## 1. Préparer la proposition

1. **Définir le périmètre** : décrivez le besoin utilisateur, les impacts WCAG visés et le niveau de conformité attendu (AA a minima).
2. **Étudier la concurrence** : documentez comment le module se compare aux fonctionnalités équivalentes dans axe DevTools / Accessibility Insights / Stark.
3. **Lister les dépendances** : identifiez les modules requis, permissions navigateur et états runtime nécessaires.
4. **Préparer les guides** : fournissez au moins un parcours d’onboarding (étapes FastPass inspirées d’Accessibility Insights) et la microcopie associée.

## 2. Créer ou mettre à jour le manifest

1. Utilisez le schéma détaillé dans [`docs/module-manifest.md`](./module-manifest.md).
2. Renseignez systématiquement :
   - `description` (pitch utilisateur) ;
   - `keywords` (recherche dans le catalogue) ;
   - `config.fields` (options exposées dans le panneau Options & Profils) ;
   - `compat` (navigateurs et technologies assistives testées) ;
   - `guides` (parcours d’onboarding) ;
   - `metadataQuality` est généré automatiquement par `validateModuleManifest`, mais la couverture dépend des champs fournis.
3. Vérifiez que le manifest atteint le niveau **AA** de qualité métadonnées (équivalent au socle retenu par axe DevTools et Accessibility Insights) et ciblez AAA lorsque possible comme Stark.

## 3. Vérifications locales

1. Exécutez `npm run lint:manifests` pour lancer l’audit automatisé des manifestes (comparaison avec les benchmarks pro).
2. Lancez la suite complète `npm run test` pour valider lint, tests unitaires (Vitest) et visuels (Playwright).
3. Ouvrez `index.html` pour tester l’intégration manuelle du module et vérifier les interactions clavier/lecteur d’écran.
4. Si vous ajoutez une intégration externe, synchronisez les mocks présents dans `scripts/integrations/`.

## 4. Préparer la Pull Request

1. Documentez la fonctionnalité dans `docs/comparatif-et-roadmap.md` (section écarts vs solutions pro).
2. Ajoutez des captures ou démonstrations si l’UX évolue.
3. Cochez la checklist ci-dessous avant soumission :
   - [ ] Manifest validé (`npm run lint:manifests`).
   - [ ] Tests exécutés (`npm run test`).
   - [ ] Documentation mise à jour (`README.md`, `docs/*`).
   - [ ] Comparaison avec les suites professionnelles décrite.
   - [ ] Guides utilisateur et raccourcis mis à jour si nécessaire.

## 5. Revue & critères d’acceptation

- **Qualité manifest** : niveau AA ou plus, couverture ≥ 80 %, aucune dépendance manquante.
- **Expérience utilisateur** : parcours guide cohérent, comportements clavier testés.
- **Observabilité** : métriques runtime et journal d’activité enrichis si le module le nécessite.
- **Compatibilité** : vérification multi-navigateurs / AT documentée (rapprochement de l’approche multi-profils de Stark).

En suivant ces étapes, chaque contribution reste alignée avec la feuille de route et maintient la compétitivité face aux solutions enterprise.
