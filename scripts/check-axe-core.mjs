import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function fail(message) {
  console.error(`\u274c ${message}`);
  process.exitCode = 1;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const axePkgPath = path.join(rootDir, 'node_modules', 'axe-core', 'package.json');
const auditModulePath = path.join(rootDir, 'src', 'modules', 'audit.js');
const vendoredPath = path.join(rootDir, 'assets', 'vendor', 'axe-core', 'axe.min.js');
const upstreamPath = path.join(rootDir, 'node_modules', 'axe-core', 'axe.min.js');

const [axePkgRaw, auditRaw, vendoredRaw, upstreamRaw] = await Promise.all([
  readFile(axePkgPath, 'utf8'),
  readFile(auditModulePath, 'utf8'),
  readFile(vendoredPath),
  readFile(upstreamPath),
]);

const axeVersion = JSON.parse(axePkgRaw).version;
const versionMatch = auditRaw.match(/const AXE_CORE_VERSION = '([^']+)'/);

if (!versionMatch) {
  fail('Impossible de trouver AXE_CORE_VERSION dans src/modules/audit.js');
} else if (versionMatch[1] !== axeVersion) {
  fail(
    `AXE_CORE_VERSION (${versionMatch[1]}) ne correspond pas à la version installée (${axeVersion}).`
  );
}

const hash = createHash('sha384').update(vendoredRaw).digest('base64');
const expectedIntegrity = `sha384-${hash}`;
const integrityMatch = auditRaw.match(/const CDN_AXE_CORE_INTEGRITY = '([^']+)'/);

if (!integrityMatch) {
  fail('Impossible de trouver CDN_AXE_CORE_INTEGRITY dans src/modules/audit.js');
} else if (integrityMatch[1] !== expectedIntegrity) {
  fail(
    `CDN_AXE_CORE_INTEGRITY (${integrityMatch[1]}) ne correspond pas au fichier local (${expectedIntegrity}).`
  );
}

if (!vendoredRaw.equals(upstreamRaw)) {
  fail(
    'Le fichier vendorié axe.min.js ne correspond pas à node_modules/axe-core/axe.min.js. Exécutez "npm run sync:axe".'
  );
}

if (process.exitCode) {
  throw new Error('Vérifications axe-core échouées.');
}

console.log('\u2705 axe-core vendorié à jour.');
