"""Piper TTS wrapper + WAV concatenation."""
from __future__ import annotations

import asyncio
import logging
import subprocess
import wave
from pathlib import Path

from ..config import settings

log = logging.getLogger("studio.voice")


class VoiceService:
    def __init__(self) -> None:
        self._voice_male = settings.piper_voice_male
        self._voice_female = settings.piper_voice_female

    def _voice_for(self, choice: str) -> str:
        return self._voice_male if choice == "male" else self._voice_female

    def _model_path(self, voice: str) -> Path:
        # Expect: data/models/piper/<voice>.onnx (+ .onnx.json)
        return settings.models_dir / "piper" / f"{voice}.onnx"

    async def synthesize(self, text: str, *, voice: str, out_path: Path) -> float:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        chosen = self._voice_for(voice)
        model = self._model_path(chosen)
        if not model.exists():
            log.warning("piper model %s missing — emitting silence", model)
            self._write_silence(out_path, seconds=max(1.0, len(text.split()) * 0.4))
        else:
            await asyncio.to_thread(self._run_piper, text, model, out_path)
        return self._wav_duration(out_path)

    async def concat_wavs(self, parts: list[Path], out_path: Path) -> Path:
        """Concatenate WAVs that share format. Falls back to ffmpeg if not."""
        out_path.parent.mkdir(parents=True, exist_ok=True)
        if not parts:
            self._write_silence(out_path, seconds=0.5)
            return out_path
        try:
            await asyncio.to_thread(self._concat_native, parts, out_path)
        except Exception as e:
            log.info("native concat failed (%s); using ffmpeg", e)
            await asyncio.to_thread(self._concat_ffmpeg, parts, out_path)
        return out_path

    # ---------- internals ----------

    def _run_piper(self, text: str, model: Path, out_path: Path) -> None:
        # piper CLI: echo "text" | piper --model X --output_file Y
        cmd = ["piper", "--model", str(model), "--output_file", str(out_path)]
        proc = subprocess.run(
            cmd, input=text.encode("utf-8"), capture_output=True, check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"piper failed: {proc.stderr.decode(errors='ignore')}")

    def _wav_duration(self, p: Path) -> float:
        try:
            with wave.open(str(p), "rb") as w:
                frames = w.getnframes()
                rate = w.getframerate()
                return frames / float(rate or 1)
        except Exception:
            return 0.0

    def _write_silence(self, out_path: Path, seconds: float, rate: int = 22050) -> None:
        nframes = int(seconds * rate)
        with wave.open(str(out_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(b"\x00\x00" * nframes)

    def _concat_native(self, parts: list[Path], out_path: Path) -> None:
        with wave.open(str(parts[0]), "rb") as ref:
            params = ref.getparams()
        with wave.open(str(out_path), "wb") as w:
            w.setparams(params)
            for p in parts:
                with wave.open(str(p), "rb") as src:
                    if src.getparams()[:4] != params[:4]:
                        raise ValueError("param mismatch")
                    w.writeframes(src.readframes(src.getnframes()))

    def _concat_ffmpeg(self, parts: list[Path], out_path: Path) -> None:
        list_file = out_path.with_suffix(".txt")
        list_file.write_text("\n".join(f"file '{p.resolve().as_posix()}'" for p in parts))
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
             "-c", "copy", str(out_path)],
            check=True, capture_output=True,
        )
        list_file.unlink(missing_ok=True)


voice_service = VoiceService()
