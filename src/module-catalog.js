import { manifest as ttsManifest } from './modules/tts.manifest.js';
import { manifest as sttManifest } from './modules/stt.manifest.js';
import { manifest as brailleManifest } from './modules/braille.manifest.js';
import { manifest as contrastManifest } from './modules/contrast.manifest.js';
import { manifest as spacingManifest } from './modules/spacing.manifest.js';

export const moduleCatalog = [
  {
    id: ttsManifest.id,
    manifest: ttsManifest,
    loader: () => import('./modules/tts.js')
  },
  {
    id: sttManifest.id,
    manifest: sttManifest,
    loader: () => import('./modules/stt.js')
  },
  {
    id: brailleManifest.id,
    manifest: brailleManifest,
    loader: () => import('./modules/braille.js')
  },
  {
    id: contrastManifest.id,
    manifest: contrastManifest,
    loader: () => import('./modules/contrast.js')
  },
  {
    id: spacingManifest.id,
    manifest: spacingManifest,
    loader: () => import('./modules/spacing.js')
  }
];

export const moduleCatalogById = new Map(moduleCatalog.map((entry) => [entry.id, entry]));
