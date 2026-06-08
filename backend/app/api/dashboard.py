"""Dashboard + health endpoints."""
from __future__ import annotations

import shutil

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_session
from ..models import Export, Job, JobStatus, Project
from ..schemas import DashboardStats, HealthOut
from ..utils.storage import dir_size_bytes

router = APIRouter()


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    ollama_ok = False
    model_ok = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            r = await c.get(f"{settings.ollama_host}/api/tags")
            ollama_ok = r.status_code == 200
            if ollama_ok:
                models = [m.get("name", "") for m in r.json().get("models", [])]
                model_ok = any(settings.ollama_model.split(":")[0] in m for m in models)
    except Exception:
        pass

    ffmpeg_ok = shutil.which("ffmpeg") is not None

    try:
        import piper  # noqa: F401
        piper_ok = True
    except Exception:
        piper_ok = False

    try:
        import faster_whisper  # noqa: F401
        whisper_ok = True
    except Exception:
        whisper_ok = False

    free = shutil.disk_usage(settings.data_dir).free / (1024**3)

    return HealthOut(
        api=True,
        ollama=ollama_ok,
        ollama_model_present=model_ok,
        piper=piper_ok,
        whisper=whisper_ok,
        ffmpeg=ffmpeg_ok,
        disk_free_gb=round(free, 2),
    )


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(s: AsyncSession = Depends(get_session)) -> DashboardStats:
    projects = (await s.execute(select(func.count(Project.id)))).scalar() or 0
    videos = (await s.execute(select(func.count(Export.id)))).scalar() or 0
    pending = (await s.execute(
        select(func.count(Job.id)).where(Job.status == JobStatus.PENDING)
    )).scalar() or 0
    running = (await s.execute(
        select(func.count(Job.id)).where(Job.status == JobStatus.RUNNING)
    )).scalar() or 0
    storage = dir_size_bytes(settings.projects_dir)
    return DashboardStats(
        projects=int(projects),
        videos=int(videos),
        storage_bytes=int(storage),
        queue_pending=int(pending),
        queue_running=int(running),
    )
