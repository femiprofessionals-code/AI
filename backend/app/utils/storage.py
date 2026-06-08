"""Project-on-disk layout helpers."""
from __future__ import annotations

from pathlib import Path

from ..config import settings


def project_dir(project_id: int) -> Path:
    p = settings.projects_dir / str(project_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def images_dir(project_id: int) -> Path:
    p = project_dir(project_id) / "images"
    p.mkdir(exist_ok=True)
    return p


def audio_dir(project_id: int) -> Path:
    p = project_dir(project_id) / "audio"
    p.mkdir(exist_ok=True)
    return p


def subtitles_dir(project_id: int) -> Path:
    p = project_dir(project_id) / "subtitles"
    p.mkdir(exist_ok=True)
    return p


def thumbnails_dir(project_id: int) -> Path:
    p = project_dir(project_id) / "thumbnails"
    p.mkdir(exist_ok=True)
    return p


def exports_dir(project_id: int) -> Path:
    p = project_dir(project_id) / "exports"
    p.mkdir(exist_ok=True)
    return p


def to_web_path(p: Path | str) -> str:
    """Convert an on-disk asset path into the URL served at /files."""
    p = Path(p)
    try:
        rel = p.resolve().relative_to(settings.data_dir.resolve())
    except ValueError:
        return str(p)
    return "/files/" + rel.as_posix()


def dir_size_bytes(p: Path) -> int:
    if not p.exists():
        return 0
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
