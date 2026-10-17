from __future__ import annotations

import argparse
import fcntl
import json
import logging
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .config import load_config
from .database import connect


LOG = logging.getLogger("voice-supervisor")


@dataclass
class ManagedService:
    name: str
    module: str
    process: subprocess.Popen | None = None
    restart_count: int = 0
    failures: int = 0
    next_start: float = 0.0
    started_monotonic: float = 0.0


def now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def acquire_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("w")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise RuntimeError("Voice Collector supervisor is already running")
    handle.write(str(os.getpid()))
    handle.flush()
    return handle


def update_service(db, service: ManagedService, state: str, *, exit_code=None, error=None) -> None:
    pid = service.process.pid if service.process and service.process.poll() is None else None
    db.execute(
        "INSERT INTO service_processes(service,pid,state,restart_count,started_at,stopped_at,last_exit_code,last_error,updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(service) DO UPDATE SET "
        "pid=excluded.pid,state=excluded.state,restart_count=excluded.restart_count,"
        "started_at=CASE WHEN service_processes.pid IS NOT excluded.pid AND excluded.state='running' "
        "THEN excluded.started_at ELSE service_processes.started_at END,"
        "stopped_at=excluded.stopped_at,last_exit_code=excluded.last_exit_code,"
        "last_error=excluded.last_error,updated_at=excluded.updated_at",
        (service.name, pid, state, service.restart_count,
         now_iso() if state == "running" else None,
         now_iso() if state in {"stopped", "backoff", "failed"} else None,
         exit_code, error, now_iso()),
    )
    db.commit()


def start_service(db, service: ManagedService, config_path: str | None) -> None:
    args = [sys.executable, "-m", service.module]
    if config_path:
        args += ["--config", config_path]
    try:
        service.process = subprocess.Popen(args, start_new_session=True)
        service.started_monotonic = time.monotonic()
        service.next_start = 0
        update_service(db, service, "running")
        LOG.info("Started %s pid=%s", service.name, service.process.pid)
    except Exception as exc:
        service.process = None
        service.failures += 1
        service.restart_count += 1
        service.next_start = time.monotonic() + min(60, 2 ** min(service.failures, 5))
        update_service(db, service, "backoff", error=str(exc))
        LOG.exception("Could not start %s", service.name)


def stop_service(db, service: ManagedService) -> None:
    process = service.process
    if not process or process.poll() is not None:
        update_service(db, service, "stopped", exit_code=process.returncode if process else None)
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    update_service(db, service, "stopped", exit_code=process.returncode)
    LOG.info("Stopped %s", service.name)


def process_control_commands(db, services: list[ManagedService],
                             config_path: str | None) -> None:
    command = db.execute(
        "SELECT * FROM control_commands WHERE status='pending' ORDER BY id LIMIT 1"
    ).fetchone()
    if not command:
        return
    db.execute("UPDATE control_commands SET status='running' WHERE id=?", (command["id"],))
    db.commit()
    try:
        selected = services if command["target"] == "all" else [
            service for service in services if service.name == command["target"]
        ]
        if not selected:
            raise ValueError(f"Unknown or disabled service: {command['target']}")
        for service in selected:
            stop_service(db, service)
            service.process = None
            service.failures = 0
            service.next_start = 0
            service.restart_count += 1
            start_service(db, service, config_path)
        db.execute(
            "UPDATE control_commands SET status='completed',completed_at=? WHERE id=?",
            (now_iso(), command["id"]),
        )
        db.commit()
    except Exception as exc:
        db.execute(
            "UPDATE control_commands SET status='failed',error=?,completed_at=? WHERE id=?",
            (str(exc)[:2000], now_iso(), command["id"]),
        )
        db.commit()
        LOG.exception("Control command failed id=%s", command["id"])


def ensure_lmstudio_server(cfg) -> None:
    if not cfg.enrichment.enabled or not cfg.enrichment.auto_start_server:
        return
    url = cfg.enrichment.base_url.rstrip("/") + "/models"
    try:
        with urllib.request.urlopen(url, timeout=3):
            return
    except Exception:
        pass
    binary = shutil.which(cfg.enrichment.lms_binary)
    if not binary:
        for candidate in (
            Path("/opt/homebrew/bin") / cfg.enrichment.lms_binary,
            Path("/usr/local/bin") / cfg.enrichment.lms_binary,
            Path.home() / ".lmstudio/bin" / cfg.enrichment.lms_binary,
        ):
            if candidate.is_file():
                binary = str(candidate)
                break
    if not binary:
        LOG.warning("LM Studio is offline and lms CLI was not found")
        return
    result = subprocess.run(
        [binary, "server", "start"], capture_output=True, text=True, timeout=30,
    )
    if result.returncode:
        LOG.warning("Could not start LM Studio: %s", (result.stderr or result.stdout)[-1000:])
    else:
        LOG.info("LM Studio server start requested")


def run(config_path: str | None) -> None:
    cfg = load_config(config_path)
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.FileHandler(cfg.data_dir / "supervisor.log"), logging.StreamHandler()])
    lock = acquire_lock(cfg.data_dir / "supervisor.lock")
    db = connect(cfg.data_dir / "voice.db")
    services = [
        ManagedService("collector", "voice_collector.mac_capture"),
        ManagedService("web", "voice_collector.web"),
        ManagedService("visits", "voice_collector.visit_worker"),
    ]
    if cfg.transcription.enabled:
        services.append(ManagedService("transcriber", "voice_collector.transcriber"))
    if cfg.enrichment.enabled:
        services.append(ManagedService("enricher", "voice_collector.enricher"))
    if cfg.codex.enabled:
        services.append(ManagedService("codex_runner", "voice_collector.codex_runner"))
    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    LOG.info("Supervisor started pid=%s", os.getpid())
    ensure_lmstudio_server(cfg)
    next_lmstudio_check = time.monotonic() + 60
    for service in services:
        start_service(db, service, config_path)
    try:
        while not stopping:
            detail = json.dumps({s.name: s.process.pid if s.process and s.process.poll() is None else None for s in services})
            db.execute("INSERT INTO heartbeat(service,updated_at,detail) VALUES('supervisor',datetime('now'),?) "
                       "ON CONFLICT(service) DO UPDATE SET updated_at=excluded.updated_at,detail=excluded.detail", (detail,))
            db.commit()
            process_control_commands(db, services, config_path)
            current = time.monotonic()
            if current >= next_lmstudio_check:
                ensure_lmstudio_server(cfg)
                next_lmstudio_check = current + 60
            for service in services:
                if service.process and service.process.poll() is None:
                    if current - service.started_monotonic > 60:
                        service.failures = 0
                    update_service(db, service, "running")
                    continue
                if service.process:
                    code = service.process.returncode
                    uptime = current - service.started_monotonic
                    service.failures = service.failures + 1 if uptime < 60 else 1
                    service.restart_count += 1
                    service.next_start = current + min(60, 2 ** min(service.failures, 5))
                    update_service(db, service, "backoff", exit_code=code,
                                   error=f"Exited with code {code}; restart scheduled")
                    LOG.warning("%s exited code=%s; restarting in %.0fs", service.name, code,
                                service.next_start - current)
                    service.process = None
                if not service.process and current >= service.next_start:
                    start_service(db, service, config_path)
            time.sleep(2)
    finally:
        for service in reversed(services):
            stop_service(db, service)
        db.close()
        lock.close()
        LOG.info("Supervisor stopped")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    args = parser.parse_args()
    try:
        run(args.config)
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(0) from exc


if __name__ == "__main__":
    main()
