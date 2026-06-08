"""Thumbnail generator (YouTube 1280x720, Facebook 1200x630)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Project, Scene
from ..schemas import ThumbnailIn, ThumbnailOut
from ..services.thumbnail_service import thumbnail_service
from ..utils.storage import thumbnails_dir, to_web_path

router = APIRouter()


@router.post("/generate", response_model=ThumbnailOut)
async def generate(body: ThumbnailIn, s: AsyncSession = Depends(get_session)) -> ThumbnailOut:
    project = await s.get(Project, body.project_id)
    if project is None:
        raise HTTPException(404, "project not found")

    bg = None
    if body.background_scene_id:
        sc = await s.get(Scene, body.background_scene_id)
        if sc and sc.image_path:
            bg = sc.image_path

    out = thumbnails_dir(body.project_id) / f"{body.platform}.png"
    thumbnail_service.render(
        title=body.title,
        platform=body.platform,
        background=bg,
        out_path=out,
    )
    return ThumbnailOut(path=to_web_path(out), platform=body.platform)
