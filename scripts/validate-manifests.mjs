import process from 'node:process';
import { moduleCatalog } from '../src/module-catalog.js';
import { validateModuleManifest } from '../src/module-manifest.js';

function ensureTestEnvironment() {
  if (!globalThis.window) {
    globalThis.window = {};
  }
  if (!globalThis.window.a11ytb) {
    globalThis.window.a11ytb = {};
  }
  if (!globalThis.document) {
    globalThis.document = {
      documentElement: { lang: 'fr' },
      createElement: () => ({ dataset: {}, style: {}, setAttribute: () => {} }),
      head: { appendChild: () => {} }
    };
  } else {
    if (!globalThis.document.documentElement) {
      globalThis.document.documentElement = { lang: 'fr' };
    }
    if (!globalThis.document.head) {
      globalThis.document.head = { appendChild: () => {} };
    }
  }
}

const LEVEL_PRIORITY = new Map([
  ['AAA', 4],
  ['AA', 3],
  ['A', 2],
  ['B', 1],
  ['C', 0],
  ['D', -1],
  ['E', -2]
]);

const MINIMUM_LEVEL = 'AA';
const MINIMUM_COVERAGE = 0.75;

ensureTestEnvironment();

const issues = [];
const warnings = [];
const report = [];
const seenIds = new Map();

moduleCatalog.forEach(({ id, manifest }) => {
  if (seenIds.has(id)) {
    issues.push(`Identifiant dupliqué « ${id} » détecté dans le catalogue (déjà utilisé par ${seenIds.get(id)}).`);
    return;
  }
  seenIds.set(id, manifest?.name || id);

  const normalized = validateModuleManifest(manifest, id);
  const quality = normalized.metadataQuality || {};
  const level = String(quality.level || 'C').toUpperCase();
  const levelScore = LEVEL_PRIORITY.get(level) ?? LEVEL_PRIORITY.get('C');
  const coverage = typeof quality.coverage === 'number' ? quality.coverage : 0;
  const missing = Array.isArray(quality.missing) ? quality.missing : [];
  const recommendations = Array.isArray(quality.recommendations) ? quality.recommendations : [];

  report.push({
    id: normalized.id,
    name: normalized.name || normalized.id,
    level,
    coveragePercent: quality.coveragePercent ?? Math.round(coverage * 100),
    missing
  });

  if (levelScore < (LEVEL_PRIORITY.get(MINIMUM_LEVEL) ?? 3)) {
    issues.push(
      `Le module « ${normalized.name || normalized.id} » est évalué au niveau ${level} (couverture ${Math.round(coverage * 100)} %). ` +
        'Les suites professionnelles comme Deque axe DevTools ou Accessibility Insights retiennent un socle AA : complétez les métadonnées.'
    );
  } else if (coverage < MINIMUM_COVERAGE) {
    warnings.push(
      `Le module « ${normalized.name || normalized.id} » atteint ${Math.round(coverage * 100)} % de couverture. ` +
        'Stark recommande une documentation plus exhaustive (complétez : ' + missing.join(', ') + ').'
    );
  }

  if (!normalized.description) {
    warnings.push(
      `Le manifest « ${normalized.id} » ne fournit pas de description utilisateur. Les catalogues pros exposent systématiquement ce champ.`
    );
  }

  if (!normalized.config) {
    warnings.push(
      `Le manifest « ${normalized.id} » n’a pas de section config déclarée. Ajoutez des options pour rivaliser avec les panneaux configurables de Stark.`
    );
  }

  if (recommendations.length && levelScore < LEVEL_PRIORITY.get('AAA')) {
    warnings.push(
      `Recommandations pour « ${normalized.name || normalized.id} » : ${recommendations.join('; ')}.`
    );
  }
});

const header = '\nA11y Toolbox Pro – audit des manifestes (benchmarks Deque axe DevTools, Accessibility Insights, Stark)\n';
console.log(header);

if (report.length) {
  const table = report.map((entry) => ({
    Module: entry.name,
    Niveau: entry.level,
    Couverture: `${entry.coveragePercent}%`,
    Manques: entry.missing.join(', ') || '—'
  }));
  console.table(table);
}

if (warnings.length) {
  console.warn('\n⚠️  Avertissements :');
  warnings.forEach((warning) => {
    console.warn(` - ${warning}`);
  });
}

if (issues.length) {
  console.error('\n❌  Non-conformités détectées :');
  issues.forEach((issue) => {
    console.error(` - ${issue}`);
  });
  console.error('\nMettez à jour les manifestes pour atteindre au minimum le niveau AA, à l’image des suites professionnelles.');
  process.exitCode = 1;
} else {
  console.log('\n✅  Tous les manifestes atteignent le socle AA exigé par les outils enterprise.');
}
