"""Video assembly with Ken-Burns motion, crossfades, narration, music, and burned-in subtitles.

Uses MoviePy on top of FFmpeg. The output is 1920x1080 @ 30fps H.264 + AAC.
"""
from __future__ import annotations

import asyncio
import logging
import random
import subprocess
from collections.abc import Awaitable, Callable
from pathlib import Path

from PIL import Image

from ..config import settings

log = logging.getLogger("studio.video")

ProgressCb = Callable[[float], Awaitable[None]]


def _import_moviepy():
    # Lazy: avoid 4s startup cost when only the API is hit
    from moviepy.audio.AudioClip import CompositeAudioClip
    from moviepy.audio.fx.audio_loop import audio_loop
    from moviepy.editor import (
        AudioFileClip,
        CompositeVideoClip,
        ImageClip,
        concatenate_videoclips,
    )
    from moviepy.video.fx import resize
    return {
        "AudioFileClip": AudioFileClip,
        "ImageClip": ImageClip,
        "CompositeVideoClip": CompositeVideoClip,
        "CompositeAudioClip": CompositeAudioClip,
        "concatenate_videoclips": concatenate_videoclips,
        "audio_loop": audio_loop,
        "resize": resize.resize,
    }


class VideoService:

    async def assemble(
        self,
        *,
        scenes: list[tuple[str, str, float]],
        out_path: Path,
        srt_path: Path | None,
        bg_music_path: Path | None,
        music_volume: float,
        progress: ProgressCb | None = None,
    ) -> dict:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        info = await asyncio.to_thread(
            self._assemble_sync,
            scenes,
            out_path,
            srt_path,
            bg_music_path,
            music_volume,
        )
        if progress:
            await progress(1.0)
        return info

    # ---------- internal sync ----------

    def _assemble_sync(
        self,
        scenes: list[tuple[str, str, float]],
        out_path: Path,
        srt_path: Path | None,
        bg_music_path: Path | None,
        music_volume: float,
    ) -> dict:
        mp = _import_moviepy()
        W, H, FPS = settings.video_width, settings.video_height, settings.video_fps

        clips = []
        narration_clips = []
        for i, (image_path, audio_path, want_duration) in enumerate(scenes):
            audio = mp["AudioFileClip"](audio_path)
            duration = max(want_duration, audio.duration + 0.1)
            clip = self._ken_burns_clip(mp, image_path, duration, W, H, FPS, idx=i)
            clip = clip.set_audio(audio.set_duration(duration))
            if i > 0:
                clip = clip.crossfadein(0.4)
            clips.append(clip)
            narration_clips.append(audio)

        video = mp["concatenate_videoclips"](clips, method="compose", padding=-0.4)

        if bg_music_path and bg_music_path.exists():
            bgm = mp["AudioFileClip"](str(bg_music_path)).volumex(music_volume)
            bgm = mp["audio_loop"](bgm, duration=video.duration)
            video = video.set_audio(mp["CompositeAudioClip"]([video.audio, bgm]))

        tmp_no_subs = out_path.with_suffix(".tmp.mp4")
        video.write_videofile(
            str(tmp_no_subs),
            fps=FPS,
            codec="libx264",
            audio_codec="aac",
            bitrate=settings.video_bitrate,
            preset="medium",
            threads=4,
            verbose=False,
            logger=None,
        )

        if srt_path and srt_path.exists() and srt_path.stat().st_size > 0:
            self._burn_subs(tmp_no_subs, srt_path, out_path)
            tmp_no_subs.unlink(missing_ok=True)
        else:
            tmp_no_subs.replace(out_path)

        duration = float(video.duration)
        size = out_path.stat().st_size
        return {"width": W, "height": H, "fps": FPS, "duration": duration, "size": size}

    def _ken_burns_clip(self, mp, image_path: str, duration: float, W: int, H: int, fps: int, idx: int):
        img = Image.open(image_path).convert("RGB")
        ratio_target = W / H
        iw, ih = img.size
        ratio_src = iw / ih
        if ratio_src > ratio_target:
            new_h = H
            new_w = int(round(ratio_src * new_h))
        else:
            new_w = W
            new_h = int(round(new_w / ratio_src))
        scale = 1.18
        big_w, big_h = int(new_w * scale), int(new_h * scale)
        img_resized = img.resize((big_w, big_h), Image.LANCZOS)
        tmp_path = Path(image_path).with_suffix(".kb.png")
        img_resized.save(tmp_path)

        clip = mp["ImageClip"](str(tmp_path)).set_duration(duration).set_fps(fps)

        directions = [("zoom_in",), ("zoom_out",), ("pan_left",), ("pan_right",)]
        choice = directions[(idx + random.randint(0, 3)) % len(directions)][0]

        def pos(t: float):
            p = t / max(duration, 0.0001)
            cx = (big_w - W) / 2
            cy = (big_h - H) / 2
            if choice == "pan_left":
                return (-(cx + (big_w - W - cx) * (1 - p)), -cy)
            if choice == "pan_right":
                return (-(cx + (big_w - W - cx) * p) + (big_w - W - cx), -cy)
            return (-cx, -cy)

        def scale_fn(t: float):
            p = t / max(duration, 0.0001)
            if choice == "zoom_in":
                return 1.0 + 0.06 * p
            if choice == "zoom_out":
                return 1.06 - 0.06 * p
            return 1.0

        clip = clip.resize(lambda t: scale_fn(t)).set_position(pos)
        bg = mp["ImageClip"](color_to_black(W, H)).set_duration(duration).set_fps(fps)
        composed = mp["CompositeVideoClip"]([bg, clip], size=(W, H))
        return composed.set_duration(duration)

    def _burn_subs(self, src: Path, srt: Path, dst: Path) -> None:
        # ffmpeg subtitle filter; escape Windows-style paths
        srt_arg = str(srt).replace("\\", "/").replace(":", "\\:")
        vf = (
            f"subtitles='{srt_arg}':force_style="
            "'Fontname=Arial,Fontsize=28,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=60'"
        )
        cmd = [
            "ffmpeg", "-y", "-i", str(src), "-vf", vf,
            "-c:v", "libx264", "-preset", "medium", "-b:v", settings.video_bitrate,
            "-c:a", "copy", str(dst),
        ]
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode != 0:
            log.warning("subtitle burn failed; shipping video without subs:\n%s", r.stderr.decode(errors="ignore"))
            src.replace(dst)


def color_to_black(w: int, h: int):
    import numpy as np
    return np.zeros((h, w, 3), dtype="uint8")


video_service = VideoService()
