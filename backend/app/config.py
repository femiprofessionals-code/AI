"""Centralized settings, read from env with sensible Windows-friendly defaults."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="STUDIO_", env_file=".env", extra="ignore")

    # Server
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = False
    log_level: str = "info"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Paths
    data_dir: Path = Path("data")
    db_path: Path = Path("data/db/studio.sqlite")
    models_dir: Path = Path("data/models")
    projects_dir: Path = Path("data/projects")
    temp_dir: Path = Path("data/temp")

    # Ollama
    ollama_host: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.1:8b-instruct-q4_K_M"
    ollama_timeout_s: int = 300

    # Piper TTS
    piper_voice_male: str = "en_US-ryan-medium"
    piper_voice_female: str = "en_US-amy-medium"

    # Whisper
    whisper_model: str = "base"  # tiny | base | small
    whisper_compute_type: str = "int8"

    # Image gen
    image_model_primary: str = "black-forest-labs/FLUX.1-schnell"
    image_model_fallback: str = "stabilityai/sdxl-turbo"
    image_width: int = 1024
    image_height: int = 576  # 16:9
    image_steps: int = 4

    # Video
    video_fps: int = 30
    video_width: int = 1920
    video_height: int = 1080
    video_bitrate: str = "6M"

    def ensure_dirs(self) -> None:
        for p in (self.data_dir, self.db_path.parent, self.models_dir,
                  self.projects_dir, self.temp_dir):
            p.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
