"""Maintenance endpoints — unload heavy models to free RAM."""
from __future__ import annotations

from fastapi import APIRouter

from ..services.image_service import image_service

router = APIRouter()


@router.post("/unload")
async def unload_models() -> dict:
    image_service.unload()
    return {"ok": True}
