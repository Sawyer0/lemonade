// Subsystem groups (LM-37): the spec fits one calibration map per
// group — powertrain, electrical, brakes_steering, hvac, body — and
// pools any group under 50 fit cases into `_pooled`.
//
// The bench rule ids carry no subsystem field, so this table classifies
// the LemonadeBench vehicle rules by the system the cause belongs to.
// Anything not listed here (heavy-equipment and sensor suites, ad-hoc
// loop fixtures) pools: an unknown group is never given a map it did
// not earn.
import type { SubsystemGroup } from './types';

const GROUP_BY_RULE_ID: Readonly<Record<string, Exclude<SubsystemGroup, '_pooled'>>> = {
    'fuel-leak': 'powertrain',
    'cam-phaser': 'powertrain',
    overheating: 'powertrain',
    'turbo-oil': 'powertrain',
    'cv-joint': 'powertrain',
    'oil-life-reset': 'powertrain',
    misfire: 'powertrain',
    'def-sensor': 'powertrain',
    'transmission-slip': 'powertrain',
    'hv-cable': 'electrical',
    alternator: 'electrical',
    'starter-click': 'electrical',
    'hybrid-fan': 'electrical',
    vess: 'electrical',
    'brake-pads': 'brakes_steering',
    'brake-fluid': 'brakes_steering',
    'eps-failure': 'brakes_steering',
    'death-wobble': 'brakes_steering',
    'tire-balance': 'brakes_steering',
    'sunroof-drain': 'body',
};

/** The subsystem group a hypothesis belongs to, or `_pooled` when unknown. */
export function subsystemGroupForHypothesisId(hypothesisId: string): SubsystemGroup {
    return GROUP_BY_RULE_ID[hypothesisId] ?? '_pooled';
}
