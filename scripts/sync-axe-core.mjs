import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const source = path.join(rootDir, 'node_modules', 'axe-core', 'axe.min.js');
const destinationDir = path.join(rootDir, 'assets', 'vendor', 'axe-core');
const destination = path.join(destinationDir, 'axe.min.js');

await mkdir(destinationDir, { recursive: true });
await copyFile(source, destination);

console.log(`axe-core minified build synchronisé dans ${path.relative(rootDir, destination)}`);
