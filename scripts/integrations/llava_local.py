#!/usr/bin/env python3
"""Génération locale de descriptions d'images avec un modèle LLaVA."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from dataclasses import dataclass
from enum import IntEnum
from typing import Any, Dict, Tuple


DEFAULT_MODEL_NAME = "llava-hf/llava-phi-3-mini"


class ExitCode(IntEnum):
    SUCCESS = 0
    IMAGE_NOT_FOUND = 10
    INVALID_ARGUMENT = 11
    MODEL_NOT_FOUND = 12
    DEPENDENCY_MISSING = 13
    GPU_UNAVAILABLE = 14
    INFERENCE_ERROR = 15
    IMAGE_DECODE_ERROR = 16


@dataclass
class LlavaScriptError(Exception):
    message: str
    exit_code: int

    def __post_init__(self) -> None:  # pragma: no cover - dataclass hook
        super().__init__(self.message)


def _print_error(message: str) -> None:
    sys.stderr.write(message + "\n")


def _ensure_file(path: Path) -> Path:
    if not path.exists():
        raise LlavaScriptError(
            f"Le fichier {path} est introuvable.", ExitCode.IMAGE_NOT_FOUND
        )
    if not path.is_file():
        raise LlavaScriptError(
            f"Le chemin {path} doit être un fichier image.", ExitCode.INVALID_ARGUMENT
        )
    return path


def _validate_model_name(model_name: str) -> str:
    value = (model_name or "").strip()
    if not value:
        raise LlavaScriptError(
            "Le nom du modèle LLaVA est vide.", ExitCode.INVALID_ARGUMENT
        )

    candidate = Path(value).expanduser()
    explicit_path = (
        candidate.is_absolute()
        or value.startswith("./")
        or value.startswith("../")
        or value.startswith("~")
    )

    if candidate.exists():
        if not candidate.is_dir():
            raise LlavaScriptError(
                f"Le chemin modèle {candidate} doit être un dossier.",
                ExitCode.INVALID_ARGUMENT,
            )
        return value

    if explicit_path:
        raise LlavaScriptError(
            f"Le dossier modèle {candidate} est introuvable.",
            ExitCode.MODEL_NOT_FOUND,
        )

    return value


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
        raise LlavaScriptError(
            "Le module 'Pillow' est requis. Installez-le via 'pip install pillow'.",
            ExitCode.DEPENDENCY_MISSING,
        ) from exc

    try:
        with Image.open(str(image_path)) as image:
            return image.convert("RGB")
    except FileNotFoundError as exc:
        raise LlavaScriptError(str(exc), ExitCode.IMAGE_NOT_FOUND) from exc
    except Exception as exc:  # pragma: no cover - dépend du format image
        raise LlavaScriptError(
            f"Impossible de décoder l'image {image_path}: {exc}",
            ExitCode.IMAGE_DECODE_ERROR,
        ) from exc


def _load_model_and_processor(model_name: str) -> Tuple[Any, Any, str]:
    if os.environ.get("A11Y_TOOLBOX_VLM_FORCE_MISSING") == "1":
        raise LlavaScriptError(
            "Les modules 'transformers' et 'accelerate' sont requis. Installez-les via 'pip install transformers accelerate'.",
            ExitCode.DEPENDENCY_MISSING,
        )

    try:
        import torch
        from transformers import AutoModelForVision2Seq, AutoProcessor
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise LlavaScriptError(
            "Les modules 'transformers' et 'accelerate' sont requis. Installez-les via 'pip install transformers accelerate'.",
            ExitCode.DEPENDENCY_MISSING,
        ) from exc

    requested_device = os.environ.get("LLAVA_DEVICE")
    if requested_device:
        device = requested_device.strip()
    else:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    if device.startswith("cuda") and not torch.cuda.is_available():
        raise LlavaScriptError(
            "Aucun GPU CUDA n'est disponible pour LLAVA_DEVICE=cuda.",
            ExitCode.GPU_UNAVAILABLE,
        )

    dtype = torch.float16 if device.startswith("cuda") else torch.float32

    try:
        processor = AutoProcessor.from_pretrained(model_name)
        model = AutoModelForVision2Seq.from_pretrained(
            model_name,
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
        )
    except OSError as exc:
        raise LlavaScriptError(
            f"Impossible de charger le modèle LLaVA '{model_name}'.", ExitCode.MODEL_NOT_FOUND
        ) from exc
    except Exception as exc:  # pragma: no cover - dépend de la version HF
        raise LlavaScriptError(
            f"Échec du chargement du modèle LLaVA '{model_name}': {exc}",
            ExitCode.INFERENCE_ERROR,
        ) from exc

    try:
        model.to(device)
        model.eval()
    except Exception as exc:  # pragma: no cover - dépend de torch
        raise LlavaScriptError(
            f"Impossible de déplacer le modèle LLaVA sur {device}: {exc}",
            ExitCode.INFERENCE_ERROR,
        ) from exc

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
    validated_model = _validate_model_name(model_name)

    if "A11Y_TOOLBOX_VLM_MOCK_TEXT" in os.environ:
        return _mock_response(image_path, prompt)

    processor, model, device = _load_model_and_processor(validated_model)

    try:
        import torch
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise LlavaScriptError(
            "Le module 'torch' est requis pour exécuter le modèle LLaVA.",
            ExitCode.DEPENDENCY_MISSING,
        ) from exc

    image = _load_image(image_path)

    inputs = _prepare_inputs(processor, image, prompt, device)

    max_new_tokens_env = os.environ.get("LLAVA_MAX_NEW_TOKENS")
    if max_new_tokens_env is None:
        max_new_tokens = 512
    else:
        try:
            max_new_tokens = int(max_new_tokens_env)
        except ValueError as exc:
            raise LlavaScriptError(
                "LLAVA_MAX_NEW_TOKENS doit être un entier valide.",
                ExitCode.INVALID_ARGUMENT,
            ) from exc

    try:
        with torch.inference_mode():
            generated_ids = model.generate(**inputs, max_new_tokens=max_new_tokens)
    except Exception as exc:  # pragma: no cover - dépend du modèle
        raise LlavaScriptError(
            f"Échec de la génération LLaVA: {exc}", ExitCode.INFERENCE_ERROR
        ) from exc

    try:
        generated_ids = generated_ids.to("cpu")
        generated_text = processor.batch_decode(
            generated_ids, skip_special_tokens=True
        )[0].strip()
    except Exception as exc:  # pragma: no cover - dépend du modèle
        raise LlavaScriptError(
            f"Impossible de décoder la sortie LLaVA: {exc}", ExitCode.INFERENCE_ERROR
        ) from exc

    payload: Dict[str, Any] = {
        "text": generated_text,
        "raw": {
            "model": validated_model,
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
    except LlavaScriptError as error:
        _print_error(str(error))
        sys.exit(error.exit_code)
    except Exception as error:  # pragma: no cover - dépend de l'environnement
        _print_error(str(error))
        sys.exit(ExitCode.INFERENCE_ERROR)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
