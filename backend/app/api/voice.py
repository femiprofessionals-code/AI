"""Voice synthesis + transcription endpoints."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session, session_scope
from ..models import Project, Scene
from ..schemas import TranscribeIn, VoiceGenerateIn
from ..services.voice_service import voice_service
from ..services.whisper_service import whisper_service
from ..utils.queue import JobContext, queue
from ..utils.storage import audio_dir, subtitles_dir, to_web_path

router = APIRouter()


async def _voice_job(ctx: JobContext) -> dict:
    from ..models import Job
    async with session_scope() as s:
        job = await s.get(Job, ctx.job_id)
        payload = job.payload if job else {}

    project_id = int(payload["project_id"])
    scene_id = payload.get("scene_id")
    voice = payload.get("voice", "female")

    async with session_scope() as s:
        if scene_id:
            scenes = [await s.get(Scene, scene_id)]
        else:
            scenes = (
                await s.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.idx))
            ).scalars().all()
        scenes = [sc for sc in scenes if sc is not None]

    out_dir = audio_dir(project_id)
    results = []
    total = len(scenes) or 1
    for i, sc in enumerate(scenes):
        await ctx.progress(i / total, f"voice {i + 1}/{total}")
        path = out_dir / f"scene_{sc.idx:03d}.wav"
        dur = await voice_service.synthesize(sc.narration, voice=voice, out_path=path)
        async with session_scope() as s:
            row = await s.get(Scene, sc.id)
            if row:
                row.audio_path = str(path)
                row.duration_sec = max(row.duration_sec, dur)
        results.append({"scene_id": sc.id, "audio_path": to_web_path(path), "duration_sec": dur})

    await ctx.progress(1.0, "done")
    return {"voices": results}


queue.register("voice", _voice_job)


@router.post("/generate")
async def generate(body: VoiceGenerateIn, s: AsyncSession = Depends(get_session)) -> dict:
    project = await s.get(Project, body.project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    job_id = await queue.enqueue("voice", payload=body.model_dump(), project_id=body.project_id)
    return {"job_id": job_id}


@router.post("/transcribe")
async def transcribe(body: TranscribeIn, s: AsyncSession = Depends(get_session)) -> dict:
    """Concatenate per-scene WAVs and produce a single SRT for the full narration."""
    rows = (
        await s.execute(select(Scene).where(Scene.project_id == body.project_id).order_by(Scene.idx))
    ).scalars().all()
    audio_files = [Path(r.audio_path) for r in rows if r.audio_path]
    if not audio_files:
        raise HTTPException(400, "no audio yet — run voice generation first")
    srt_out = subtitles_dir(body.project_id) / "full.srt"
    full_wav = audio_dir(body.project_id) / "full.wav"
    await voice_service.concat_wavs(audio_files, full_wav)
    await whisper_service.transcribe_to_srt(full_wav, srt_out)
    return {"srt_path": to_web_path(srt_out), "audio_path": to_web_path(full_wav)}
