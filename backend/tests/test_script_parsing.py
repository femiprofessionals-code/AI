from app.services.ollama_service import _split_sections


def test_split_sections_standard():
    raw = (
        "HOOK:\nDid you know honeybees beat their wings 230 times per second?\n\n"
        "BODY:\nBees collect nectar, store it in their honey stomach...\n\n"
        "CTA:\nLike and subscribe for more.\n"
    )
    parts = _split_sections(raw)
    assert "230 times" in parts.hook
    assert "nectar" in parts.body
    assert "subscribe" in parts.cta


def test_split_sections_missing_headers_falls_back_to_body():
    raw = "Just a paragraph with no headers."
    parts = _split_sections(raw)
    assert parts.body.startswith("Just")
    assert parts.hook == ""
    assert parts.cta == ""
