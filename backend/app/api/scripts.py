"""Script generation endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Project, Script
from ..schemas import ScriptGenerateIn, ScriptOut
from ..services.ollama_service import generate_script

router = APIRouter()


@router.post("/generate", response_model=ScriptOut)
async def generate(body: ScriptGenerateIn, s: AsyncSession = Depends(get_session)) -> ScriptOut:
    project = await s.get(Project, body.project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    topic = body.topic or project.topic
    parts = await generate_script(topic, body.target_seconds, body.tone)
    script = Script(
        project_id=project.id,
        hook=parts.hook,
        body=parts.body,
        cta=parts.cta,
        raw=parts.raw,
    )
    s.add(script)
    await s.commit()
    await s.refresh(script)
    return ScriptOut.model_validate(script)


@router.get("/by-project/{project_id}", response_model=list[ScriptOut])
async def list_for_project(project_id: int, s: AsyncSession = Depends(get_session)) -> list[ScriptOut]:
    rows = (
        await s.execute(select(Script).where(Script.project_id == project_id).order_by(Script.id.desc()))
    ).scalars().all()
    return [ScriptOut.model_validate(r) for r in rows]


@router.get("/{script_id}", response_model=ScriptOut)
async def get_one(script_id: int, s: AsyncSession = Depends(get_session)) -> ScriptOut:
    row = await s.get(Script, script_id)
    if row is None:
        raise HTTPException(404, "script not found")
    return ScriptOut.model_validate(row)
