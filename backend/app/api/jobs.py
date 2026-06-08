"""Job listing + SSE stream for progress."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from ..database import SessionLocal, get_session
from ..models import Job
from ..schemas import JobOut

router = APIRouter()


@router.get("", response_model=list[JobOut])
async def list_jobs(limit: int = 50, s: AsyncSession = Depends(get_session)) -> list[JobOut]:
    rows = (await s.execute(select(Job).order_by(Job.id.desc()).limit(limit))).scalars().all()
    return [JobOut.model_validate(r) for r in rows]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: int, s: AsyncSession = Depends(get_session)) -> JobOut:
    row = await s.get(Job, job_id)
    if row is None:
        raise HTTPException(404, "job not found")
    return JobOut.model_validate(row)


@router.get("/{job_id}/stream")
async def stream_job(job_id: int):
    """SSE stream of job state. Closes when the job hits a terminal status."""

    async def event_gen():
        last = None
        while True:
            async with SessionLocal() as s:
                row = await s.get(Job, job_id)
                if row is None:
                    yield {"event": "error", "data": json.dumps({"detail": "not found"})}
                    return
                payload = {
                    "id": row.id,
                    "kind": row.kind,
                    "status": row.status,
                    "progress": row.progress,
                    "message": row.message,
                    "result": row.result,
                }
                if payload != last:
                    yield {"event": "update", "data": json.dumps(payload, default=str)}
                    last = payload
                if row.status in ("done", "failed"):
                    return
            await asyncio.sleep(0.5)

    return EventSourceResponse(event_gen())
