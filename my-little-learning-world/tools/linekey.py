"""Python twin of src/audio/keys.ts (must produce identical keys)."""
import re
def normalize(t):
    return re.sub(r'\s+', ' ', t).strip()
def line_key(text):
    s = normalize(text).lower()
    h1 = 0x811c9dc5
    h2 = (0x01000193 ^ len(s)) & 0xffffffff
    for i, ch in enumerate(s):
        c = ord(ch)
        h1 = ((h1 ^ c) * 0x01000193) & 0xffffffff
        h2 = ((h2 ^ (c * 31 + i)) * 0x01000193) & 0xffffffff
    return (format(h1, '08x') + format(h2, '08x'))[:12]
