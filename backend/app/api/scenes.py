"""Scene breakdown endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Project, Scene, Script
from ..schemas import SceneGenerateIn, SceneOut
from ..services.ollama_service import generate_scenes

router = APIRouter()


@router.post("/generate", response_model=list[SceneOut])
async def generate(body: SceneGenerateIn, s: AsyncSession = Depends(get_session)) -> list[SceneOut]:
    project = await s.get(Project, body.project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    script = await s.get(Script, body.script_id)
    if script is None:
        raise HTTPException(404, "script not found")

    # Replace any existing scenes on the project — keeps things tidy
    await s.execute(delete(Scene).where(Scene.project_id == project.id))
    await s.flush()

    scenes = await generate_scenes(
        script_text=script.raw or f"{script.hook}\n{script.body}\n{script.cta}",
        style=project.style,
        avg_seconds=body.avg_scene_seconds,
    )
    rows: list[Scene] = []
    for i, sc in enumerate(scenes):
        row = Scene(
            project_id=project.id,
            idx=i,
            narration=sc.narration,
            image_prompt=sc.image_prompt,
            duration_sec=sc.duration_sec,
        )
        s.add(row)
        rows.append(row)
    await s.commit()
    for r in rows:
        await s.refresh(r)
    return [SceneOut.model_validate(r) for r in rows]


@router.get("/by-project/{project_id}", response_model=list[SceneOut])
async def list_for_project(project_id: int, s: AsyncSession = Depends(get_session)) -> list[SceneOut]:
    rows = (
        await s.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.idx))
    ).scalars().all()
    return [SceneOut.model_validate(r) for r in rows]


@router.patch("/{scene_id}", response_model=SceneOut)
async def update_scene(
    scene_id: int,
    payload: dict,
    s: AsyncSession = Depends(get_session),
) -> SceneOut:
    row = await s.get(Scene, scene_id)
    if row is None:
        raise HTTPException(404, "scene not found")
    for k in ("narration", "image_prompt", "duration_sec"):
        if k in payload:
            setattr(row, k, payload[k])
    await s.commit()
    await s.refresh(row)
    return SceneOut.model_validate(row)
