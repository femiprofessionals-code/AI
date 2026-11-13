// Client-side script statistics. The speaker-line rules match the Rust
// parser in src-tauri/src/domain/script_parse.rs.

export interface ScriptStats {
  words: number;
  lines: number;
  estimatedMs: number;
  speakers: { name: string; lines: number; words: number }[];
  beats: number;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function speakerLine(line: string): { name: string; text: string } | null {
  const idx = line.indexOf(":");
  if (idx <= 0 || idx > 40) return null;
  const name = line.slice(0, idx).trim();
  const rest = line.slice(idx + 1);
  if (rest.startsWith("//") || /^\d/.test(rest)) return null;
  if (!/^\p{L}/u.test(name)) return null;
  if (name.split(/\s+/).filter(Boolean).length > 4) return null;
  if (!/^[\p{L}\p{N} .'-]+$/u.test(name)) return null;
  return { name, text: rest.trim() };
}

const isHeading = (l: string) => l.startsWith("#");
const isDirection = (l: string) => l.length >= 2 && l.startsWith("(") && l.endsWith(")");

export function scriptStats(content: string, kind: "conversation" | "hypeman", wpm: number): ScriptStats {
  const lines = content.split(/\r?\n/);
  const speakers = new Map<string, { name: string; lines: number; words: number }>();
  let spoken = 0;
  let beats = 0;
  let inBeat = false;
  let current: { name: string; lines: number; words: number } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      inBeat = false;
      current = null;
      continue;
    }
    if (isHeading(line)) {
      inBeat = false;
      current = null;
      continue;
    }
    if (isDirection(line)) continue;
    const sp = speakerLine(line);
    const words = countWords(sp ? sp.text : line);
    spoken += words;
    if (kind === "hypeman") {
      beats += 1;
      continue;
    }
    if (sp) {
      beats += 1;
      inBeat = true;
      const key = sp.name.toLowerCase();
      current = speakers.get(key) ?? { name: sp.name, lines: 0, words: 0 };
      current.lines += 1;
      current.words += words;
      speakers.set(key, current);
    } else {
      if (!inBeat) {
        beats += 1;
        inBeat = true;
      }
      if (current) current.words += words;
    }
  }
  return {
    words: countWords(content),
    lines: lines.filter((l) => l.trim()).length,
    estimatedMs: Math.round((spoken / Math.max(1, wpm)) * 60000),
    speakers: [...speakers.values()].sort((a, b) => b.lines - a.lines),
    beats,
  };
}
