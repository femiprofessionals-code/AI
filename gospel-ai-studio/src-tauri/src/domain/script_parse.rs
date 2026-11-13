//! Deterministic script parsing (no AI). Turns a plain-text script into scene
//! "beats" that the scene manager can create.
//!
//! Conversation format:
//!   # Section heading          -> titles the following beats
//!   PASTOR JAMES: Grace is...  -> a speaker line (new beat)
//!   continuation text          -> appended to the current beat
//!   (camera slowly zooms)      -> direction, stored in the beat's notes
//!   <blank line>               -> ends the current beat
//!
//! Hypeman format: every non-empty line is its own beat; headings and
//! directions behave as above.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Beat {
    pub title: String,
    pub text: String,
    pub speaker: Option<String>,
    pub notes: String,
}

fn heading(line: &str) -> Option<&str> {
    line.strip_prefix('#')
        .map(|h| h.trim_start_matches('#').trim())
}

fn direction(line: &str) -> Option<&str> {
    if line.len() >= 2 && line.starts_with('(') && line.ends_with(')') {
        Some(line[1..line.len() - 1].trim())
    } else {
        None
    }
}

/// Recognises `NAME: text`. Names are 1-4 words of letters/digits/.'- and
/// must start with a letter; this avoids matching times ("10:30") or URLs.
pub fn speaker_line(line: &str) -> Option<(String, String)> {
    let idx = line.find(':')?;
    if idx == 0 || idx > 40 {
        return None;
    }
    let name = line[..idx].trim();
    let rest = &line[idx + 1..];
    // "10:30", "https://", "John 3:16" are not speaker lines.
    if rest.starts_with("//") || rest.starts_with(|c: char| c.is_ascii_digit()) {
        return None;
    }
    let first = name.chars().next()?;
    if !first.is_alphabetic() {
        return None;
    }
    if name.split_whitespace().count() > 4 {
        return None;
    }
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == ' ' || c == '.' || c == '\'' || c == '-')
    {
        return None;
    }
    Some((name.to_string(), rest.trim().to_string()))
}

fn snippet(text: &str, words: usize) -> String {
    let parts: Vec<&str> = text.split_whitespace().collect();
    let mut s = parts
        .iter()
        .take(words)
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");
    if parts.len() > words {
        s.push('…');
    }
    s
}

fn finish(
    beats: &mut Vec<Beat>,
    cur: &mut Option<Beat>,
    section: &Option<String>,
    section_used: &mut bool,
) {
    if let Some(mut b) = cur.take() {
        if b.text.trim().is_empty() && b.notes.is_empty() {
            return;
        }
        let body = snippet(&b.text, 6);
        b.title = match (&b.speaker, section, *section_used) {
            (_, Some(sec), false) => sec.clone(),
            (Some(sp), _, _) => format!("{sp}: {body}"),
            (None, _, _) => body,
        };
        if section.is_some() {
            *section_used = true;
        }
        if b.title.is_empty() {
            b.title = "Untitled scene".into();
        }
        beats.push(b);
    }
}

fn empty_beat(speaker: Option<String>, text: String, notes: &mut String) -> Beat {
    Beat {
        title: String::new(),
        text,
        speaker,
        notes: std::mem::take(notes),
    }
}

pub fn parse_conversation(content: &str) -> Vec<Beat> {
    let mut beats = Vec::new();
    let mut cur: Option<Beat> = None;
    let mut section: Option<String> = None;
    let mut section_used = false;
    let mut pending_notes = String::new();

    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() {
            finish(&mut beats, &mut cur, &section, &mut section_used);
            continue;
        }
        if let Some(h) = heading(line) {
            finish(&mut beats, &mut cur, &section, &mut section_used);
            section = if h.is_empty() {
                None
            } else {
                Some(h.to_string())
            };
            section_used = false;
            continue;
        }
        if let Some(d) = direction(line) {
            match cur.as_mut() {
                Some(b) => push_line(&mut b.notes, d),
                None => push_line(&mut pending_notes, d),
            }
            continue;
        }
        if let Some((name, text)) = speaker_line(line) {
            finish(&mut beats, &mut cur, &section, &mut section_used);
            cur = Some(empty_beat(Some(name), text, &mut pending_notes));
            continue;
        }
        match cur.as_mut() {
            Some(b) => push_text(&mut b.text, line),
            None => cur = Some(empty_beat(None, line.to_string(), &mut pending_notes)),
        }
    }
    finish(&mut beats, &mut cur, &section, &mut section_used);
    beats
}

pub fn parse_hypeman(content: &str) -> Vec<Beat> {
    let mut beats = Vec::new();
    let mut section: Option<String> = None;
    let mut section_used = false;
    let mut pending_notes = String::new();
    let mut cur: Option<Beat> = None;

    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(h) = heading(line) {
            finish(&mut beats, &mut cur, &section, &mut section_used);
            section = if h.is_empty() {
                None
            } else {
                Some(h.to_string())
            };
            section_used = false;
            continue;
        }
        if let Some(d) = direction(line) {
            match cur.as_mut() {
                Some(b) => push_line(&mut b.notes, d),
                None => push_line(&mut pending_notes, d),
            }
            continue;
        }
        finish(&mut beats, &mut cur, &section, &mut section_used);
        let (speaker, text) = match speaker_line(line) {
            Some((n, t)) if !t.is_empty() => (Some(n), t),
            _ => (None, line.to_string()),
        };
        cur = Some(empty_beat(speaker, text, &mut pending_notes));
    }
    finish(&mut beats, &mut cur, &section, &mut section_used);
    beats
}

fn push_line(buf: &mut String, s: &str) {
    if !buf.is_empty() {
        buf.push('\n');
    }
    buf.push_str(s);
}

fn push_text(buf: &mut String, s: &str) {
    if !buf.is_empty() {
        buf.push(' ');
    }
    buf.push_str(s);
}

/// Spoken-duration estimate, rounded to 100 ms, never below 1.5 s.
pub fn estimate_ms(text: &str, wpm: i64) -> i64 {
    let words = crate::util::count_words(text);
    let wpm = wpm.max(1);
    let ms = words * 60_000 / wpm;
    ((ms + 50) / 100 * 100).max(1500)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversation_beats() {
        let src = "# Opening\n(wide shot)\nPASTOR JAMES: Grace is not earned.\nIt is received.\n\nYOUNG MAN: But what about my past?\nMeeting at 10:30 tomorrow\n\nThe end narration.";
        let b = parse_conversation(src);
        assert_eq!(b.len(), 3);
        assert_eq!(b[0].speaker.as_deref(), Some("PASTOR JAMES"));
        assert_eq!(b[0].text, "Grace is not earned. It is received.");
        assert_eq!(b[0].title, "Opening");
        assert_eq!(b[0].notes, "wide shot");
        assert_eq!(b[1].speaker.as_deref(), Some("YOUNG MAN"));
        assert!(b[1].text.ends_with("10:30 tomorrow"));
        assert!(b[1].title.starts_with("YOUNG MAN: But what"));
        assert_eq!(b[2].speaker, None);
    }

    #[test]
    fn speaker_detection_edge_cases() {
        assert!(speaker_line("10:30 is the time").is_none());
        assert!(speaker_line("https://example.org").is_none());
        assert!(speaker_line("John 3:16 says God so loved").is_none());
        assert!(speaker_line("this is a very long sentence that: has a colon").is_none());
        assert_eq!(speaker_line("Mary: Hi").unwrap().0, "Mary");
    }

    #[test]
    fn hypeman_beats() {
        let src = "# Intro\nAre you READY?\n(drop)\nJesus is ALIVE!\n\nSay amen!";
        let b = parse_hypeman(src);
        assert_eq!(b.len(), 3);
        assert_eq!(b[0].title, "Intro");
        assert_eq!(b[0].notes, "drop");
        assert_eq!(b[2].text, "Say amen!");
    }

    #[test]
    fn estimates() {
        assert_eq!(estimate_ms("one two", 150), 1500);
        assert_eq!(estimate_ms(&"word ".repeat(150), 150), 60_000);
    }
}
