"""Pydantic API schemas. Kept separate from ORM models so the API surface is stable."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Style = Literal["realistic", "documentary", "cinematic", "photorealistic", "historical", "motivational"]
VoiceChoice = Literal["male", "female"]


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Projects ----------

class ProjectCreate(BaseModel):
    name: str
    topic: str
    style: Style = "cinematic"
    voice: VoiceChoice = "female"


class ProjectOut(ORMBase):
    id: int
    name: str
    topic: str
    style: str
    voice: str
    created_at: datetime
    updated_at: datetime


# ---------- Scripts ----------

class ScriptGenerateIn(BaseModel):
    project_id: int
    topic: str | None = None
    target_seconds: int = Field(default=60, ge=15, le=600)
    tone: str = "engaging"


class ScriptOut(ORMBase):
    id: int
    project_id: int
    hook: str
    body: str
    cta: str
    raw: str


# ---------- Scenes ----------

class SceneGenerateIn(BaseModel):
    project_id: int
    script_id: int
    avg_scene_seconds: float = Field(default=5.0, ge=2.0, le=15.0)


class SceneOut(ORMBase):
    id: int
    project_id: int
    idx: int
    narration: str
    image_prompt: str
    duration_sec: float
    image_path: str | None = None
    audio_path: str | None = None


# ---------- Images ----------

class ImageGenerateIn(BaseModel):
    project_id: int
    scene_id: int | None = None  # None = generate all scenes
    style: Style = "cinematic"
    seed: int | None = None


class ImageOut(BaseModel):
    scene_id: int
    image_path: str


# ---------- Voice ----------

class VoiceGenerateIn(BaseModel):
    project_id: int
    scene_id: int | None = None  # None = all
    voice: VoiceChoice = "female"


class VoiceOut(BaseModel):
    scene_id: int
    audio_path: str
    duration_sec: float


class TranscribeIn(BaseModel):
    project_id: int


class TranscribeOut(BaseModel):
    srt_path: str


# ---------- Video ----------

class VideoAssembleIn(BaseModel):
    project_id: int
    add_subtitles: bool = True
    background_music_path: str | None = None
    music_volume: float = 0.15


class VideoOut(ORMBase):
    id: int
    project_id: int
    path: str
    width: int
    height: int
    fps: int
    duration_sec: float
    size_bytes: int
    created_at: datetime


# ---------- Thumbnails ----------

class ThumbnailIn(BaseModel):
    project_id: int
    title: str
    platform: Literal["youtube", "facebook"] = "youtube"
    background_scene_id: int | None = None


class ThumbnailOut(BaseModel):
    path: str
    platform: str


# ---------- Jobs ----------

class JobOut(ORMBase):
    id: int
    project_id: int | None
    kind: str
    status: str
    progress: float
    message: str
    payload: dict[str, Any]
    result: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ---------- Dashboard ----------

class DashboardStats(BaseModel):
    projects: int
    videos: int
    storage_bytes: int
    queue_pending: int
    queue_running: int


class HealthOut(BaseModel):
    api: bool = True
    ollama: bool
    ollama_model_present: bool
    piper: bool
    whisper: bool
    ffmpeg: bool
    disk_free_gb: float


# ---------- Settings ----------

class SettingsOut(BaseModel):
    ollama_model: str
    image_model: str
    image_width: int
    image_height: int
    video_fps: int
    video_width: int
    video_height: int
    projects_dir: str
    models_dir: str


class SettingsUpdate(BaseModel):
    ollama_model: str | None = None
    image_width: int | None = None
    image_height: int | None = None
    video_fps: int | None = None
