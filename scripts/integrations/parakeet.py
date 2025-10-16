#!/usr/bin/env python3
"""Transcription locale avec NVIDIA NeMo Parakeet."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List


def _print_error(message: str) -> None:
    sys.stderr.write(message + "\n")


def _ensure_file(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"Le fichier {path} est introuvable.")
    if not path.is_file():
        raise FileNotFoundError(f"Le chemin {path} doit être un fichier audio.")
    return path


def _load_parakeet():
    if os.environ.get("A11Y_TOOLBOX_STT_FORCE_MISSING") == "1":
        raise RuntimeError(
            "Le module 'nemo_toolkit[asr]' est requis. Installez-le via 'pip install nemo_toolkit[asr]' et PyTorch."
        )

    try:
        from nemo.collections.asr.models import ASRModel  # type: ignore
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise RuntimeError(
            "Le module 'nemo_toolkit[asr]' est requis. Installez-le via 'pip install nemo_toolkit[asr]' et PyTorch."  # noqa: E501
        ) from exc

    return ASRModel


def _mock_payload(file_path: Path, language: str | None) -> Dict[str, Any]:
    text = os.environ.get("A11Y_TOOLBOX_STT_MOCK_TEXT", "")
    return {
        "engine": "parakeet",
        "file": str(file_path),
        "language": language,
        "text": text,
        "segments": []
    }


def _transcribe(file_path: Path, language: str | None) -> Dict[str, Any]:
    if "A11Y_TOOLBOX_STT_MOCK_TEXT" in os.environ:
        return _mock_payload(file_path, language)

    ASRModel = _load_parakeet()

    model_name = os.environ.get("PARAKEET_MODEL_NAME", "stt_en_conformer_ctc_small")
    map_location = os.environ.get("PARAKEET_DEVICE", "cpu")

    asr_model = ASRModel.from_pretrained(model_name=model_name, map_location=map_location)

    # La plupart des modèles Parakeet retournent une liste de chaînes.
    transcripts: List[str] = asr_model.transcribe(paths2audio_files=[str(file_path)])

    transcript_text = " ".join(t.strip() for t in transcripts if t).strip()

    payload: Dict[str, Any] = {
        "engine": "parakeet",
        "file": str(file_path),
        "text": transcript_text,
        "language": language or os.environ.get("PARAKEET_LANGUAGE"),
        "model": model_name
    }

    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcription locale avec NVIDIA NeMo Parakeet")
    parser.add_argument("--file", dest="file_path", required=True, help="Chemin du fichier audio à transcrire")
    parser.add_argument("--language", dest="language", required=False, help="Langue cible (optionnelle)")

    args = parser.parse_args()

    try:
        audio_file = _ensure_file(Path(args.file_path).expanduser().resolve())
        payload = _transcribe(audio_file, args.language)
    except Exception as error:  # pragma: no cover - dépend de l'environnement
        _print_error(str(error))
        sys.exit(1)

    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
