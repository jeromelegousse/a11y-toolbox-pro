#!/usr/bin/env python3
"""Génération locale de descriptions d'images avec un modèle LLaVA."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Tuple


DEFAULT_MODEL_NAME = "llava-hf/llava-phi-3-mini"


def _print_error(message: str) -> None:
    sys.stderr.write(message + "\n")


def _ensure_file(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"Le fichier {path} est introuvable.")
    if not path.is_file():
        raise FileNotFoundError(f"Le chemin {path} doit être un fichier image.")
    return path


def _mock_response(image_path: Path, prompt: str) -> Dict[str, Any]:
    text = os.environ.get("A11Y_TOOLBOX_VLM_MOCK_TEXT", "")
    return {
        "text": text,
        "raw": {
            "mode": "mock",
            "image": str(image_path),
            "prompt": prompt
        }
    }


def _load_image(image_path: Path):
    try:
        from PIL import Image  # type: ignore
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise RuntimeError("Le module 'Pillow' est requis. Installez-le via 'pip install pillow'.") from exc

    with Image.open(str(image_path)) as image:
        return image.convert("RGB")


def _load_model_and_processor(model_name: str) -> Tuple[Any, Any, str]:
    if os.environ.get("A11Y_TOOLBOX_VLM_FORCE_MISSING") == "1":
        raise RuntimeError(
            "Les modules 'transformers' et 'accelerate' sont requis. Installez-les via 'pip install transformers accelerate'."
        )

    try:
        import torch
        from transformers import AutoModelForVision2Seq, AutoProcessor
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise RuntimeError(
            "Les modules 'transformers' et 'accelerate' sont requis. Installez-les via 'pip install transformers accelerate'."
        ) from exc

    device = os.environ.get("LLAVA_DEVICE")
    if not device:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    dtype = torch.float16 if device.startswith("cuda") else torch.float32

    processor = AutoProcessor.from_pretrained(model_name)
    model = AutoModelForVision2Seq.from_pretrained(
        model_name,
        torch_dtype=dtype,
        low_cpu_mem_usage=True
    )

    model.to(device)
    model.eval()

    return processor, model, device


def _prepare_inputs(
    processor: Any,
    image: Any,
    prompt: str,
    device: str,
) -> Dict[str, Any]:
    conversation = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image"},
            ],
        }
    ]

    if hasattr(processor, "apply_chat_template"):
        chat_prompt = processor.apply_chat_template(
            conversation,
            add_generation_prompt=True,
        )
    else:  # pragma: no cover - dépend de la version des Transformers
        chat_prompt = prompt

    inputs = processor(images=image, text=chat_prompt, return_tensors="pt")

    if hasattr(inputs, "to"):
        inputs = inputs.to(device=device)
        return dict(inputs)

    prepared: Dict[str, Any] = {}
    for key, value in inputs.items():
        if hasattr(value, "to"):
            prepared[key] = value.to(device=device)
        else:
            prepared[key] = value

    return prepared


def _generate_caption(image_path: Path, prompt: str, model_name: str) -> Dict[str, Any]:
    if "A11Y_TOOLBOX_VLM_MOCK_TEXT" in os.environ:
        return _mock_response(image_path, prompt)

    processor, model, device = _load_model_and_processor(model_name)

    try:
        import torch
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise RuntimeError("Le module 'torch' est requis pour exécuter le modèle LLaVA.") from exc

    image = _load_image(image_path)

    inputs = _prepare_inputs(processor, image, prompt, device)

    max_new_tokens_env = os.environ.get("LLAVA_MAX_NEW_TOKENS")
    if max_new_tokens_env is None:
        max_new_tokens = 512
    else:
        try:
            max_new_tokens = int(max_new_tokens_env)
        except ValueError as exc:
            raise ValueError("LLAVA_MAX_NEW_TOKENS doit être un entier valide.") from exc

    with torch.inference_mode():
        generated_ids = model.generate(**inputs, max_new_tokens=max_new_tokens)

    generated_ids = generated_ids.to("cpu")
    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()

    payload: Dict[str, Any] = {
        "text": generated_text,
        "raw": {
            "model": model_name,
            "device": device,
            "prompt": prompt,
            "image": str(image_path),
            "tokens": generated_ids[0].tolist()
        }
    }

    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Génération locale via LLaVA")
    parser.add_argument("--image", dest="image_path", required=True, help="Chemin du fichier image")
    parser.add_argument("--prompt", dest="prompt", required=True, help="Invite textuelle pour la description")
    parser.add_argument("--model", dest="model", required=False, help="Nom du modèle à charger")

    args = parser.parse_args()

    model_name = args.model or os.environ.get("LLAVA_MODEL_NAME", DEFAULT_MODEL_NAME)

    try:
        image_file = _ensure_file(Path(args.image_path).expanduser().resolve())
        result = _generate_caption(image_file, args.prompt, model_name)
    except Exception as error:  # pragma: no cover - dépend de l'environnement
        _print_error(str(error))
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
