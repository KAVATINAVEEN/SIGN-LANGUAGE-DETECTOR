"""Temporal smoothing + letter commit logic (finger-spelling UX).

Rules (per the build plan):
- current letter  = majority over the last `window` frames (avg conf >= min_conf)
- commit          = same letter held `commit_frames` consecutive frames with
                    avg conf >= commit_conf
- re-commit block = after committing letter X, X cannot commit again until a
                    different letter becomes current, or the hand leaves the
                    frame for >= hand_gap_s (this is what makes "LL" possible)
- hand absent >= hand_gap_s resets the rolling buffer
"""
from __future__ import annotations

import time
from collections import Counter, deque


class LetterStabilizer:
    def __init__(
        self,
        window: int = 9,
        commit_frames: int = 6,
        min_conf: float = 0.60,
        commit_conf: float = 0.75,
        hand_gap_s: float = 0.4,
    ):
        self.window = window
        self.commit_frames = commit_frames
        self.min_conf = min_conf
        self.commit_conf = commit_conf
        self.hand_gap_s = hand_gap_s

        self._buf: deque[tuple[str | None, float]] = deque(maxlen=window)
        self._streak = 0
        self._streak_letter: str | None = None
        self._last_commit: str | None = None
        self._absence_seen = True  # no hand yet -> a first commit is always allowed
        self._last_hand_ts: float | None = None

        self.current: str | None = None
        self.current_conf = 0.0

    def update(
        self,
        letter: str | None,
        confidence: float,
        hand_present: bool,
        now: float | None = None,
    ) -> tuple[str | None, str | None]:
        """Feed one frame. Returns (current_letter, committed_letter_or_None)."""
        now = time.monotonic() if now is None else now

        if not hand_present:
            if self._last_hand_ts is None:
                self._last_hand_ts = now
            if now - self._last_hand_ts >= self.hand_gap_s:
                self._absence_seen = True
                self._buf.clear()
                self._streak = 0
                self._streak_letter = None
                self.current = None
                self.current_conf = 0.0
            return None, None

        self._last_hand_ts = now
        self._buf.append(
            (letter, confidence) if (letter and confidence >= self.min_conf) else (None, 0.0)
        )

        letters = [ch for ch, _ in self._buf if ch]
        current: str | None = None
        current_conf = 0.0
        if letters:
            top_letter, count = Counter(letters).most_common(1)[0]
            if count >= max(3, int(0.6 * self.window)):
                current = top_letter
                confs = [c for ch, c in self._buf if ch == top_letter]
                current_conf = sum(confs) / len(confs)

        self.current, self.current_conf = current, current_conf

        if current is None:
            self._streak = 0
            self._streak_letter = None
        elif current == self._streak_letter:
            self._streak += 1
        else:
            self._streak_letter = current
            self._streak = 1

        committed: str | None = None
        if (
            current is not None
            and self._streak >= self.commit_frames
            and current_conf >= self.commit_conf
            and (current != self._last_commit or self._absence_seen)
        ):
            committed = current
            self._last_commit = current
            self._absence_seen = False
            self._streak = 0

        return current, committed
