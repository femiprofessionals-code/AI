"""Settings get/set. Persists tunables in the SettingKV table."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_session
from ..models import SettingKV
from ..schemas import SettingsOut, SettingsUpdate

router = APIRouter()


async def _get_kv(s: AsyncSession, key: str, default: str) -> str:
    row = await s.get(SettingKV, key)
    return row.value if row else default


async def _set_kv(s: AsyncSession, key: str, value: str) -> None:
    row = await s.get(SettingKV, key)
    if row:
        row.value = value
    else:
        s.add(SettingKV(key=key, value=value))


@router.get("", response_model=SettingsOut)
async def get_settings(s: AsyncSession = Depends(get_session)) -> SettingsOut:
    return SettingsOut(
        ollama_model=await _get_kv(s, "ollama_model", settings.ollama_model),
        image_model=await _get_kv(s, "image_model", settings.image_model_primary),
        image_width=int(await _get_kv(s, "image_width", str(settings.image_width))),
        image_height=int(await _get_kv(s, "image_height", str(settings.image_height))),
        video_fps=int(await _get_kv(s, "video_fps", str(settings.video_fps))),
        video_width=settings.video_width,
        video_height=settings.video_height,
        projects_dir=str(settings.projects_dir),
        models_dir=str(settings.models_dir),
    )


@router.patch("", response_model=SettingsOut)
async def update_settings(body: SettingsUpdate, s: AsyncSession = Depends(get_session)) -> SettingsOut:
    if body.ollama_model is not None:
        await _set_kv(s, "ollama_model", body.ollama_model)
    if body.image_width is not None:
        await _set_kv(s, "image_width", str(body.image_width))
    if body.image_height is not None:
        await _set_kv(s, "image_height", str(body.image_height))
    if body.video_fps is not None:
        await _set_kv(s, "video_fps", str(body.video_fps))
    await s.commit()
    return await get_settings(s)
