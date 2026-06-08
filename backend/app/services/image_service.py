"""Local image generation.

Tries FLUX.1 Schnell first. If the model fails to load (typical on a 12 GB CPU
box) or runs out of memory, falls back to SDXL Turbo. Models are loaded lazily
and unloaded between batches to keep RAM headroom for the rest of the pipeline.
"""
from __future__ import annotations

import asyncio
import gc
import logging
from pathlib import Path
from typing import Any

from PIL import Image

from ..config import settings

log = logging.getLogger("studio.image")


STYLE_SUFFIX = {
    "realistic": "ultra realistic, natural lighting, 50mm photo",
    "documentary": "documentary photography, candid, natural light, photojournalism",
    "cinematic": "cinematic still, anamorphic, shallow depth of field, dramatic lighting, film grain",
    "photorealistic": "photorealistic, 8k, sharp focus, professional photography",
    "historical": "historical photograph, sepia tones, vintage, archival quality",
    "motivational": "epic dramatic lighting, golden hour, inspiring composition, cinematic",
}

NEGATIVE = "low quality, blurry, watermark, text, logo, ugly, deformed, extra fingers"


class ImageService:
    def __init__(self) -> None:
        self._pipe: Any = None
        self._loaded: str | None = None

    # ---------- public ----------

    async def generate(
        self,
        prompt: str,
        *,
        style: str,
        out_path: Path,
        seed: int | None = None,
    ) -> Path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        full = f"{prompt}, {STYLE_SUFFIX.get(style, '')}"
        try:
            await asyncio.to_thread(self._run, full, str(out_path), seed)
        except Exception as e:
            log.warning("primary image gen failed (%s); using placeholder", e)
            self._placeholder(out_path, prompt)
        return out_path

    def unload(self) -> None:
        self._pipe = None
        self._loaded = None
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    # ---------- internal ----------

    def _ensure_loaded(self) -> str:
        if self._pipe is not None and self._loaded:
            return self._loaded
        try:
            self._pipe = self._load_flux()
            self._loaded = "flux"
            return "flux"
        except Exception as e:
            log.warning("FLUX load failed (%s) — trying SDXL Turbo", e)
            self._pipe = self._load_sdxl()
            self._loaded = "sdxl"
            return "sdxl"

    def _load_flux(self):
        import torch
        from diffusers import FluxPipeline

        pipe = FluxPipeline.from_pretrained(
            settings.image_model_primary,
            torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        )
        pipe.enable_attention_slicing()
        if hasattr(pipe, "enable_sequential_cpu_offload"):
            try:
                pipe.enable_sequential_cpu_offload()
            except Exception:
                pass
        return pipe

    def _load_sdxl(self):
        import torch
        from diffusers import AutoPipelineForText2Image

        pipe = AutoPipelineForText2Image.from_pretrained(
            settings.image_model_fallback,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            variant="fp16" if torch.cuda.is_available() else None,
        )
        pipe.enable_attention_slicing()
        return pipe

    def _run(self, prompt: str, out_path: str, seed: int | None) -> None:
        import torch

        kind = self._ensure_loaded()
        gen = None
        if seed is not None:
            gen = torch.Generator().manual_seed(int(seed))

        if kind == "flux":
            image = self._pipe(
                prompt=prompt,
                width=settings.image_width,
                height=settings.image_height,
                num_inference_steps=settings.image_steps,
                guidance_scale=0.0,
                generator=gen,
            ).images[0]
        else:
            image = self._pipe(
                prompt=prompt,
                negative_prompt=NEGATIVE,
                width=settings.image_width,
                height=settings.image_height,
                num_inference_steps=max(2, min(8, settings.image_steps)),
                guidance_scale=0.0,
                generator=gen,
            ).images[0]
        image.save(out_path, format="PNG")

    def _placeholder(self, out_path: Path, prompt: str) -> None:
        """If the model fails completely, emit a solid color frame with the prompt as a caption.

        Keeps the rest of the pipeline runnable end-to-end so developers can verify
        the video-assembly path without GPU/large RAM. Not for production output.
        """
        from PIL import ImageDraw, ImageFont

        w, h = settings.image_width, settings.image_height
        img = Image.new("RGB", (w, h), (24, 24, 28))
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("arial.ttf", 36)
        except Exception:
            font = ImageFont.load_default()
        lines, line, max_chars = [], "", 40
        for word in prompt.split():
            if len(line) + len(word) > max_chars:
                lines.append(line)
                line = word
            else:
                line = (line + " " + word).strip()
        if line:
            lines.append(line)
        y = h // 2 - len(lines) * 20
        for ln in lines[:8]:
            draw.text((40, y), ln, fill=(220, 220, 230), font=font)
            y += 44
        img.save(out_path, format="PNG")


image_service = ImageService()
