"""In-process async job queue.

Heavy work (image gen, video encode) is dispatched here so HTTP requests return
fast. Jobs persist in the `jobs` table so the frontend can poll/SSE for status
and so an interrupted backend can resume them on restart.

Concurrency = 1 by design: 12 GB RAM cannot run two heavy models at once.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select

from ..database import session_scope
from ..models import Job, JobStatus

log = logging.getLogger("studio.queue")

JobFn = Callable[["JobContext"], Awaitable[dict[str, Any]]]


class JobContext:
    """Passed to job handlers; lets them publish progress updates."""

    def __init__(self, job_id: int) -> None:
        self.job_id = job_id

    async def progress(self, value: float, message: str = "") -> None:
        async with session_scope() as s:
            job = await s.get(Job, self.job_id)
            if job is None:
                return
            job.progress = max(0.0, min(1.0, value))
            if message:
                job.message = message


class JobQueue:
    def __init__(self) -> None:
        self._handlers: dict[str, JobFn] = {}
        self._worker: asyncio.Task | None = None
        self._wake = asyncio.Event()
        self._stopping = False

    def register(self, kind: str, handler: JobFn) -> None:
        self._handlers[kind] = handler

    async def enqueue(self, kind: str, payload: dict[str, Any], project_id: int | None = None) -> int:
        async with session_scope() as s:
            job = Job(kind=kind, payload=payload, project_id=project_id)
            s.add(job)
            await s.flush()
            jid = job.id
        self._wake.set()
        return jid

    async def start(self) -> None:
        if self._worker is None:
            self._worker = asyncio.create_task(self._run(), name="studio-job-worker")

    async def stop(self) -> None:
        self._stopping = True
        self._wake.set()
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except (asyncio.CancelledError, Exception):
                pass

    async def _next_pending(self) -> Job | None:
        async with session_scope() as s:
            stmt = select(Job).where(Job.status == JobStatus.PENDING).order_by(Job.id).limit(1)
            row = (await s.execute(stmt)).scalar_one_or_none()
            if row is not None:
                row.status = JobStatus.RUNNING
                row.message = "started"
                # Detach the data we need; session closes on context exit
                return Job(
                    id=row.id,
                    kind=row.kind,
                    payload=row.payload,
                    project_id=row.project_id,
                )
            return None

    async def _finalize(self, job_id: int, ok: bool, result: dict[str, Any], err: str = "") -> None:
        async with session_scope() as s:
            job = await s.get(Job, job_id)
            if job is None:
                return
            job.status = JobStatus.DONE if ok else JobStatus.FAILED
            job.progress = 1.0 if ok else job.progress
            job.message = "done" if ok else f"failed: {err}"
            job.result = result

    async def _run(self) -> None:
        log.info("job worker started")
        while not self._stopping:
            job = await self._next_pending()
            if job is None:
                self._wake.clear()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    pass
                continue

            handler = self._handlers.get(job.kind)
            if handler is None:
                await self._finalize(job.id, ok=False, result={}, err=f"no handler for {job.kind}")
                continue

            ctx = JobContext(job.id)
            try:
                log.info("job %d (%s) starting", job.id, job.kind)
                result = await handler(ctx)
                await self._finalize(job.id, ok=True, result=result or {})
                log.info("job %d done", job.id)
            except Exception as exc:  # noqa: BLE001
                log.exception("job %d failed", job.id)
                await self._finalize(job.id, ok=False, result={}, err=str(exc))


queue = JobQueue()
