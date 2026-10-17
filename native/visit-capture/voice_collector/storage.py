from __future__ import annotations

import shutil
import subprocess
import wave
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np


class ClipStorage:
    def __init__(self, data_dir: Path, sample_rate: int, output_format: str = "opus"):
        self.data_dir = data_dir
        self.sample_rate = sample_rate
        self.output_format = output_format if output_format in {"wav", "opus"} else "wav"
        self.audio_dir = data_dir / "audio"
        self.audio_dir.mkdir(parents=True, exist_ok=True)

    def save(self, samples: np.ndarray, started_at: datetime) -> Path:
        folder = self.audio_dir / started_at.strftime("%Y/%m/%d")
        folder.mkdir(parents=True, exist_ok=True)
        base = started_at.strftime("%H-%M-%S-%f")[:-3]
        wav_path = folder / f"{base}.wav"
        pcm = np.clip(samples, -1, 1)
        pcm = (pcm * 32767).astype("<i2")
        with wave.open(str(wav_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            wf.writeframes(pcm.tobytes())
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            for candidate in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"):
                if Path(candidate).is_file():
                    ffmpeg = candidate
                    break
        if self.output_format == "opus" and ffmpeg:
            opus_path = wav_path.with_suffix(".opus")
            result = subprocess.run(
                [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
                 "-c:a", "libopus", "-b:a", "24k", str(opus_path)],
                capture_output=True,
            )
            if result.returncode == 0:
                wav_path.unlink()
                return opus_path
        return wav_path

    def usage_bytes(self) -> int:
        return sum(p.stat().st_size for p in self.audio_dir.rglob("*") if p.is_file())

    def prune(self, retention_days: int, maximum_disk_gb: float) -> list[Path]:
        files = sorted((p for p in self.audio_dir.rglob("*") if p.is_file()), key=lambda p: p.stat().st_mtime)
        removed: list[Path] = []
        cutoff = datetime.now().timestamp() - timedelta(days=retention_days).total_seconds()
        for path in list(files):
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
                removed.append(path)
                files.remove(path)
        limit = int(maximum_disk_gb * 1024**3)
        total = sum(p.stat().st_size for p in files)
        while files and total > limit:
            path = files.pop(0)
            total -= path.stat().st_size
            path.unlink(missing_ok=True)
            removed.append(path)
        return removed
