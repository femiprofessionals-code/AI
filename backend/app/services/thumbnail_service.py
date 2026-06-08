"""Pillow-based thumbnail compositor."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

PLATFORM_SIZES = {
    "youtube": (1280, 720),
    "facebook": (1200, 630),
}


class ThumbnailService:
    def render(
        self,
        *,
        title: str,
        platform: str,
        background: str | Path | None,
        out_path: Path,
    ) -> Path:
        w, h = PLATFORM_SIZES.get(platform, (1280, 720))
        out_path.parent.mkdir(parents=True, exist_ok=True)

        if background and Path(background).exists():
            bg = Image.open(background).convert("RGB")
            bg = self._cover(bg, w, h)
            # Darken left side for legibility
            shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            sd = ImageDraw.Draw(shade)
            sd.rectangle([(0, 0), (int(w * 0.6), h)], fill=(0, 0, 0, 150))
            bg = Image.alpha_composite(bg.convert("RGBA"), shade).convert("RGB")
        else:
            bg = Image.new("RGB", (w, h), (15, 18, 34))

        draw = ImageDraw.Draw(bg)
        font = self._best_font(int(h * 0.11))
        wrapped = self._wrap(title.upper(), font, int(w * 0.55))
        line_h = font.size + 12
        y = (h - line_h * len(wrapped)) // 2
        for line in wrapped:
            # stroke for legibility
            for dx, dy in [(-3, 0), (3, 0), (0, -3), (0, 3)]:
                draw.text((60 + dx, y + dy), line, fill="black", font=font)
            draw.text((60, y), line, fill="white", font=font)
            y += line_h

        # Accent bar
        bar = Image.new("RGB", (12, int(h * 0.65)), (255, 75, 75))
        bg.paste(bar, (40, (h - bar.height) // 2))

        bg.save(out_path, format="PNG", optimize=True)
        return out_path

    def _cover(self, img: Image.Image, w: int, h: int) -> Image.Image:
        iw, ih = img.size
        scale = max(w / iw, h / ih)
        new = img.resize((int(iw * scale), int(ih * scale)), Image.LANCZOS)
        x = (new.width - w) // 2
        y = (new.height - h) // 2
        return new.crop((x, y, x + w, y + h)).filter(ImageFilter.SMOOTH)

    def _best_font(self, size: int) -> ImageFont.FreeTypeFont:
        for name in ("arialbd.ttf", "Arial Bold.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
            try:
                return ImageFont.truetype(name, size=size)
            except Exception:
                continue
        return ImageFont.load_default()

    def _wrap(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
        words = text.split()
        lines: list[str] = []
        cur = ""
        for w in words:
            trial = (cur + " " + w).strip()
            bbox = font.getbbox(trial)
            if (bbox[2] - bbox[0]) <= max_width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines or [text]


thumbnail_service = ThumbnailService()
