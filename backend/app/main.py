"""FastAPI application entry point. Wires routes, CORS, lifespan."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import (
    dashboard,
    images,
    jobs,
    maintenance,
    projects,
    scenes,
    scripts,
    settings as settings_api,
    thumbnails,
    video,
    voice,
)
from .config import settings
from .database import init_db
from .utils.queue import queue

log = logging.getLogger("studio")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
    )
    await init_db()
    await queue.start()
    log.info("studio backend ready on %s:%s", settings.host, settings.port)
    try:
        yield
    finally:
        await queue.stop()


app = FastAPI(
    title="AI Content Studio",
    version="0.1.0",
    description="Local AI content creation backend.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated assets so the frontend can <img src=...> them directly.
app.mount("/files", StaticFiles(directory=settings.data_dir.as_posix()), name="files")

# Routers
app.include_router(dashboard.router, prefix="/api", tags=["dashboard"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(scripts.router, prefix="/api/scripts", tags=["scripts"])
app.include_router(scenes.router, prefix="/api/scenes", tags=["scenes"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(video.router, prefix="/api/video", tags=["video"])
app.include_router(thumbnails.router, prefix="/api/thumbnails", tags=["thumbnails"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["settings"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(maintenance.router, prefix="/api/maintenance", tags=["maintenance"])


@app.exception_handler(Exception)
async def unhandled(_, exc: Exception):
    log.exception("unhandled")
    return JSONResponse(status_code=500, content={"detail": str(exc)})
