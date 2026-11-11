"""SAE J2012 DTC lookup (LM-16).

Ports the generic/manufacturer-specific split and subsystem names from
``packages/core/src/dtc``. The description table holds generic (SAE)
P0xxx codes only: a manufacturer-specific code has no description here,
because its meaning belongs to the manufacturer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_DTC_PATTERN = re.compile(r"^[PBCU][0-3][0-9A-F]{3}$")

_SYSTEM_NAMES = {"P": "Powertrain", "B": "Body", "C": "Chassis", "U": "Network"}

_POWERTRAIN_SUBSYSTEMS = {
    "0": "Fuel and air metering and auxiliary emission controls",
    "1": "Fuel and air metering",
    "2": "Fuel and air metering (injector circuit)",
    "3": "Ignition system or misfire",
    "4": "Auxiliary emission controls",
    "5": "Vehicle speed control and idle control system",
    "6": "Computer and output circuit",
    "7": "Transmission",
    "8": "Transmission",
    "9": "Transmission",
    "A": "Hybrid propulsion",
    "B": "Hybrid propulsion",
    "C": "Hybrid propulsion",
    "D": "Hybrid propulsion",
    "E": "Hybrid propulsion",
    "F": "Hybrid propulsion",
}

# Generic SAE descriptions for the codes a fuel-trim / misfire workup
# actually meets. Anything not listed here has no table entry and reports
# ``description=None`` rather than a guessed meaning.
_GENERIC_DESCRIPTIONS = {
    "P0101": "Mass air flow sensor circuit range/performance",
    "P0113": "Intake air temperature sensor circuit high",
    "P0128": "Coolant thermostat below regulating temperature",
    "P0171": "System too lean (bank 1)",
    "P0172": "System too rich (bank 1)",
    "P0174": "System too lean (bank 2)",
    "P0175": "System too rich (bank 2)",
    "P0300": "Random/multiple cylinder misfire detected",
    "P0301": "Cylinder 1 misfire detected",
    "P0302": "Cylinder 2 misfire detected",
    "P0303": "Cylinder 3 misfire detected",
    "P0304": "Cylinder 4 misfire detected",
    "P0305": "Cylinder 5 misfire detected",
    "P0306": "Cylinder 6 misfire detected",
    "P0307": "Cylinder 7 misfire detected",
    "P0308": "Cylinder 8 misfire detected",
    "P0401": "Exhaust gas recirculation flow insufficient",
    "P0420": "Catalyst system efficiency below threshold (bank 1)",
    "P0430": "Catalyst system efficiency below threshold (bank 2)",
    "P0442": "Evaporative emission system leak detected (small leak)",
    "P0455": "Evaporative emission system leak detected (large leak)",
    "P0507": "Idle air control system RPM higher than expected",
}


@dataclass(frozen=True)
class DtcLookup:
    """One decoded DTC. ``description`` is None when the code has no SAE
    table entry or is manufacturer-specific."""

    code: str
    system: str
    system_name: str
    generic: bool
    subsystem: str
    description: str | None


def is_generic_dtc(system: str, second_digit: str, third_digit: str) -> bool:
    """SAE J2012 generic split: P0/P2 generic, P1 manufacturer-specific,
    P3 split at P34xx; B/C/U generic on 0 and 3."""
    if system == "P":
        if second_digit in ("0", "2"):
            return True
        if second_digit == "1":
            return False
        if second_digit == "3":
            return third_digit >= "4"
        return False
    return second_digit in ("0", "3")


def lookup_dtc(code: str) -> DtcLookup:
    """Decode a DTC string. Raises ValueError on a malformed code."""
    normalized = code.strip().upper()
    if not _DTC_PATTERN.match(normalized):
        raise ValueError(f"malformed DTC code: {code!r}")
    system = normalized[0]
    generic = is_generic_dtc(system, normalized[1], normalized[2])
    if system == "P":
        subsystem = _POWERTRAIN_SUBSYSTEMS[normalized[2]]
    elif system == "U":
        subsystem = "Network communication"
    else:
        subsystem = _SYSTEM_NAMES[system]
    description = _GENERIC_DESCRIPTIONS.get(normalized) if generic else None
    return DtcLookup(
        code=normalized,
        system=system,
        system_name=_SYSTEM_NAMES[system],
        generic=generic,
        subsystem=subsystem,
        description=description,
    )
