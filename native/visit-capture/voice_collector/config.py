from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class AudioConfig:
    device: str | int | None = None
    sample_rate: int = 16_000
    vad_threshold: float = 0.55
    pre_roll_ms: int = 500
    speech_start_ms: int = 192
    silence_stop_ms: int = 1_000
    minimum_clip_ms: int = 500
    maximum_clip_seconds: int = 120


@dataclass
class StorageConfig:
    data_dir: str = "~/VoiceCollectorData"
    format: str = "opus"
    auto_prune: bool = False
    retention_days: int = 30
    maximum_disk_gb: float = 20


@dataclass
class WebConfig:
    host: str = "127.0.0.1"
    port: int = 8765


@dataclass
class TranscriptionConfig:
    backend: str = "whisper"
    qwen_python: str = "~/AI/gemma-stt/.venv/bin/python"
    qwen_model: str = "~/AI/gemma-stt/models/Qwen3-ASR-0.6B-4bit"
    timeout_seconds: int = 600
    enabled: bool = True
    binary: str = "whisper-cli"
    model: str = "~/VoiceCollectorData/models/ggml-small.bin"
    language: str = "auto"
    threads: int = 6
    poll_seconds: float = 2
    maximum_attempts: int = 3


@dataclass
class MobileConfig:
    enabled: bool = False
    upload_token: str = ""
    maximum_upload_mb: int = 100


@dataclass
class EnrichmentConfig:
    enabled: bool = False
    base_url: str = "http://127.0.0.1:1234/v1"
    model: str = "local-model"
    api_key: str = "lm-studio"
    poll_seconds: float = 5
    maximum_attempts: int = 5
    request_timeout_seconds: int = 180
    minimum_transcript_characters: int = 10
    quarantine_audio: bool = False
    quarantine_days: int = 7
    permanently_delete: bool = False
    keep_important_audio: bool = True
    important_threshold: int = 4
    auto_start_server: bool = True
    lms_binary: str = "lms"


@dataclass
class CodexConfig:
    enabled: bool = False
    binary: str = "codex"
    poll_seconds: float = 5
    maximum_attempts: int = 2
    timeout_seconds: int = 1800
    workspace_dir: str = "~/VoiceCollectorData/codex-tasks"


@dataclass
class Config:
    audio: AudioConfig = field(default_factory=AudioConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    web: WebConfig = field(default_factory=WebConfig)
    transcription: TranscriptionConfig = field(default_factory=TranscriptionConfig)
    mobile: MobileConfig = field(default_factory=MobileConfig)
    enrichment: EnrichmentConfig = field(default_factory=EnrichmentConfig)
    codex: CodexConfig = field(default_factory=CodexConfig)

    @property
    def data_dir(self) -> Path:
        return Path(self.storage.data_dir).expanduser().resolve()


def load_config(path: str | Path | None = None) -> Config:
    if path is None:
        path = Path.home() / ".config/voice-collector/config.json"
    path = Path(path).expanduser()
    raw = json.loads(path.read_text()) if path.exists() else {}
    return Config(
        audio=AudioConfig(**raw.get("audio", {})),
        storage=StorageConfig(**raw.get("storage", {})),
        web=WebConfig(**raw.get("web", {})),
        transcription=TranscriptionConfig(**raw.get("transcription", {})),
        mobile=MobileConfig(**raw.get("mobile", {})),
        enrichment=EnrichmentConfig(**raw.get("enrichment", {})),
        codex=CodexConfig(**raw.get("codex", {})),
    )
