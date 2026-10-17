from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np


@dataclass
class CompletedClip:
    samples: np.ndarray
    started_at: datetime
    ended_at: datetime
    vad_peak: float


class SpeechSegmenter:
    def __init__(self, sample_rate: int, chunk_samples: int, pre_roll_ms: int,
                 speech_start_ms: int, silence_stop_ms: int, minimum_clip_ms: int,
                 maximum_clip_seconds: int, threshold: float):
        self.sample_rate = sample_rate
        self.chunk_samples = chunk_samples
        self.threshold = threshold
        self.start_chunks = max(1, round(speech_start_ms * sample_rate / 1000 / chunk_samples))
        self.stop_chunks = max(1, round(silence_stop_ms * sample_rate / 1000 / chunk_samples))
        self.min_samples = minimum_clip_ms * sample_rate // 1000
        self.max_samples = maximum_clip_seconds * sample_rate
        pre_chunks = max(1, round(pre_roll_ms * sample_rate / 1000 / chunk_samples))
        self.pre_roll: deque[np.ndarray] = deque(maxlen=pre_chunks)
        self.reset()

    def reset(self) -> None:
        self.recording = False
        self.speech_run = 0
        self.silence_run = 0
        self.frames: list[np.ndarray] = []
        self.started_at: datetime | None = None
        self.peak = 0.0

    def feed(self, chunk: np.ndarray, probability: float, at: datetime) -> CompletedClip | None:
        chunk = np.asarray(chunk, dtype=np.float32).reshape(-1)
        self.pre_roll.append(chunk.copy())
        speech = probability >= self.threshold
        if not self.recording:
            self.speech_run = self.speech_run + 1 if speech else 0
            if self.speech_run < self.start_chunks:
                return None
            self.recording = True
            self.frames = list(self.pre_roll)
            pre_seconds = sum(len(x) for x in self.frames) / self.sample_rate
            self.started_at = at - timedelta(seconds=pre_seconds)
            self.peak = probability
            return None

        if not (self.frames and self.frames[-1] is self.pre_roll[-1]):
            self.frames.append(chunk.copy())
        self.peak = max(self.peak, probability)
        self.silence_run = 0 if speech else self.silence_run + 1
        total = sum(len(x) for x in self.frames)
        if self.silence_run < self.stop_chunks and total < self.max_samples:
            return None
        samples = np.concatenate(self.frames)
        started = self.started_at or at
        result = None
        if len(samples) >= self.min_samples:
            result = CompletedClip(samples, started, at, self.peak)
        self.pre_roll.clear()
        self.reset()
        return result

