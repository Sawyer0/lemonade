"""Misfire counting over a PID log (LM-16).

A misfire event is a mapping with ``cylinder`` (int, 1-based) and
``timestamp`` (seconds). Counting is per cylinder so the worst cylinder
— the one the tech pulls a plug on first — is explicit.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class MisfireReport:
    counts_by_cylinder: dict[int, int]
    total: int
    worst_cylinder: int | None
    worst_count: int
    rate_per_minute: float | None


def count_misfires(events: list[Mapping[str, object]]) -> MisfireReport:
    """Count misfire events per cylinder."""
    counts: dict[int, int] = {}
    timestamps: list[float] = []
    for event in events:
        cylinder = int(event["cylinder"])  # type: ignore[arg-type]
        if cylinder < 1:
            raise ValueError(f"cylinder must be 1-based, got {cylinder}")
        counts[cylinder] = counts.get(cylinder, 0) + 1
        timestamps.append(float(event["timestamp"]))  # type: ignore[arg-type]
    total = sum(counts.values())
    worst_cylinder: int | None = None
    worst_count = 0
    for cylinder, count in sorted(counts.items()):
        if count > worst_count:
            worst_cylinder = cylinder
            worst_count = count
    rate: float | None = None
    if len(timestamps) >= 2:
        span_minutes = (max(timestamps) - min(timestamps)) / 60.0
        if span_minutes > 0:
            rate = total / span_minutes
    return MisfireReport(
        counts_by_cylinder=counts,
        total=total,
        worst_cylinder=worst_cylinder,
        worst_count=worst_count,
        rate_per_minute=rate,
    )
