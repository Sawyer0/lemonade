"""Waveform statistics over one signal series (LM-16).

Used for PID traces the reasoner wants summarized — an RPM trace, a
throttle sweep, a fuel-trim series — without handing the whole log to
the model. Empty input raises: there is no statistic of nothing.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass


@dataclass(frozen=True)
class WaveformStats:
    count: int
    mean: float
    minimum: float
    maximum: float
    stdev: float
    span: float


def waveform_stats(values: list[float]) -> WaveformStats:
    """Mean/min/max/sample-stdev of a signal series."""
    if not values:
        raise ValueError("waveform_stats needs at least one value")
    stdev = statistics.stdev(values) if len(values) > 1 else 0.0
    return WaveformStats(
        count=len(values),
        mean=statistics.fmean(values),
        minimum=min(values),
        maximum=max(values),
        stdev=stdev,
        span=max(values) - min(values),
    )
