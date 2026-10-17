from __future__ import annotations

import argparse
import logging
import shutil
import signal
import sqlite3
import subprocess
import time
from datetime import datetime
from pathlib import Path

from .config import load_config
from .database import connect


LOG = logging.getLogger("voice-codex-runner")


def claim_next(db: sqlite3.Connection, maximum_attempts: int) -> sqlite3.Row | None:
    db.execute("BEGIN IMMEDIATE")
    row = db.execute(
        "SELECT * FROM agent_tasks WHERE status IN ('approved','failed') "
        "AND attempts<? ORDER BY created_at LIMIT 1", (maximum_attempts,),
    ).fetchone()
    if not row:
        db.commit()
        return None
    db.execute(
        "UPDATE agent_tasks SET status='running',attempts=attempts+1,started_at=?,error=NULL "
        "WHERE id=?", (datetime.now().astimezone().isoformat(), row["id"]),
    )
    db.commit()
    return row


def resolve_binary(value: str) -> str:
    found = shutil.which(value)
    if found:
        return found
    candidate = Path(value).expanduser()
    if candidate.is_file():
        return str(candidate)
    for path in (
        Path("/opt/homebrew/bin") / value,
        Path("/usr/local/bin") / value,
        Path.home() / ".local/bin" / value,
    ):
        if path.is_file():
            return str(path)
    raise FileNotFoundError(f"Codex CLI not found: {value}")


def execute_task(binary: str, task: sqlite3.Row, workspace_root: Path,
                 timeout: int) -> tuple[Path, str]:
    task_dir = workspace_root / f"task-{task['id']:06d}"
    task_dir.mkdir(parents=True, exist_ok=True)
    output = task_dir / "result.md"
    prompt = (
        "Execute the approved user task below. Work only inside the current task directory. "
        "Do not send messages, publish content, make purchases, delete external data, access "
        "credentials, or modify files outside this directory. If the task requires any such "
        "action, produce a plan and state what approval is needed instead. Save useful artifacts "
        "inside the current directory.\n\nApproved task:\n" + task["instruction"]
    )
    command = [
        binary, "exec", "--skip-git-repo-check", "--sandbox", "workspace-write",
        "--output-last-message", str(output), prompt,
    ]
    result = subprocess.run(
        command, cwd=task_dir, capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()[-4000:]
        raise RuntimeError(f"Codex exited with {result.returncode}: {detail}")
    text = output.read_text(encoding="utf-8") if output.exists() else result.stdout
    return output, text.strip()


def run(config_path: str | None) -> None:
    cfg = load_config(config_path)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(cfg.data_dir / "codex-runner.log"), logging.StreamHandler()],
    )
    binary = resolve_binary(cfg.codex.binary)
    workspace = Path(cfg.codex.workspace_dir).expanduser().resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    db = connect(cfg.data_dir / "voice.db")
    db.execute("UPDATE agent_tasks SET status='approved' WHERE status='running'")
    db.commit()
    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while not stopping:
        db.execute(
            "INSERT INTO heartbeat(service,updated_at,detail) VALUES('codex_runner',datetime('now'),'running') "
            "ON CONFLICT(service) DO UPDATE SET updated_at=excluded.updated_at,detail=excluded.detail"
        )
        db.commit()
        task = claim_next(db, cfg.codex.maximum_attempts)
        if not task:
            time.sleep(cfg.codex.poll_seconds)
            continue
        try:
            output, text = execute_task(binary, task, workspace, cfg.codex.timeout_seconds)
            db.execute(
                "UPDATE agent_tasks SET status='completed',completed_at=?,output_path=?,"
                "result_text=?,error=NULL WHERE id=?",
                (datetime.now().astimezone().isoformat(), str(output), text[:20000], task["id"]),
            )
            db.commit()
            LOG.info("Completed task=%s", task["id"])
        except Exception as exc:
            db.execute(
                "UPDATE agent_tasks SET status='failed',error=? WHERE id=?",
                (str(exc)[:4000], task["id"]),
            )
            db.commit()
            LOG.exception("Codex task failed id=%s", task["id"])
            time.sleep(5)
    db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()
