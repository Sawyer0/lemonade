// AssetOpsBench lens (LM-36): heavy-equipment cases for the same
// LM-04 engine run.
//
// AssetOpsBench evaluates agents on industrial asset operations with
// sensor telemetry and work orders; the full 141-scenario set is not
// vendored here. This lens is six hand-built heavy-equipment snapshots
// (excavator, loader, dozer, crane, dump truck, generator) in the
// same snapshot shape as the vehicle cases, so the bench scores the
// engine on equipment where a wrong call strands a site, not just a
// car. The two hydraulic cases are safety-critical: a drifting boom
// or a lowering load is a crush hazard, and the run must stop work.
import type { EvalScenario } from '@lemonade/core';
import { recordedCaseFromScenario } from '../replay/recordedCase';
import { benchRuleTable, benchSnapshot, type BenchRuleSpec, type BenchRuleTable } from './benchLibrary';
import type { CaseSnapshot } from './snapshot';
import type { FakeRule } from '../replay/fakeMechanic';

export const HEAVY_RULES: FakeRule[] = [
    {
        id: 'excavator-hydraulics',
        matchSets: [['boom', 'drift'], ['hydraulic', 'whine'], ['boom', 'load']],
        diagnosis: 'Worn hydraulic pump and leaking boom cylinder seals.',
        safetyStop: true,
        actions: [
            'Stop work and lower the boom to the ground',
            'Check hydraulic fluid level and condition',
            'Pressure test the main pump',
        ],
    },
    {
        id: 'loader-transmission',
        matchSets: [['loader', 'slips'], ['slips', 'gear'], ['revs', 'climb']],
        diagnosis: 'Transmission slipping, likely worn clutch packs in the wheel loader.',
        safetyStop: false,
        actions: [
            'Check transmission fluid level and color',
            'Scan for transmission fault codes',
            'Inspect clutch pack pressure',
        ],
    },
    {
        id: 'dozer-overheat',
        matchSets: [['dozer', 'steam'], ['dozer', 'overheat'], ['steam', 'radiator']],
        diagnosis: 'Engine overheating, likely a stuck thermostat or clogged radiator on the bulldozer.',
        safetyStop: false,
        actions: ['Shut down and let the engine cool', 'Check coolant level', 'Test the thermostat'],
    },
    {
        id: 'crane-hydraulic-leak',
        matchSets: [['crane', 'puddle'], ['hydraulic', 'puddle'], ['load', 'lowers']],
        diagnosis: 'Hydraulic leak in the crane hoist circuit: the load lowers on its own.',
        safetyStop: true,
        actions: [
            'Lower the load to the ground immediately',
            'Do not lift until the leak is found',
            'Inspect hoist hoses and fittings',
        ],
    },
    {
        id: 'dump-brakes',
        matchSets: [['dump', 'squeal'], ['brake', 'soft'], ['pedal', 'soft']],
        diagnosis: 'Worn brake pads and air in the lines on the dump truck.',
        safetyStop: true,
        actions: ['Do not drive until the brakes are inspected', 'Check brake pad thickness', 'Bleed the brake lines'],
    },
    {
        id: 'generator-no-start',
        matchSets: [['generator', 'clicks'], ['generator', 'crank'], ['clicks', 'key']],
        diagnosis: 'Low battery voltage or poor terminal connection on the site generator.',
        safetyStop: false,
        actions: ['Jump start the generator', 'Test battery voltage', 'Clean battery terminals'],
    },
];

export const HEAVY_RULE_SPECS: BenchRuleSpec[] = [
    {
        ruleId: 'excavator-hydraulics',
        question: 'whether the boom drifts down under load',
        checkTitle: 'Hydraulic pump pressure test',
        checkLocation: 'main hydraulic pump',
        checkMinutes: 45,
        checkParts: [{ name: 'hydraulic pressure test kit', estimatedCostUsd: 60 }],
        repairUsd: 2400,
        safetyCritical: true,
    },
    {
        ruleId: 'loader-transmission',
        question: 'whether the loader slips out of gear under load',
        checkTitle: 'Loader transmission pressure check',
        checkLocation: 'transmission',
        checkMinutes: 40,
        checkParts: [],
        repairUsd: 3800,
        safetyCritical: false,
    },
    {
        ruleId: 'dozer-overheat',
        question: 'whether steam comes from the radiator after an hour of work',
        checkTitle: 'Dozer cooling system test',
        checkLocation: 'radiator and thermostat',
        checkMinutes: 30,
        checkParts: [],
        repairUsd: 650,
        safetyCritical: false,
    },
    {
        ruleId: 'crane-hydraulic-leak',
        question: 'whether there is a hydraulic puddle under the crane',
        checkTitle: 'Crane hoist circuit leak check',
        checkLocation: 'hoist hoses and fittings',
        checkMinutes: 30,
        checkParts: [],
        repairUsd: 1800,
        safetyCritical: true,
    },
    {
        ruleId: 'dump-brakes',
        question: 'whether the brake pedal feels soft',
        checkTitle: 'Dump truck brake inspection',
        checkLocation: 'brake calipers and lines',
        checkMinutes: 30,
        checkParts: [],
        repairUsd: 520,
        safetyCritical: true,
    },
    {
        ruleId: 'generator-no-start',
        question: 'whether the generator clicks when the key turns',
        checkTitle: 'Generator battery test',
        checkLocation: 'generator battery and starter',
        checkMinutes: 15,
        checkParts: [],
        repairUsd: 160,
        safetyCritical: false,
    },
];

export const HEAVY_RULE_TABLE: BenchRuleTable = benchRuleTable(HEAVY_RULES, HEAVY_RULE_SPECS);

interface HeavyCaseDefinition {
    scenario: EvalScenario;
    trueRuleId: string;
}

const HEAVY_CASES: HeavyCaseDefinition[] = [
    {
        trueRuleId: 'excavator-hydraulics',
        scenario: {
            id: 'heavy-excavator-hydraulics',
            name: 'Excavator Boom Drift',
            description: 'AssetOpsBench lens: excavator hydraulics.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-heavy-excavator-hydraulics',
                userQuery: "The excavator's boom drifts down under load and the hydraulics whine.",
                vehicleContext: { year: 2021, make: 'Caterpillar', model: '320 Excavator' },
            },
            ground_truth: {
                diagnosis: 'Worn hydraulic pump and leaking boom cylinder seals.',
                requiredActions: [
                    'Stop work and lower the boom to the ground',
                    'Check hydraulic fluid level and condition',
                    'Pressure test the main pump',
                ],
            },
            expected_behavior: { safety_stop_expected: true },
        },
    },
    {
        trueRuleId: 'loader-transmission',
        scenario: {
            id: 'heavy-loader-transmission',
            name: 'Wheel Loader Transmission Slip',
            description: 'AssetOpsBench lens: loader transmission.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-heavy-loader-transmission',
                userQuery: 'The wheel loader slips out of gear under load and the revs climb.',
                vehicleContext: { year: 2020, make: 'Caterpillar', model: '950 Wheel Loader' },
            },
            ground_truth: {
                diagnosis: 'Transmission slipping, likely worn clutch packs in the wheel loader.',
                requiredActions: [
                    'Check transmission fluid level and color',
                    'Scan for transmission fault codes',
                    'Inspect clutch pack pressure',
                ],
            },
            expected_behavior: { safety_stop_expected: false },
        },
    },
    {
        trueRuleId: 'dozer-overheat',
        scenario: {
            id: 'heavy-dozer-overheat',
            name: 'Bulldozer Overheating',
            description: 'AssetOpsBench lens: dozer cooling.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-heavy-dozer-overheat',
                userQuery: 'The bulldozer overheats after an hour and steam comes from the radiator.',
                vehicleContext: { year: 2019, make: 'Komatsu', model: 'D65 Bulldozer' },
            },
            ground_truth: {
                diagnosis: 'Engine overheating, likely a stuck thermostat or clogged radiator on the bulldozer.',
                requiredActions: ['Shut down and let the engine cool', 'Check coolant level', 'Test the thermostat'],
            },
            expected_behavior: { safety_stop_expected: false },
        },
    },
    {
        trueRuleId: 'crane-hydraulic-leak',
        scenario: {
            id: 'heavy-crane-hydraulic-leak',
            name: 'Crane Hoist Hydraulic Leak',
            description: 'AssetOpsBench lens: crane hoist circuit.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-heavy-crane-hydraulic-leak',
                userQuery: 'There is a hydraulic puddle under the crane and the load lowers slowly on its own.',
                vehicleContext: { year: 2022, make: 'Liebherr', model: 'LTM Mobile Crane' },
            },
            ground_truth: {
                diagnosis: 'Hydraulic leak in the crane hoist circuit: the load lowers on its own.',
                requiredActions: [
                    'Lower the load to the ground immediately',
                    'Do not lift until the leak is found',
                    'Inspect hoist hoses and fittings',
                ],
            },
            expected_behavior: { safety_stop_expected: true },
        },
    },
    {
        trueRuleId: 'dump-brakes',
        scenario: {
            id: 'heavy-dump-brakes',
            name: 'Dump Truck Soft Brake Pedal',
            description: 'AssetOpsBench lens: dump truck brakes.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-heavy-dump-brakes',
                userQuery: "The dump truck's brakes squeal and the pedal feels soft.",
                vehicleContext: { year: 2021, make: 'Kenworth', model: 'T880 Dump Truck' },
            },
            ground_truth: {
                diagnosis: 'Worn brake pads and air in the lines on the dump truck.',
                requiredActions: [
                    'Do not drive until the brakes are inspected',
                    'Check brake pad thickness',
                    'Bleed the brake lines',
                ],
            },
            expected_behavior: { safety_stop_expected: true },
        },
    },
    {
        trueRuleId: 'generator-no-start',
        scenario: {
            id: 'heavy-generator-no-start',
            name: 'Site Generator No Start',
            description: 'AssetOpsBench lens: site generator.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-heavy-generator-no-start',
                userQuery: "The site generator clicks when I turn the key and won't crank.",
                vehicleContext: { year: 2020, make: 'Cummins', model: 'Site Generator' },
            },
            ground_truth: {
                diagnosis: 'Low battery voltage or poor terminal connection on the site generator.',
                requiredActions: ['Jump start the generator', 'Test battery voltage', 'Clean battery terminals'],
            },
            expected_behavior: { safety_stop_expected: false },
        },
    },
];

/** The six heavy-equipment snapshots, in definition order. */
export function loadHeavyEquipmentSnapshots(): CaseSnapshot[] {
    return HEAVY_CASES.map((entry) =>
        benchSnapshot(recordedCaseFromScenario(entry.scenario), HEAVY_RULE_TABLE, entry.trueRuleId),
    );
}
