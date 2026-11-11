"""Typed diagnostic library for the Lemonade reasoner (LM-16).

Pure standard-library Python. The reasoner writes scripts against this
library inside the sandbox instead of asking the model for one-shot JSON:
real computation over the car's own scan data, not guesses.

Functions never invent a meaning: a manufacturer-specific DTC has no
description here, exactly as in ``packages/core/src/dtc``.
"""

from diaglib.dtc import DtcLookup, lookup_dtc
from diaglib.fuel_trims import FuelTrimReport, compute_fuel_trims
from diaglib.misfire import MisfireReport, count_misfires
from diaglib.pids import PidReading, decode_pid
from diaglib.waveform import WaveformStats, waveform_stats

__all__ = [
    "DtcLookup",
    "FuelTrimReport",
    "MisfireReport",
    "PidReading",
    "WaveformStats",
    "compute_fuel_trims",
    "count_misfires",
    "decode_pid",
    "lookup_dtc",
    "waveform_stats",
]
