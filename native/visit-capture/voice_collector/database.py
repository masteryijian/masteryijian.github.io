from __future__ import annotations

import sqlite3
from pathlib import Path


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
CREATE TABLE IF NOT EXISTS clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  audio_path TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,
  vad_peak REAL NOT NULL,
  device_name TEXT,
  transcript TEXT,
  transcription_status TEXT NOT NULL DEFAULT 'pending',
  transcription_attempts INTEGER NOT NULL DEFAULT 0,
  transcription_error TEXT,
  transcribed_at TEXT,
  enrichment_status TEXT NOT NULL DEFAULT 'pending',
  enrichment_attempts INTEGER NOT NULL DEFAULT 0,
  enrichment_error TEXT,
  enriched_at TEXT,
  enrichment_model TEXT,
  title TEXT,
  summary TEXT,
  category TEXT,
  tags_json TEXT,
  entities_json TEXT,
  action_items_json TEXT,
  language TEXT,
  importance INTEGER,
  audio_status TEXT NOT NULL DEFAULT 'active',
  quarantined_at TEXT,
  original_audio_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS clips_started_at_idx ON clips(started_at DESC);
CREATE TABLE IF NOT EXISTS clip_links (
  source_clip_id INTEGER NOT NULL,
  target_clip_id INTEGER NOT NULL,
  score REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(source_clip_id, target_clip_id),
  FOREIGN KEY(source_clip_id) REFERENCES clips(id) ON DELETE CASCADE,
  FOREIGN KEY(target_clip_id) REFERENCES clips(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key, value) VALUES ('paused', '0');
CREATE TABLE IF NOT EXISTS heartbeat (
  service TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS service_processes (
  service TEXT PRIMARY KEY,
  pid INTEGER,
  state TEXT NOT NULL,
  restart_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  stopped_at TEXT,
  last_exit_code INTEGER,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clip_id INTEGER,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_approval',
  attempts INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  output_path TEXT,
  result_text TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(clip_id),
  FOREIGN KEY(clip_id) REFERENCES clips(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON agent_tasks(status);
CREATE TABLE IF NOT EXISTS control_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
"""


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    # Existing installations need additive migrations because CREATE TABLE IF
    # NOT EXISTS does not add newly introduced columns.
    columns = {row[1] for row in db.execute("PRAGMA table_info(clips)")}
    migrations = {
        "transcript": "ALTER TABLE clips ADD COLUMN transcript TEXT",
        "transcription_status": "ALTER TABLE clips ADD COLUMN transcription_status TEXT NOT NULL DEFAULT 'pending'",
        "transcription_attempts": "ALTER TABLE clips ADD COLUMN transcription_attempts INTEGER NOT NULL DEFAULT 0",
        "transcription_error": "ALTER TABLE clips ADD COLUMN transcription_error TEXT",
        "transcribed_at": "ALTER TABLE clips ADD COLUMN transcribed_at TEXT",
        "enrichment_status": "ALTER TABLE clips ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending'",
        "enrichment_attempts": "ALTER TABLE clips ADD COLUMN enrichment_attempts INTEGER NOT NULL DEFAULT 0",
        "enrichment_error": "ALTER TABLE clips ADD COLUMN enrichment_error TEXT",
        "enriched_at": "ALTER TABLE clips ADD COLUMN enriched_at TEXT",
        "enrichment_model": "ALTER TABLE clips ADD COLUMN enrichment_model TEXT",
        "title": "ALTER TABLE clips ADD COLUMN title TEXT",
        "summary": "ALTER TABLE clips ADD COLUMN summary TEXT",
        "category": "ALTER TABLE clips ADD COLUMN category TEXT",
        "tags_json": "ALTER TABLE clips ADD COLUMN tags_json TEXT",
        "entities_json": "ALTER TABLE clips ADD COLUMN entities_json TEXT",
        "action_items_json": "ALTER TABLE clips ADD COLUMN action_items_json TEXT",
        "language": "ALTER TABLE clips ADD COLUMN language TEXT",
        "importance": "ALTER TABLE clips ADD COLUMN importance INTEGER",
        "audio_status": "ALTER TABLE clips ADD COLUMN audio_status TEXT NOT NULL DEFAULT 'active'",
        "quarantined_at": "ALTER TABLE clips ADD COLUMN quarantined_at TEXT",
        "original_audio_path": "ALTER TABLE clips ADD COLUMN original_audio_path TEXT",
    }
    for name, sql in migrations.items():
        if name not in columns:
            db.execute(sql)
    db.execute("CREATE INDEX IF NOT EXISTS clips_enrichment_status_idx ON clips(enrichment_status)")
    db.commit()
    return db


def is_paused(db: sqlite3.Connection) -> bool:
    row = db.execute("SELECT value FROM settings WHERE key='paused'").fetchone()
    return bool(row and row[0] == "1")


def set_paused(db: sqlite3.Connection, paused: bool) -> None:
    db.execute(
        "INSERT INTO settings(key,value) VALUES('paused',?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ("1" if paused else "0",),
    )
    db.commit()
