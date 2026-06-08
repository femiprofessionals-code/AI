"""faster-whisper wrapper that emits SRT directly."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from ..config import settings

log = logging.getLogger("studio.whisper")


def _ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


class WhisperService:
    def __init__(self) -> None:
        self._model = None

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel
            self._model = WhisperModel(
                settings.whisper_model,
                device="cpu",
                compute_type=settings.whisper_compute_type,
                download_root=str(settings.models_dir / "whisper"),
            )
        return self._model

    async def transcribe_to_srt(self, audio_path: Path, srt_path: Path) -> Path:
        srt_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            await asyncio.to_thread(self._transcribe_sync, audio_path, srt_path)
        except Exception as e:
            log.warning("whisper failed (%s); writing empty SRT", e)
            srt_path.write_text("", encoding="utf-8")
        return srt_path

    def _transcribe_sync(self, audio_path: Path, srt_path: Path) -> None:
        model = self._load()
        segments, _ = model.transcribe(str(audio_path), vad_filter=True, beam_size=1)
        lines: list[str] = []
        for i, seg in enumerate(segments, start=1):
            lines.append(str(i))
            lines.append(f"{_ts(seg.start)} --> {_ts(seg.end)}")
            lines.append(seg.text.strip())
            lines.append("")
        srt_path.write_text("\n".join(lines), encoding="utf-8")


whisper_service = WhisperService()
