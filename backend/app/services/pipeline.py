"""Single-shot orchestrator: topic → finished video.

Used by the `POST /api/projects/{id}/build` shortcut (frontend "Generate everything"
button). Calls each service in order and tears down heavy models between phases so
peak RSS stays under ~9 GB on a 12 GB box.
"""
from __future__ import annotations

import logging

from sqlalchemy import select

from ..database import session_scope
from ..models import Project, Scene
from ..utils.storage import audio_dir, exports_dir, images_dir, subtitles_dir
from .image_service import image_service
from .ollama_service import generate_scenes, generate_script
from .video_service import video_service
from .voice_service import voice_service
from .whisper_service import whisper_service

log = logging.getLogger("studio.pipeline")


async def build_project_end_to_end(project_id: int) -> dict:
    async with session_scope() as s:
        proj = await s.get(Project, project_id)
        if not proj:
            raise ValueError("project not found")

    # 1. Script
    script = await generate_script(proj.topic, target_seconds=60, tone="engaging")

    # 2. Scenes
    raw = script.raw or f"{script.hook}\n{script.body}\n{script.cta}"
    scene_specs = await generate_scenes(raw, style=proj.style, avg_seconds=5.0)

    async with session_scope() as s:
        for i, sc in enumerate(scene_specs):
            s.add(Scene(
                project_id=project_id, idx=i,
                narration=sc.narration, image_prompt=sc.image_prompt,
                duration_sec=sc.duration_sec,
            ))

    # 3. Images
    img_dir = images_dir(project_id)
    async with session_scope() as s:
        scenes = (
            await s.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.idx))
        ).scalars().all()
        ids = [(sc.id, sc.idx, sc.image_prompt) for sc in scenes]

    for sid, idx, prompt in ids:
        out = img_dir / f"scene_{idx:03d}.png"
        await image_service.generate(prompt, style=proj.style, out_path=out)
        async with session_scope() as s:
            row = await s.get(Scene, sid)
            if row:
                row.image_path = str(out)

    image_service.unload()  # free RAM before TTS/encode

    # 4. Voice
    a_dir = audio_dir(project_id)
    for sid, idx, _ in ids:
        async with session_scope() as s:
            row = await s.get(Scene, sid)
            text = row.narration if row else ""
        out = a_dir / f"scene_{idx:03d}.wav"
        dur = await voice_service.synthesize(text, voice=proj.voice, out_path=out)
        async with session_scope() as s:
            row = await s.get(Scene, sid)
            if row:
                row.audio_path = str(out)
                row.duration_sec = max(row.duration_sec, dur)

    # 5. Subtitles
    full_wav = a_dir / "full.wav"
    srt = subtitles_dir(project_id) / "full.srt"
    async with session_scope() as s:
        scenes = (
            await s.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.idx))
        ).scalars().all()
    await voice_service.concat_wavs([__import__("pathlib").Path(sc.audio_path) for sc in scenes if sc.audio_path], full_wav)
    await whisper_service.transcribe_to_srt(full_wav, srt)

    # 6. Video
    out_mp4 = exports_dir(project_id) / "final_1080p.mp4"
    info = await video_service.assemble(
        scenes=[(sc.image_path, sc.audio_path, sc.duration_sec) for sc in scenes if sc.image_path and sc.audio_path],
        out_path=out_mp4,
        srt_path=srt if srt.exists() else None,
        bg_music_path=None,
        music_volume=0.15,
    )
    return {"path": str(out_mp4), **info}
