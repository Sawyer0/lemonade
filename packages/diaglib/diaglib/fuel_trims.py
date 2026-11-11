"""Fuel-trim computation over a PID log (LM-16).

A sample is a mapping with ``pid`` (int, or a ``"0x06"`` hex string) and
``value`` (percent). Total trim per bank is mean short-term plus mean
long-term: a positive total means the ECU is adding fuel (lean), a
negative total means it is taking fuel away (rich).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

# |total trim| at or below this is normal closed-loop correction; above it
# the ECU is compensating for a real fault (vacuum leak, weak pump, and so
# on) and the bank is flagged.
WATCH_THRESHOLD_PERCENT = 10.0
FAULT_THRESHOLD_PERCENT = 25.0

_SHORT_TRIM_PIDS = {0x06: 1, 0x08: 2}
_LONG_TRIM_PIDS = {0x07: 1, 0x09: 2}


@dataclass(frozen=True)
class BankTrim:
    stft_mean: float | None
    ltft_mean: float | None
    total_mean: float | None
    sample_count: int


@dataclass(frozen=True)
class FuelTrimReport:
    bank1: BankTrim
    bank2: BankTrim
    verdict: str  # 'normal' | 'lean_watch' | 'rich_watch' | 'lean_fault' | 'rich_fault'
    worst_total_percent: float | None


def _pid_number(raw_pid: object) -> int:
    if isinstance(raw_pid, int):
        return raw_pid
    if isinstance(raw_pid, str):
        return int(raw_pid, 16)
    raise ValueError(f"PID must be an int or hex string, got {raw_pid!r}")


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _verdict_for(total: float | None) -> str:
    if total is None:
        return "normal"
    magnitude = abs(total)
    if magnitude > FAULT_THRESHOLD_PERCENT:
        return "lean_fault" if total > 0 else "rich_fault"
    if magnitude > WATCH_THRESHOLD_PERCENT:
        return "lean_watch" if total > 0 else "rich_watch"
    return "normal"


def compute_fuel_trims(samples: list[Mapping[str, object]]) -> FuelTrimReport:
    """Compute per-bank fuel trims from PID log samples."""
    stft: dict[int, list[float]] = {1: [], 2: []}
    ltft: dict[int, list[float]] = {1: [], 2: []}
    for sample in samples:
        pid = _pid_number(sample["pid"])
        value = float(sample["value"])  # type: ignore[arg-type]
        if pid in _SHORT_TRIM_PIDS:
            stft[_SHORT_TRIM_PIDS[pid]].append(value)
        elif pid in _LONG_TRIM_PIDS:
            ltft[_LONG_TRIM_PIDS[pid]].append(value)

    banks: dict[int, BankTrim] = {}
    for bank in (1, 2):
        stft_mean = _mean(stft[bank])
        ltft_mean = _mean(ltft[bank])
        total = None
        if stft_mean is not None and ltft_mean is not None:
            total = stft_mean + ltft_mean
        elif stft_mean is not None:
            total = stft_mean
        elif ltft_mean is not None:
            total = ltft_mean
        banks[bank] = BankTrim(
            stft_mean=stft_mean,
            ltft_mean=ltft_mean,
            total_mean=total,
            sample_count=len(stft[bank]) + len(ltft[bank]),
        )

    totals = [bank.total_mean for bank in banks.values() if bank.total_mean is not None]
    worst = max(totals, key=abs) if totals else None
    verdicts = [_verdict_for(bank.total_mean) for bank in banks.values()]
    verdict = "normal"
    for candidate in ("lean_fault", "rich_fault", "lean_watch", "rich_watch"):
        if candidate in verdicts:
            verdict = candidate
            break
    return FuelTrimReport(bank1=banks[1], bank2=banks[2], verdict=verdict, worst_total_percent=worst)
