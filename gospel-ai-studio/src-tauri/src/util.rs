use std::path::Path;

pub fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Folder-safe slug: ascii letters/digits separated by single dashes, max 48 chars.
pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
        if out.len() >= 48 {
            break;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "untitled".into()
    } else {
        trimmed
    }
}

pub fn count_words(text: &str) -> i64 {
    text.split_whitespace()
        .filter(|w| w.chars().any(|c| c.is_alphanumeric()))
        .count() as i64
}

/// Write a file atomically (write temp + rename) so a crash never leaves half a file.
pub fn write_atomic(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp-write");
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, path)
}

/// True if `child` is inside `parent` (after canonicalisation when possible).
pub fn is_within(child: &Path, parent: &Path) -> bool {
    let c = dunce_canon(child);
    let p = dunce_canon(parent);
    c.starts_with(&p)
}

fn dunce_canon(p: &Path) -> std::path::PathBuf {
    let canon = std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    // Strip the Windows verbatim prefix (\\?\) so comparisons stay consistent.
    let s = canon.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        std::path::PathBuf::from(rest)
    } else {
        canon
    }
}

pub fn strip_verbatim(p: std::path::PathBuf) -> std::path::PathBuf {
    dunce_canon(&p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_basic() {
        assert_eq!(slugify("Grace & Truth: Part 1!"), "grace-truth-part-1");
        assert_eq!(slugify("   "), "untitled");
        assert_eq!(slugify("Àmén"), "m-n");
    }

    #[test]
    fn words() {
        assert_eq!(count_words("PASTOR: Grace is   free -- amen!"), 5);
        assert_eq!(count_words(""), 0);
    }
}
