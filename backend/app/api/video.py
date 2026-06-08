"""Video assembly + download."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session, session_scope
from ..models import Export, Project, Scene
from ..schemas import VideoAssembleIn, VideoOut
from ..services.video_service import video_service
from ..utils.queue import JobContext, queue
from ..utils.storage import audio_dir, exports_dir, subtitles_dir, to_web_path

router = APIRouter()


async def _video_job(ctx: JobContext) -> dict:
    from ..models import Job
    async with session_scope() as s:
        job = await s.get(Job, ctx.job_id)
        payload = job.payload if job else {}

    project_id = int(payload["project_id"])
    add_subs = bool(payload.get("add_subtitles", True))
    bg_music = payload.get("background_music_path")
    music_vol = float(payload.get("music_volume", 0.15))

    async with session_scope() as s:
        scenes = (
            await s.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.idx))
        ).scalars().all()
    scenes = [sc for sc in scenes if sc.image_path and sc.audio_path]
    if not scenes:
        raise RuntimeError("project has no scenes with image+audio")

    await ctx.progress(0.05, "assembling")
    srt = subtitles_dir(project_id) / "full.srt"
    out_mp4 = exports_dir(project_id) / "final_1080p.mp4"

    info = await video_service.assemble(
        scenes=[(sc.image_path, sc.audio_path, sc.duration_sec) for sc in scenes],
        out_path=out_mp4,
        srt_path=srt if (add_subs and srt.exists()) else None,
        bg_music_path=Path(bg_music) if bg_music else None,
        music_volume=music_vol,
        progress=lambda v: ctx.progress(0.05 + v * 0.9, f"encoding {int(v * 100)}%"),
    )

    async with session_scope() as s:
        exp = Export(
            project_id=project_id,
            path=str(out_mp4),
            width=info["width"],
            height=info["height"],
            fps=info["fps"],
            duration_sec=info["duration"],
            size_bytes=info["size"],
        )
        s.add(exp)
        await s.flush()
        eid = exp.id

    await ctx.progress(1.0, "done")
    return {"export_id": eid, "path": to_web_path(out_mp4), **info}


queue.register("video", _video_job)


@router.post("/assemble")
async def assemble(body: VideoAssembleIn, s: AsyncSession = Depends(get_session)) -> dict:
    project = await s.get(Project, body.project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    job_id = await queue.enqueue("video", payload=body.model_dump(), project_id=body.project_id)
    return {"job_id": job_id}


@router.get("/by-project/{project_id}", response_model=list[VideoOut])
async def list_for_project(project_id: int, s: AsyncSession = Depends(get_session)) -> list[VideoOut]:
    rows = (
        await s.execute(select(Export).where(Export.project_id == project_id).order_by(Export.id.desc()))
    ).scalars().all()
    return [VideoOut.model_validate(r) for r in rows]


@router.get("/{export_id}/download")
async def download(export_id: int, s: AsyncSession = Depends(get_session)) -> FileResponse:
    exp = await s.get(Export, export_id)
    if exp is None or not Path(exp.path).exists():
        raise HTTPException(404, "export not found")
    return FileResponse(exp.path, media_type="video/mp4", filename=Path(exp.path).name)
