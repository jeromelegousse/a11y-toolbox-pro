import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = resolve('scripts', 'integrations', 'llava_local.py');
const PYTHON_EXECUTABLE = process.env.A11Y_TOOLBOX_VLM_PYTHON || 'python3';

async function createTempImage() {
  const dir = await mkdtemp(join(tmpdir(), 'llava-script-'));
  const filePath = join(dir, 'image.bin');
  await writeFile(filePath, Buffer.from([0, 1, 2, 3]));
  return { dir, filePath };
}

async function runScript(args = [], env = {}) {
  return execFileAsync(PYTHON_EXECUTABLE, [SCRIPT_PATH, ...args], {
    env: { ...process.env, ...env },
  });
}

function createFakePythonModules({ cudaAvailable = false } = {}) {
  const modulesRoot = mkdtemp(join(tmpdir(), 'llava-modules-'));

  return modulesRoot.then((root) => {
    const torchDir = join(root, 'torch');
    mkdirSync(torchDir, { recursive: true });
    writeFileSync(
      join(torchDir, '__init__.py'),
      `class _Cuda:\n    def is_available(self):\n        return ${cudaAvailable ? 'True' : 'False'}\n\n\nclass _InferenceMode:\n    def __enter__(self):\n        return None\n\n    def __exit__(self, exc_type, exc, tb):\n        return False\n\n\nclass _Tensor:\n    def to(self, *args, **kwargs):\n        return self\n\n    def __getitem__(self, index):\n        return self\n\n    def tolist(self):\n        return []\n\n\nclass _Generated:\n    def to(self, *args, **kwargs):\n        return _Tensor()\n\n\nclass _Model:\n    def to(self, *args, **kwargs):\n        return self\n\n    def eval(self):\n        return self\n\n    def generate(self, **kwargs):\n        return _Generated()\n\n\nclass _Processor:\n    def apply_chat_template(self, conversation, add_generation_prompt=True):\n        return ''\n\n    def __call__(self, images=None, text=None, return_tensors=None):\n        return {}\n\n    def batch_decode(self, ids, skip_special_tokens=True):\n        return ['']\n\n\nclass AutoProcessor(_Processor):\n    @staticmethod\n    def from_pretrained(*args, **kwargs):\n        return AutoProcessor()\n\n\nclass AutoModelForVision2Seq(_Model):\n    @staticmethod\n    def from_pretrained(*args, **kwargs):\n        return AutoModelForVision2Seq()\n\n\nfloat16 = 'float16'\nfloat32 = 'float32'\n\n\ncuda = _Cuda()\n\n\ndef inference_mode():\n    return _InferenceMode()\n`
    );

    const transformersDir = join(root, 'transformers');
    mkdirSync(transformersDir, { recursive: true });
    writeFileSync(
      join(transformersDir, '__init__.py'),
      'from torch import AutoModelForVision2Seq, AutoProcessor\n'
    );

    return root;
  });
}

describe('scripts/integrations/llava_local.py', () => {
  let tempDir;
  let tempImage;

  beforeAll(async () => {
    const { dir, filePath } = await createTempImage();
    tempDir = dir;
    tempImage = filePath;
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('retourne un code dédié lorsque le modèle est introuvable', async () => {
    await expect(
      runScript(['--image', tempImage, '--prompt', 'Bonjour', '--model', '/modele/inexistant'])
    ).rejects.toMatchObject({
      code: 12,
      stderr: expect.stringContaining('introuvable'),
    });
  });

  it('signale les dépendances manquantes avec un code spécifique', async () => {
    await expect(
      runScript(['--image', tempImage, '--prompt', 'Bonjour'], {
        A11Y_TOOLBOX_VLM_FORCE_MISSING: '1',
      })
    ).rejects.toMatchObject({
      code: 13,
      stderr: expect.stringContaining('transformers'),
    });
  });

  it("refuse l'exécution lorsque LLAVA_DEVICE impose un GPU indisponible", async () => {
    const modulesRoot = await createFakePythonModules({ cudaAvailable: false });

    try {
      const pythonPath = [modulesRoot, process.env.PYTHONPATH]
        .filter(Boolean)
        .join(delimiter);

      await expect(
        runScript(['--image', tempImage, '--prompt', 'Bonjour'], {
          LLAVA_DEVICE: 'cuda',
          PYTHONPATH: pythonPath,
        })
      ).rejects.toMatchObject({
        code: 14,
        stderr: expect.stringContaining('Aucun GPU CUDA'),
      });
    } finally {
      rmSync(modulesRoot, { recursive: true, force: true });
    }
  });
});
