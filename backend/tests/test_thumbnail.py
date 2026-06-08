from pathlib import Path

from app.services.thumbnail_service import thumbnail_service


def test_thumbnail_no_background(tmp_path: Path):
    out = tmp_path / "yt.png"
    thumbnail_service.render(
        title="Top 10 Facts About Honeybees",
        platform="youtube",
        background=None,
        out_path=out,
    )
    assert out.exists()
    assert out.stat().st_size > 1000


def test_thumbnail_facebook_size(tmp_path: Path):
    from PIL import Image
    out = tmp_path / "fb.png"
    thumbnail_service.render(
        title="A Title",
        platform="facebook",
        background=None,
        out_path=out,
    )
    with Image.open(out) as img:
        assert img.size == (1200, 630)
