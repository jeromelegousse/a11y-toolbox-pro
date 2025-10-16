#!/usr/bin/env python3
"""Transcription locale via faster-whisper.

Ce script offre une interface CLI minimaliste compatible avec le contrat
`transcribe({ filePath, language })` attendu par les adaptateurs Node.
"""

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


def _load_faster_whisper():
    if os.environ.get("A11Y_TOOLBOX_STT_FORCE_MISSING") == "1":
        raise RuntimeError(
            "Le module 'faster-whisper' est requis. Installez-le via 'pip install faster-whisper'."
        )

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise RuntimeError(
            "Le module 'faster-whisper' est requis. Installez-le via 'pip install faster-whisper'."
        ) from exc

    return WhisperModel


def _mock_payload(file_path: Path, language: str | None) -> Dict[str, Any]:
    text = os.environ.get("A11Y_TOOLBOX_STT_MOCK_TEXT", "")
    return {
        "engine": "faster-whisper",
        "file": str(file_path),
        "language": language,
        "text": text,
        "segments": []
    }


def _transcribe(file_path: Path, language: str | None) -> Dict[str, Any]:
    if "A11Y_TOOLBOX_STT_MOCK_TEXT" in os.environ:
        return _mock_payload(file_path, language)

    WhisperModel = _load_faster_whisper()

    model_id = os.environ.get("FASTER_WHISPER_MODEL") or os.environ.get("FASTER_WHISPER_MODEL_SIZE", "small")
    device = os.environ.get("FASTER_WHISPER_DEVICE", "auto")
    compute_type = os.environ.get("FASTER_WHISPER_COMPUTE_TYPE", "default")

    model = WhisperModel(model_id, device=device, compute_type=compute_type)

    options: Dict[str, Any] = {
        "language": language or None,
        "beam_size": int(os.environ.get("FASTER_WHISPER_BEAM_SIZE", "5")),
        "temperature": float(os.environ.get("FASTER_WHISPER_TEMPERATURE", "0"))
    }

    segments_iterator, info = model.transcribe(str(file_path), **options)

    segments: List[Dict[str, Any]] = []
    for segment in segments_iterator:
        segments.append(
            {
                "start": getattr(segment, "start", None),
                "end": getattr(segment, "end", None),
                "text": getattr(segment, "text", "").strip(),
                "confidence": getattr(segment, "avg_logprob", None)
            }
        )

    joined_text = " ".join(filter(None, (segment["text"] for segment in segments))).strip()

    payload: Dict[str, Any] = {
        "engine": "faster-whisper",
        "file": str(file_path),
        "text": joined_text,
        "segments": segments,
        "info": {
            "language": getattr(info, "language", language),
            "duration": getattr(info, "duration", None),
            "language_probability": getattr(info, "language_probability", None)
        }
    }

    if language:
        payload["requestedLanguage"] = language

    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcription locale avec faster-whisper")
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
