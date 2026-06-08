"""CRUD over projects."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Project
from ..schemas import ProjectCreate, ProjectOut

router = APIRouter()


@router.post("", response_model=ProjectOut)
async def create_project(body: ProjectCreate, s: AsyncSession = Depends(get_session)) -> ProjectOut:
    p = Project(name=body.name, topic=body.topic, style=body.style, voice=body.voice)
    s.add(p)
    await s.commit()
    await s.refresh(p)
    return ProjectOut.model_validate(p)


@router.get("", response_model=list[ProjectOut])
async def list_projects(s: AsyncSession = Depends(get_session)) -> list[ProjectOut]:
    rows = (await s.execute(select(Project).order_by(Project.created_at.desc()))).scalars().all()
    return [ProjectOut.model_validate(p) for p in rows]


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, s: AsyncSession = Depends(get_session)) -> ProjectOut:
    p = await s.get(Project, project_id)
    if p is None:
        raise HTTPException(404, "project not found")
    return ProjectOut.model_validate(p)


@router.delete("/{project_id}")
async def delete_project(project_id: int, s: AsyncSession = Depends(get_session)) -> dict:
    p = await s.get(Project, project_id)
    if p is None:
        raise HTTPException(404, "project not found")
    await s.delete(p)
    await s.commit()
    return {"ok": True}
