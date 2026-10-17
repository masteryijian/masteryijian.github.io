from datetime import datetime

import numpy as np

from voice_collector.database import connect, is_paused, set_paused
from voice_collector.segmenter import SpeechSegmenter
from voice_collector.transcriber import claim_next
from voice_collector.enricher import claim_next as claim_next_enrichment
from voice_collector.enricher import detect_todo, normalize_result, rebuild_links
from voice_collector.codex_runner import claim_next as claim_next_codex


def test_database_pause(tmp_path):
    db = connect(tmp_path / "voice.db")
    assert not is_paused(db)
    set_paused(db, True)
    assert is_paused(db)


def test_segmenter_emits_clip():
    seg = SpeechSegmenter(16000, 512, 500, 192, 1000, 500, 120, 0.55)
    now = datetime.now().astimezone()
    chunk = np.zeros(512, dtype=np.float32)
    result = None
    for _ in range(20):
        seg.feed(chunk, 0.9, now)
    for _ in range(40):
        result = seg.feed(chunk, 0.0, now) or result
    assert result is not None
    assert len(result.samples) >= 16000


def test_existing_database_migrates_and_claims(tmp_path):
    db = connect(tmp_path / "voice.db")
    db.execute("INSERT INTO clips(started_at,ended_at,duration_ms,audio_path,format,vad_peak) VALUES(?,?,?,?,?,?)",
               ("2026-01-01T00:00:00+00:00", "2026-01-01T00:00:01+00:00", 1000, "/tmp/a.opus", "opus", 0.9))
    db.commit()
    row = claim_next(db, 3)
    assert row is not None
    state = db.execute("SELECT transcription_status,transcription_attempts FROM clips WHERE id=?", (row["id"],)).fetchone()
    assert tuple(state) == ("processing", 1)


def test_enrichment_claim_and_normalize(tmp_path):
    db = connect(tmp_path / "voice.db")
    db.execute(
        "INSERT INTO clips(started_at,ended_at,duration_ms,audio_path,format,vad_peak,"
        "transcript,transcription_status) VALUES(?,?,?,?,?,?,?,?)",
        ("2026-01-01T00:00:00+00:00", "2026-01-01T00:00:01+00:00", 1000,
         "/tmp/a.opus", "opus", 0.9, "准备 Bruker 面试", "done"),
    )
    db.commit()
    row = claim_next_enrichment(db, 5)
    assert row is not None
    result = normalize_result({
        "title": "岗位准备", "summary": "准备面试", "category": "求职",
        "tags": ["Bruker", "面试"], "entities": ["Bruker"],
        "action_items": [{"task": "研究产品", "due_date": None}],
        "language": "zh", "importance": 9,
    })
    assert result["importance"] == 5
    assert result["action_items"][0]["task"] == "研究产品"


def test_related_clips_are_linked(tmp_path):
    db = connect(tmp_path / "voice.db")
    values = [
        ("2026-01-01T00:00:00+00:00", "/tmp/a.opus", '["Bruker","面试"]'),
        ("2026-01-02T00:00:00+00:00", "/tmp/b.opus", '["Bruker","仪器"]'),
    ]
    for started_at, path, tags in values:
        db.execute(
            "INSERT INTO clips(started_at,ended_at,duration_ms,audio_path,format,vad_peak,"
            "transcript,transcription_status,enrichment_status,category,tags_json,entities_json)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (started_at, started_at, 1000, path, "opus", 0.9, "test", "done", "done",
             "求职", tags, "[]"),
        )
    db.commit()
    rebuild_links(db, 1)
    link = db.execute("SELECT * FROM clip_links").fetchone()
    assert link is not None
    assert link["score"] > 0


def test_todo_requires_prefix():
    assert detect_todo("Todo 帮我整理Bruker的面试材料") == "帮我整理Bruker的面试材料"
    assert detect_todo("待办：制作一份报告") == "制作一份报告"
    assert detect_todo("我们讨论了Todo的用法") is None


def test_codex_only_claims_approved_tasks(tmp_path):
    db = connect(tmp_path / "voice.db")
    db.execute(
        "INSERT INTO agent_tasks(title,instruction,status) VALUES(?,?,?)",
        ("候选", "不要运行", "needs_approval"),
    )
    db.commit()
    assert claim_next_codex(db, 2) is None
    db.execute("UPDATE agent_tasks SET status='approved'")
    db.commit()
    task = claim_next_codex(db, 2)
    assert task is not None
    assert db.execute("SELECT status FROM agent_tasks").fetchone()[0] == "running"
