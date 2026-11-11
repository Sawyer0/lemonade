import type { DtcSystem } from './types';

// --- Generic vs manufacturer-specific (SAE J2012) ---
// P0xxx and P2xxx are SAE generic, P1xxx is manufacturer-specific, and P3xxx
// is split: P30xx-P33xx manufacturer-specific, P34xx and above SAE generic.
// "And above" runs through the hex range, so P3Axx-P3Fxx are SAE generic
// too (the third character is compared as a hex digit, and A-F sort above
// 4). B/C: 0 and 3 are SAE generic, 1 and 2 manufacturer-specific.
// U: 0 and 3 are SAE generic, 1 and 2 manufacturer-specific.
// A designator outside 0-3 is not a valid DTC at all: the parser rejects
// it before this runs, so the fall-through below only guards direct callers.
export function isGenericDtc(system: DtcSystem, secondDigit: string, thirdDigit: string): boolean {
    switch (system) {
        case 'P':
            if (secondDigit === '0' || secondDigit === '2') return true;
            if (secondDigit === '1') return false;
            if (secondDigit === '3') return thirdDigit >= '4';
            return false;
        case 'B':
        case 'C':
        case 'U':
            return secondDigit === '0' || secondDigit === '3';
    }
}

// --- Subsystem names (third character) ---
// Powertrain names are SAE J2012 Appendix B; network names are Appendix C
// (U00xx network electrical, U01xx/U02xx network communication, U03xx
// network software, U04xx network data). B and C have no standardized
// subsystem names beyond the well-known digit-0 groups, so those fall back
// to the system label rather than inventing one.
const POWERTRAIN_SUBSYSTEMS: Record<string, string> = {
    '0': 'Fuel and air metering and auxiliary emission controls',
    '1': 'Fuel and air metering',
    '2': 'Fuel and air metering (injector circuit)',
    '3': 'Ignition system or misfire',
    '4': 'Auxiliary emission controls',
    '5': 'Vehicle speed control and idle control system',
    '6': 'Computer and output circuit',
    '7': 'Transmission',
    '8': 'Transmission',
};

const NETWORK_SUBSYSTEMS: Record<string, string> = {
    '0': 'Network electrical',
    '1': 'Network communication',
    '2': 'Network communication',
    '3': 'Network software',
    '4': 'Network data',
};

export function describeSubsystem(system: DtcSystem, subsystemDigit: string): string {
    if (system === 'P') {
        if (['9', 'D', 'E', 'F'].includes(subsystemDigit)) return 'SAE reserved';
        if (['A', 'B', 'C'].includes(subsystemDigit)) return 'Hybrid propulsion system';
        return POWERTRAIN_SUBSYSTEMS[subsystemDigit] ?? 'SAE reserved';
    }
    if (system === 'U') {
        return NETWORK_SUBSYSTEMS[subsystemDigit] ?? 'SAE reserved';
    }
    if (system === 'B') {
        return subsystemDigit === '0' ? 'Occupant restraint system' : 'Body system';
    }
    return subsystemDigit === '0' ? 'Anti-lock brake system' : 'Chassis system';
}

// --- Generic description table (SAE J2012 generic codes) ---
// Only generic codes appear here. A generic code with no entry parses fine
// with a null description; the table is a lookup, never a guess.
export const GENERIC_DTC_DESCRIPTIONS: Readonly<Record<string, string>> = {
    P0100: 'Mass or volume air flow circuit malfunction',
    P0101: 'Mass or volume air flow circuit range/performance problem',
    P0102: 'Mass or volume air flow circuit low input',
    P0103: 'Mass or volume air flow circuit high input',
    P0110: 'Intake air temperature circuit malfunction',
    P0115: 'Engine coolant temperature circuit malfunction',
    P0117: 'Engine coolant temperature circuit low input',
    P0118: 'Engine coolant temperature circuit high input',
    P0120: 'Throttle/pedal position sensor/switch A circuit malfunction',
    P0122: 'Throttle/pedal position sensor/switch A circuit low input',
    P0123: 'Throttle/pedal position sensor/switch A circuit high input',
    P0128: 'Coolant thermostat (coolant temperature below thermostat regulating temperature)',
    P0130: 'O2 sensor circuit malfunction (bank 1 sensor 1)',
    P0131: 'O2 sensor circuit low voltage (bank 1 sensor 1)',
    P0132: 'O2 sensor circuit high voltage (bank 1 sensor 1)',
    P0133: 'O2 sensor circuit slow response (bank 1 sensor 1)',
    P0135: 'O2 sensor heater circuit malfunction (bank 1 sensor 1)',
    P0136: 'O2 sensor circuit malfunction (bank 1 sensor 2)',
    P0141: 'O2 sensor heater circuit malfunction (bank 1 sensor 2)',
    P0155: 'O2 sensor heater circuit malfunction (bank 2 sensor 1)',
    P0171: 'System too lean (bank 1)',
    P0172: 'System too rich (bank 1)',
    P0174: 'System too lean (bank 2)',
    P0175: 'System too rich (bank 2)',
    P0201: 'Injector circuit malfunction - cylinder 1',
    P0202: 'Injector circuit malfunction - cylinder 2',
    P0203: 'Injector circuit malfunction - cylinder 3',
    P0204: 'Injector circuit malfunction - cylinder 4',
    P0205: 'Injector circuit malfunction - cylinder 5',
    P0206: 'Injector circuit malfunction - cylinder 6',
    P0207: 'Injector circuit malfunction - cylinder 7',
    P0208: 'Injector circuit malfunction - cylinder 8',
    P0300: 'Random/multiple cylinder misfire detected',
    P0301: 'Cylinder 1 misfire detected',
    P0302: 'Cylinder 2 misfire detected',
    P0303: 'Cylinder 3 misfire detected',
    P0304: 'Cylinder 4 misfire detected',
    P0305: 'Cylinder 5 misfire detected',
    P0306: 'Cylinder 6 misfire detected',
    P0307: 'Cylinder 7 misfire detected',
    P0308: 'Cylinder 8 misfire detected',
    P0325: 'Knock sensor 1 circuit malfunction (bank 1 or single sensor)',
    P0335: 'Crankshaft position sensor A circuit malfunction',
    P0336: 'Crankshaft position sensor A circuit range/performance',
    P0340: 'Camshaft position sensor A circuit malfunction (bank 1 or single sensor)',
    P0341: 'Camshaft position sensor A circuit range/performance (bank 1 or single sensor)',
    P0400: 'Exhaust gas recirculation flow malfunction',
    P0401: 'Exhaust gas recirculation flow insufficient detected',
    P0402: 'Exhaust gas recirculation flow excessive detected',
    P0420: 'Catalyst system efficiency below threshold (bank 1)',
    P0430: 'Catalyst system efficiency below threshold (bank 2)',
    P0440: 'Evaporative emission control system malfunction',
    P0441: 'Evaporative emission control system incorrect purge flow',
    P0442: 'Evaporative emission control system leak detected (small leak)',
    P0446: 'Evaporative emission control system vent control circuit malfunction',
    P0455: 'Evaporative emission control system leak detected (gross leak)',
    P0456: 'Evaporative emission control system leak detected (very small leak)',
    P0463: 'Fuel level sensor circuit high input',
    P0480: 'Cooling fan 1 control circuit malfunction',
    P0500: 'Vehicle speed sensor malfunction',
    P0505: 'Idle control system malfunction',
    P0507: 'Idle control system RPM higher than expected',
    P0562: 'System voltage low',
    P0571: 'Cruise control/brake switch A circuit malfunction',
    P0600: 'Serial communication link malfunction',
    P0601: 'Internal control module memory check sum error',
    P0606: 'ECM/PCM processor fault',
    P0700: 'Transmission control system malfunction',
    P0715: 'Input/turbine speed sensor circuit malfunction',
    P0720: 'Output speed sensor circuit malfunction',
    P0730: 'Incorrect gear ratio',
    P0740: 'Torque converter clutch circuit malfunction',
    P0750: 'Shift solenoid A malfunction',
    P0753: 'Shift solenoid A electrical',
    P0755: 'Shift solenoid B malfunction',
    P0770: 'Shift solenoid E malfunction',
    P0780: 'Shift malfunction',
    P0A80: 'Replace hybrid battery pack',
    P0A7F: 'Hybrid battery pack deterioration',
    B0001: 'Driver frontal airbag deployment loop',
    C0035: 'Left front wheel speed sensor circuit',
    C0040: 'Right front wheel speed sensor circuit',
    U0001: 'High speed CAN communication bus',
    U0073: 'Control module communication bus off',
    U0100: 'Lost communication with ECM/PCM A',
    U0101: 'Lost communication with TCM',
    U0121: 'Lost communication with anti-lock brake system (ABS) control module',
    U0140: 'Lost communication with body control module',
    U0155: 'Lost communication with instrument panel cluster (IPC) control module',
};
