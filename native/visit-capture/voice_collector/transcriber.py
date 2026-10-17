from __future__ import annotations

import argparse
import json
import select
import atexit
import logging
import shutil
import signal
import sqlite3
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path

from .config import load_config
from .database import connect


LOG = logging.getLogger("voice-transcriber")


def resolve_binary(value: str) -> str:
    found = shutil.which(value)
    if found:
        return found
    path = Path(value).expanduser()
    if path.is_file():
        return str(path)
    for prefix in (Path("/opt/homebrew/bin"), Path("/usr/local/bin")):
        candidate = prefix / value
        if candidate.is_file():
            return str(candidate)
    raise FileNotFoundError(f"Whisper binary not found: {value}")


def claim_next(db: sqlite3.Connection, maximum_attempts: int) -> sqlite3.Row | None:
    db.execute("BEGIN IMMEDIATE")
    row = db.execute(
        "SELECT * FROM clips WHERE transcription_status IN ('pending','failed') "
        "AND transcription_attempts < ? ORDER BY started_at LIMIT 1",
        (maximum_attempts,),
    ).fetchone()
    if not row:
        db.commit()
        return None
    db.execute(
        "UPDATE clips SET transcription_status='processing', "
        "transcription_attempts=transcription_attempts+1, transcription_error=NULL WHERE id=?",
        (row["id"],),
    )
    db.commit()
    return row


def transcribe(binary: str, model: Path, audio: Path, language: str, threads: int) -> str:
    if not audio.is_file():
        raise FileNotFoundError(f"Audio file missing: {audio}")
    with tempfile.TemporaryDirectory(prefix="voice-transcribe-") as tmp:
        tmp_path = Path(tmp)
        wav = tmp_path / "input.wav"
        ffmpeg = resolve_binary("ffmpeg")
        converted = subprocess.run(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(audio),
             "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)],
            capture_output=True, text=True, timeout=180,
        )
        if converted.returncode:
            raise RuntimeError(f"FFmpeg conversion failed: {converted.stderr.strip()}")
        output_prefix = tmp_path / "result"
        command = [binary, "-m", str(model), "-f", str(wav), "-l", language,
                   "-t", str(threads), "-otxt", "-of", str(output_prefix), "-nt", "-np"]
        result = subprocess.run(command, capture_output=True, text=True, timeout=600)
        output_file = output_prefix.with_suffix(".txt")
        if result.returncode or not output_file.exists():
            detail = (result.stderr or result.stdout).strip()[-2000:]
            raise RuntimeError(f"whisper-cli failed ({result.returncode}): {detail}")
        return " ".join(output_file.read_text(encoding="utf-8").split()).strip()


class QwenWorker:
    """Dedicated MLX interpreter, persistent model, bounded requests, no shell."""
    def __init__(self, cfg):
        self.cfg = cfg
        self.process = None
        if not Path(cfg.qwen_python).expanduser().is_file():
            raise FileNotFoundError("Qwen Python environment missing")
        if not (Path(cfg.qwen_model).expanduser() / "model.safetensors").is_file():
            raise FileNotFoundError("Local Qwen model weights missing")

    def close(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
                try: self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill(); self.process.wait(timeout=5)
            for pipe in (self.process.stdin, self.process.stdout):
                if pipe: pipe.close()
            self.process = None

    def transcribe(self, audio, language):
        if not audio.is_file():
            raise FileNotFoundError("Audio file missing")
        if self.process is None or self.process.poll() is not None:
            self.close()
            self.process = subprocess.Popen([
                str(Path(self.cfg.qwen_python).expanduser()), "-u",
                str(Path(__file__).with_name("qwen_worker.py")),
                "--model", str(Path(self.cfg.qwen_model).expanduser())],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        self.process.stdin.write(json.dumps({"audio":str(audio.resolve()),"language":language})+"\n")
        self.process.stdin.flush()
        if not select.select([self.process.stdout], [], [], self.cfg.timeout_seconds)[0]:
            self.close()
            raise TimeoutError("Qwen transcription timed out; worker reset")
        line = self.process.stdout.readline()
        if not line:
            self.close()
            raise RuntimeError("Qwen worker exited; see transcriber log")
        result = json.loads(line)
        if "error" in result:
            raise RuntimeError(result["error"])
        LOG.info("Qwen transcription seconds=%.3f", result["seconds"])
        return result["text"].strip()


def run(config_path: str | None) -> None:
    cfg = load_config(config_path)
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.FileHandler(cfg.data_dir / "transcriber.log"), logging.StreamHandler()])
    backend = cfg.transcription.backend
    if backend not in {"whisper", "qwen-asr"}:
        raise ValueError(f"Unknown transcription backend: {backend}")
    worker = None
    if backend == "qwen-asr":
        worker = QwenWorker(cfg.transcription)
        atexit.register(worker.close)
        binary, model = cfg.transcription.qwen_python, cfg.transcription.qwen_model
    else:
        binary = resolve_binary(cfg.transcription.binary)
        model = Path(cfg.transcription.model).expanduser().resolve()
        if not model.is_file():
            raise FileNotFoundError(f"Whisper model not found: {model}")
    db = connect(cfg.data_dir / "voice.db")
    # A previous forced shutdown may leave one item processing.
    db.execute("UPDATE clips SET transcription_status='pending' WHERE transcription_status='processing'")
    db.commit()
    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    LOG.info("Starting binary=%s model=%s", binary, model)
    while not stopping:
        db.execute("INSERT INTO heartbeat(service,updated_at,detail) VALUES('transcriber',datetime('now'),'running') "
                   "ON CONFLICT(service) DO UPDATE SET updated_at=excluded.updated_at,detail=excluded.detail")
        db.commit()
        row = claim_next(db, cfg.transcription.maximum_attempts)
        if not row:
            time.sleep(cfg.transcription.poll_seconds)
            continue
        try:
            text = (worker.transcribe(Path(row["audio_path"]), cfg.transcription.language)
                    if worker else transcribe(binary, model, Path(row["audio_path"]),
                                               cfg.transcription.language, cfg.transcription.threads))
            if not text.strip():
                db.execute("UPDATE clips SET transcript='',transcription_status='empty',transcription_error='未识别到可读文字，音频保留，可人工重试',enrichment_status='skipped' WHERE id=?",(row['id'],))
                db.commit();continue
            db.execute("UPDATE clips SET transcript=?,transcription_status='done',transcribed_at=?,"
                       "transcription_error=NULL,enrichment_status='pending',enrichment_attempts=0,"
                       "enrichment_error=NULL WHERE id=?",
                       (text, datetime.now().astimezone().isoformat(), row["id"]))
            db.commit()
            LOG.info("Transcribed clip=%s backend=%s characters=%s", row["id"], backend, len(text))
        except Exception as exc:
            db.execute("UPDATE clips SET transcription_status='failed',transcription_error=? WHERE id=?",
                       (str(exc)[:2000], row["id"]))
            db.commit()
            LOG.exception("Transcription failed clip=%s", row["id"])
            time.sleep(2)
    db.close()
    if worker:
        worker.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()
