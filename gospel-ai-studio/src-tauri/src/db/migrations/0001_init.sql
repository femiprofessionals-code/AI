-- Gospel AI Studio - initial schema (version 1)
-- All timestamps are UTC ISO-8601 strings (e.g. 2026-11-13T18:58:00Z).
-- All primary keys except revisions are UUID v4 strings so records can be
-- exported/merged later without collisions.

CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,              -- JSON-encoded value
    updated_at TEXT NOT NULL
);

CREATE TABLE projects (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN ('conversation', 'hypeman')),
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'in_progress', 'review', 'complete')),
    aspect_ratio  TEXT NOT NULL DEFAULT '16:9'
                  CHECK (aspect_ratio IN ('16:9', '9:16', '1:1')),
    folder_path   TEXT NOT NULL UNIQUE,     -- absolute path, outside install dir
    -- Hypeman-specific options (NULL for conversations)
    bpm           INTEGER CHECK (bpm IS NULL OR (bpm BETWEEN 40 AND 220)),
    target_seconds INTEGER CHECK (target_seconds IS NULL OR target_seconds > 0),
    music_media_id TEXT REFERENCES media_items(id) ON DELETE SET NULL,
    music_volume  REAL NOT NULL DEFAULT 0.35 CHECK (music_volume BETWEEN 0 AND 1),
    archived      INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX idx_projects_kind ON projects(kind, archived, updated_at DESC);

-- One live script per project. Content is also mirrored to script.txt in the
-- project folder so the user always has a plain-text copy.
CREATE TABLE scripts (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    content    TEXT NOT NULL DEFAULT '',
    word_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- Point-in-time snapshots (automatic every few minutes while editing, or manual).
CREATE TABLE script_revisions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    reason     TEXT NOT NULL CHECK (reason IN ('auto', 'manual', 'before_restore')),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_revisions_project ON script_revisions(project_id, created_at DESC);

-- Cast for Gospel Conversations.
CREATE TABLE speakers (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT '',
    color      TEXT NOT NULL DEFAULT '#c9a227',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE (project_id, name)
);

-- Global local media library (shared by all projects).
CREATE TABLE media_items (
    id             TEXT PRIMARY KEY,
    kind           TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
    title          TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    file_path      TEXT NOT NULL,          -- absolute path
    managed        INTEGER NOT NULL DEFAULT 1 CHECK (managed IN (0, 1)), -- 1 = copied into library
    file_size      INTEGER NOT NULL DEFAULT 0,
    duration_ms    INTEGER,
    width          INTEGER,
    height         INTEGER,
    has_audio      INTEGER NOT NULL DEFAULT 0 CHECK (has_audio IN (0, 1)),
    thumbnail_path TEXT,
    probe_status   TEXT NOT NULL DEFAULT 'pending'
                   CHECK (probe_status IN ('pending', 'ready', 'failed')),
    tags           TEXT NOT NULL DEFAULT '',   -- comma separated, lower-case
    created_at     TEXT NOT NULL
);
CREATE INDEX idx_media_kind ON media_items(kind, created_at DESC);

CREATE TABLE scenes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    script_text TEXT NOT NULL DEFAULT '',
    speaker_id  TEXT REFERENCES speakers(id) ON DELETE SET NULL,
    visual_media_id TEXT REFERENCES media_items(id) ON DELETE SET NULL,
    audio_media_id  TEXT REFERENCES media_items(id) ON DELETE SET NULL,
    duration_ms INTEGER NOT NULL DEFAULT 4000 CHECK (duration_ms BETWEEN 500 AND 600000),
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_scenes_project ON scenes(project_id, position);

-- Background render jobs (one runs at a time to protect modest hardware).
CREATE TABLE render_jobs (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    engine_id   TEXT NOT NULL,
    options     TEXT NOT NULL DEFAULT '{}',  -- JSON
    status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    progress    REAL NOT NULL DEFAULT 0,
    message     TEXT NOT NULL DEFAULT '',
    output_path TEXT,
    error       TEXT,
    created_at  TEXT NOT NULL,
    started_at  TEXT,
    finished_at TEXT
);
CREATE INDEX idx_jobs_project ON render_jobs(project_id, created_at DESC);
