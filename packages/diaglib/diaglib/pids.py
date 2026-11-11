"""SAE J1979 mode 01 PID decoding (LM-16).

Each entry maps a PID to its name, unit, and byte formula. ``decode_pid``
takes the raw response bytes (without the mode/PID echo) and returns a
typed reading. Unknown PIDs and short payloads raise ValueError: the
decoder never guesses a value.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class PidReading:
    pid: int
    name: str
    value: float
    unit: str


def _percent_trim(raw: bytes) -> float:
    return (raw[0] - 128) * 100.0 / 128.0


def _percent_255(raw: bytes) -> float:
    return raw[0] * 100.0 / 255.0


@dataclass(frozen=True)
class _PidSpec:
    name: str
    unit: str
    byte_count: int
    decode: Callable[[bytes], float]


_PID_TABLE: dict[int, _PidSpec] = {
    0x05: _PidSpec("Engine coolant temperature", "degC", 1, lambda raw: float(raw[0] - 40)),
    0x06: _PidSpec("Short term fuel trim bank 1", "%", 1, _percent_trim),
    0x07: _PidSpec("Long term fuel trim bank 1", "%", 1, _percent_trim),
    0x08: _PidSpec("Short term fuel trim bank 2", "%", 1, _percent_trim),
    0x09: _PidSpec("Long term fuel trim bank 2", "%", 1, _percent_trim),
    0x0C: _PidSpec("Engine speed", "rpm", 2, lambda raw: (raw[0] * 256 + raw[1]) / 4.0),
    0x0D: _PidSpec("Vehicle speed", "km/h", 1, lambda raw: float(raw[0])),
    0x0F: _PidSpec("Intake air temperature", "degC", 1, lambda raw: float(raw[0] - 40)),
    0x10: _PidSpec("Mass air flow rate", "g/s", 2, lambda raw: (raw[0] * 256 + raw[1]) / 100.0),
    0x11: _PidSpec("Throttle position", "%", 1, _percent_255),
    0x2F: _PidSpec("Fuel tank level", "%", 1, _percent_255),
}


def decode_pid(pid: int, raw: bytes) -> PidReading:
    """Decode one mode 01 PID from its raw payload bytes."""
    spec = _PID_TABLE.get(pid)
    if spec is None:
        raise ValueError(f"unknown PID: 0x{pid:02X}")
    if len(raw) < spec.byte_count:
        raise ValueError(f"PID 0x{pid:02X} needs {spec.byte_count} byte(s), got {len(raw)}")
    return PidReading(pid=pid, name=spec.name, value=spec.decode(raw), unit=spec.unit)


def supported_pids() -> list[int]:
    """PIDs this decoder knows, in numeric order."""
    return sorted(_PID_TABLE)
