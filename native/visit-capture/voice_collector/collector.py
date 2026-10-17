from __future__ import annotations

import argparse
import logging
import queue
import signal
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import sounddevice as sd
import torch
from silero_vad import load_silero_vad

from .config import load_config
from .database import connect, is_paused
from .segmenter import SpeechSegmenter
from .storage import ClipStorage


LOG = logging.getLogger("voice-collector")
CHUNK_SAMPLES = 512


def prune_processed_audio(db: sqlite3.Connection, cfg, storage: ClipStorage) -> tuple[int, int]:
    """Delete only durable, fully processed audio while preserving database rows."""
    if not cfg.storage.auto_prune:
        return 0, 0
    rows = db.execute(
        "SELECT id,audio_path,started_at FROM clips WHERE transcription_status='done' "
        "AND enrichment_status='done' AND audio_status='active' "
        "AND coalesce(importance,1)<? ORDER BY started_at",
        (cfg.enrichment.important_threshold,),
    ).fetchall()
    cutoff = datetime.now().astimezone() - timedelta(days=cfg.storage.retention_days)
    total = storage.usage_bytes()
    limit = int(cfg.storage.maximum_disk_gb * 1024**3)
    deleted = freed = 0
    for row in rows:
        try:
            started = datetime.fromisoformat(row["started_at"])
        except ValueError:
            started = datetime.now().astimezone()
        should_delete = started < cutoff or total > limit
        if not should_delete:
            continue
        path = Path(row["audio_path"])
        size = path.stat().st_size if path.is_file() else 0
        if path.is_file() and cfg.data_dir in path.resolve().parents:
            path.unlink()
        db.execute("UPDATE clips SET audio_status='deleted' WHERE id=?", (row["id"],))
        total -= size
        freed += size
        deleted += 1
    db.commit()
    return deleted, freed


def list_devices() -> None:
    print(sd.query_devices())


def run(config_path: str | None) -> None:
    cfg = load_config(config_path)
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.FileHandler(cfg.data_dir / "collector.log"), logging.StreamHandler()])
    db = connect(cfg.data_dir / "voice.db")
    storage = ClipStorage(cfg.data_dir, cfg.audio.sample_rate, cfg.storage.format)
    model = load_silero_vad(onnx=True)
    segmenter = SpeechSegmenter(cfg.audio.sample_rate, CHUNK_SAMPLES, cfg.audio.pre_roll_ms,
                                cfg.audio.speech_start_ms, cfg.audio.silence_stop_ms,
                                cfg.audio.minimum_clip_ms, cfg.audio.maximum_clip_seconds,
                                cfg.audio.vad_threshold)
    chunks: queue.Queue[np.ndarray] = queue.Queue(maxsize=256)
    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        stopping = True

    def callback(indata: np.ndarray, frames: int, timing: object, status: sd.CallbackFlags) -> None:
        if status:
            LOG.warning("Audio callback: %s", status)
        try:
            chunks.put_nowait(indata[:, 0].copy())
        except queue.Full:
            LOG.error("Audio queue full; dropping a chunk")

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    device = cfg.audio.device
    LOG.info("Starting microphone=%r sample_rate=%s", device, cfg.audio.sample_rate)
    last_heartbeat = last_prune = 0.0
    with sd.InputStream(device=device, channels=1, samplerate=cfg.audio.sample_rate,
                        dtype="float32", blocksize=CHUNK_SAMPLES, callback=callback):
        while not stopping:
            try:
                chunk = chunks.get(timeout=1)
            except queue.Empty:
                chunk = None
            now_ts = time.monotonic()
            if now_ts - last_heartbeat > 10:
                db.execute("INSERT INTO heartbeat(service,updated_at,detail) VALUES('collector',datetime('now'),'running') "
                           "ON CONFLICT(service) DO UPDATE SET updated_at=excluded.updated_at,detail=excluded.detail")
                db.commit()
                last_heartbeat = now_ts
            if now_ts - last_prune > 3600:
                deleted, freed = prune_processed_audio(db, cfg, storage)
                if deleted:
                    LOG.info("Pruned %s processed audio files, freed %.1f MB",
                             deleted, freed / 1048576)
                elif storage.usage_bytes() > cfg.storage.maximum_disk_gb * 1024**3:
                    LOG.warning("Disk limit exceeded, but no safely processed audio can be deleted")
                last_prune = now_ts
            if chunk is None:
                continue
            if is_paused(db):
                segmenter.reset()
                continue
            # silero-vad's ONNX wrapper still validates a torch.Tensor input.
            # from_numpy is zero-copy for this contiguous float32 audio chunk.
            probability = float(model(torch.from_numpy(chunk), cfg.audio.sample_rate).item())
            clip = segmenter.feed(chunk, probability, datetime.now().astimezone())
            if clip:
                path = storage.save(clip.samples, clip.started_at)
                duration_ms = round(len(clip.samples) / cfg.audio.sample_rate * 1000)
                db.execute("INSERT INTO clips(started_at,ended_at,duration_ms,audio_path,format,vad_peak,device_name) "
                           "VALUES(?,?,?,?,?,?,?)", (clip.started_at.isoformat(), clip.ended_at.isoformat(),
                           duration_ms, str(path), path.suffix.lstrip('.'), clip.vad_peak, str(device or 'default')))
                db.commit()
                LOG.info("Saved %s (%0.1fs)", path, duration_ms / 1000)
    db.close()
    LOG.info("Stopped")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    parser.add_argument("--list-devices", action="store_true")
    args = parser.parse_args()
    if args.list_devices:
        list_devices()
    else:
        run(args.config)


if __name__ == "__main__":
    main()
