"""Image generation endpoints. Enqueues to the job queue for long work."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Project, Scene
from ..schemas import ImageGenerateIn
from ..services.image_service import image_service
from ..utils.queue import JobContext, queue
from ..utils.storage import images_dir, to_web_path

router = APIRouter()


async def _image_job(ctx: JobContext) -> dict:
    """Job handler — runs in the queue worker, not the request thread."""
    from ..database import session_scope

    async with session_scope() as s:
        from ..models import Job
        job = await s.get(Job, ctx.job_id)
        payload = job.payload if job else {}

    project_id = int(payload["project_id"])
    scene_id = payload.get("scene_id")
    style = payload.get("style", "cinematic")
    seed = payload.get("seed")

    async with session_scope() as s:
        if scene_id:
            scenes = [await s.get(Scene, scene_id)]
        else:
            scenes = (
                await s.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.idx))
            ).scalars().all()
        scenes = [sc for sc in scenes if sc is not None]

    if not scenes:
        return {"images": []}

    out_dir = images_dir(project_id)
    results = []
    total = len(scenes)
    for i, sc in enumerate(scenes):
        await ctx.progress(i / total, f"image {i + 1}/{total}")
        path = out_dir / f"scene_{sc.idx:03d}.png"
        await image_service.generate(sc.image_prompt, style=style, out_path=path, seed=seed)
        async with session_scope() as s:
            row = await s.get(Scene, sc.id)
            if row:
                row.image_path = str(path)
        results.append({"scene_id": sc.id, "image_path": to_web_path(path)})

    await ctx.progress(1.0, "done")
    return {"images": results}


queue.register("image", _image_job)


@router.post("/generate")
async def generate(body: ImageGenerateIn, s: AsyncSession = Depends(get_session)) -> dict:
    project = await s.get(Project, body.project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    job_id = await queue.enqueue(
        "image",
        payload=body.model_dump(),
        project_id=body.project_id,
    )
    return {"job_id": job_id}


@router.get("/by-project/{project_id}")
async def list_for_project(project_id: int, s: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = (
        await s.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.idx))
    ).scalars().all()
    return [
        {"scene_id": r.id, "idx": r.idx, "image_path": to_web_path(r.image_path) if r.image_path else None}
        for r in rows
    ]
