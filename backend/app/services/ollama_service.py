"""Ollama client + prompt templates for script and scene generation.

We talk to Ollama over its HTTP API. The model is expected to be pulled
via `ollama pull llama3.1:8b-instruct-q4_K_M` (see scripts/setup_models.bat).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

import httpx

from ..config import settings

log = logging.getLogger("studio.ollama")


@dataclass
class ScriptParts:
    hook: str
    body: str
    cta: str
    raw: str


@dataclass
class SceneSpec:
    narration: str
    image_prompt: str
    duration_sec: float


SCRIPT_SYSTEM = (
    "You are a senior YouTube/Facebook scriptwriter for faceless videos. "
    "You write tight, vivid, conversational scripts in plain spoken English. "
    "You output exactly three sections: HOOK, BODY, CTA. No headers besides those three words."
)

SCRIPT_USER_TEMPLATE = """\
Topic: {topic}
Target length: ~{seconds} seconds of narration ({words} words).
Tone: {tone}

Write the script. Format:

HOOK:
<1-2 sentences, attention-grabbing>

BODY:
<the main content; no headings, no bullet points, no stage directions>

CTA:
<one short closing call-to-action>
"""

SCENES_SYSTEM = (
    "You are a senior video director. Given a narration script, you split it into scenes. "
    "For each scene you produce: the narration line, an image prompt that matches it, and a duration. "
    "You return STRICT JSON only — no prose, no markdown fences."
)

SCENES_USER_TEMPLATE = """\
SCRIPT:
\"\"\"
{script}
\"\"\"

Style: {style}
Target average scene duration: {avg} seconds

Return a JSON array of objects with keys: "narration", "image_prompt", "duration_sec".
- narration: the spoken line for the scene, taken from the script.
- image_prompt: a vivid, specific visual description; include lighting, composition, mood, lens; do NOT mention text or watermarks. Match the requested style.
- duration_sec: a number between 3 and 9.

Constraints:
- 6 to 18 scenes total.
- Cover the entire script.
- Output ONLY the JSON array.
"""


async def _chat(prompt: str, system: str, *, json_mode: bool = False) -> str:
    body: dict = {
        "model": settings.ollama_model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "options": {"temperature": 0.7, "num_ctx": 4096},
    }
    if json_mode:
        body["format"] = "json"

    async with httpx.AsyncClient(timeout=settings.ollama_timeout_s) as c:
        r = await c.post(f"{settings.ollama_host}/api/chat", json=body)
        r.raise_for_status()
        data = r.json()
        return data["message"]["content"].strip()


def _split_sections(raw: str) -> ScriptParts:
    text = raw.replace("\r\n", "\n")
    sections = {"HOOK": "", "BODY": "", "CTA": ""}
    pattern = re.compile(r"^(HOOK|BODY|CTA)\s*:\s*$", re.MULTILINE | re.IGNORECASE)
    matches = list(pattern.finditer(text))
    if not matches:
        # Fallback: whole thing is the body
        return ScriptParts(hook="", body=text.strip(), cta="", raw=raw)
    for i, m in enumerate(matches):
        key = m.group(1).upper()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections[key] = text[start:end].strip()
    return ScriptParts(
        hook=sections["HOOK"],
        body=sections["BODY"],
        cta=sections["CTA"],
        raw=raw,
    )


async def generate_script(topic: str, target_seconds: int, tone: str) -> ScriptParts:
    # ~150 spoken words per minute
    words = max(40, int(target_seconds * 150 / 60))
    prompt = SCRIPT_USER_TEMPLATE.format(topic=topic, seconds=target_seconds, words=words, tone=tone)
    raw = await _chat(prompt, SCRIPT_SYSTEM)
    return _split_sections(raw)


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
    return s.strip()


async def generate_scenes(script_text: str, style: str, avg_seconds: float) -> list[SceneSpec]:
    prompt = SCENES_USER_TEMPLATE.format(script=script_text, style=style, avg=avg_seconds)
    raw = await _chat(prompt, SCENES_SYSTEM, json_mode=True)
    raw = _strip_code_fence(raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Sometimes the model wraps the array in {"scenes": [...]}
        try:
            wrapped = json.loads(raw)
            data = wrapped.get("scenes") or next(iter(wrapped.values()))
        except Exception:
            log.warning("scene JSON parse failed; using fallback split")
            return _fallback_scenes(script_text, style, avg_seconds)

    out: list[SceneSpec] = []
    for item in data:
        try:
            out.append(
                SceneSpec(
                    narration=str(item["narration"]).strip(),
                    image_prompt=str(item["image_prompt"]).strip(),
                    duration_sec=float(item.get("duration_sec", avg_seconds)),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    if not out:
        return _fallback_scenes(script_text, style, avg_seconds)
    return out


def _fallback_scenes(script_text: str, style: str, avg_seconds: float) -> list[SceneSpec]:
    """Deterministic split when the LLM JSON is unusable — keeps the pipeline runnable."""
    sentences = re.split(r"(?<=[.!?])\s+", script_text.strip())
    sentences = [s for s in sentences if s]
    return [
        SceneSpec(
            narration=s,
            image_prompt=f"{style} scene: {s}",
            duration_sec=avg_seconds,
        )
        for s in sentences[:18]
    ]
