// FailureSensorIQ lens (LM-36): sensor-to-failure-mode cases for the
// same LM-04 engine run.
//
// FailureSensorIQ is an MCQA benchmark for sensor relationships and
// failure modes across industrial assets (pump, motor, compressor,
// fan among its ten asset types); the full 8,296-question set is not
// vendored here. This lens is four hand-built cases in that shape: the
// complaint is sensor readings, the causes are the failure modes those
// readings implicate, and the engine must map the sensors to the right
// mode — Sensor2FM, run as a sequential workup instead of a single
// multiple-choice answer.
import type { EvalScenario } from '@lemonade/core';
import { recordedCaseFromScenario } from '../replay/recordedCase';
import { benchRuleTable, benchSnapshot, type BenchRuleSpec, type BenchRuleTable } from './benchLibrary';
import type { CaseSnapshot } from './snapshot';
import type { FakeRule } from '../replay/fakeMechanic';

export const SENSOR_RULES: FakeRule[] = [
    {
        id: 'pump-bearing',
        matchSets: [
            ['vibration', 'bearing'],
            ['vibration', '11'],
        ],
        diagnosis: 'Bearing failure on the centrifugal pump: vibration 11 mm/s RMS with a rising bearing temperature.',
        safetyStop: false,
        actions: ['Trend the vibration spectrum', 'Check bearing temperature', 'Schedule a bearing replacement'],
    },
    {
        id: 'pump-cavitation',
        matchSets: [['cavitation'], ['flow', 'drops'], ['suction', 'pressure']],
        diagnosis: 'Pump cavitation: suction pressure low and flow dropping.',
        safetyStop: false,
        actions: ['Check suction strainer', 'Verify NPSH margin', 'Reduce pump speed'],
    },
    {
        id: 'motor-winding',
        matchSets: [
            ['winding', 'temperature'],
            ['insulation', 'resistance'],
            ['motor', 'hot'],
        ],
        diagnosis: 'Motor winding insulation breakdown: winding temperature high and insulation resistance falling.',
        safetyStop: false,
        actions: ['Megger the windings', 'Check cooling airflow', 'Schedule a rewind'],
    },
    {
        id: 'motor-bearing',
        matchSets: [
            ['motor', 'vibration'],
            ['motor', 'bearing'],
        ],
        diagnosis: 'Motor bearing wear: vibration rising at the drive end.',
        safetyStop: false,
        actions: ['Trend drive-end vibration', 'Check lubrication', 'Schedule a bearing change'],
    },
    {
        id: 'compressor-valve',
        matchSets: [
            ['valve', 'leak'],
            ['discharge', 'temperature'],
            ['compressor', 'valve'],
        ],
        diagnosis: 'Compressor discharge valve leaking: discharge temperature high and capacity down.',
        safetyStop: false,
        actions: ['Check discharge temperature trend', 'Leak-test the valves', 'Replace the valve plate'],
    },
    {
        id: 'compressor-oil',
        matchSets: [
            ['compressor', 'oil'],
            ['oil', 'pressure'],
        ],
        diagnosis: 'Compressor oil pressure low: worn oil pump or clogged filter.',
        safetyStop: false,
        actions: ['Check oil pressure', 'Replace the oil filter', 'Inspect the oil pump'],
    },
    {
        id: 'fan-imbalance',
        matchSets: [
            ['fan', 'imbalance'],
            ['fan', 'vibration'],
        ],
        diagnosis: 'Fan impeller imbalance: vibration at running speed.',
        safetyStop: false,
        actions: ['Balance the impeller', 'Check for buildup on the blades', 'Trend vibration at running speed'],
    },
    {
        id: 'fan-belt',
        matchSets: [
            ['fan', 'belt'],
            ['belt', 'slip'],
        ],
        diagnosis: 'Fan drive belt slipping: airflow down and belt dust present.',
        safetyStop: false,
        actions: ['Check belt tension', 'Inspect for belt dust', 'Replace the belt'],
    },
];

export const SENSOR_RULE_SPECS: BenchRuleSpec[] = [
    {
        ruleId: 'pump-bearing',
        question: 'whether the vibration is highest at the bearing housing',
        checkTitle: 'Pump vibration spectrum check',
        checkLocation: 'pump bearing housing',
        checkMinutes: 30,
        checkParts: [],
        repairUsd: 900,
        safetyCritical: false,
    },
    {
        ruleId: 'pump-cavitation',
        question: 'whether the suction pressure is low',
        checkTitle: 'Pump suction pressure check',
        checkLocation: 'pump suction line',
        checkMinutes: 20,
        checkParts: [],
        repairUsd: 400,
        safetyCritical: false,
    },
    {
        ruleId: 'motor-winding',
        question: 'whether the winding temperature is high',
        checkTitle: 'Motor insulation resistance test',
        checkLocation: 'motor terminal box',
        checkMinutes: 40,
        checkParts: [],
        repairUsd: 2200,
        safetyCritical: false,
    },
    {
        ruleId: 'motor-bearing',
        question: 'whether the vibration is highest at the drive end',
        checkTitle: 'Motor drive-end vibration check',
        checkLocation: 'motor drive end',
        checkMinutes: 25,
        checkParts: [],
        repairUsd: 700,
        safetyCritical: false,
    },
    {
        ruleId: 'compressor-valve',
        question: 'whether the discharge temperature is high',
        checkTitle: 'Compressor valve leak test',
        checkLocation: 'compressor valve plate',
        checkMinutes: 35,
        checkParts: [],
        repairUsd: 1500,
        safetyCritical: false,
    },
    {
        ruleId: 'compressor-oil',
        question: 'whether the oil pressure is low',
        checkTitle: 'Compressor oil pressure check',
        checkLocation: 'compressor oil system',
        checkMinutes: 20,
        checkParts: [],
        repairUsd: 500,
        safetyCritical: false,
    },
    {
        ruleId: 'fan-imbalance',
        question: 'whether the vibration peaks at running speed',
        checkTitle: 'Fan impeller balance check',
        checkLocation: 'fan impeller',
        checkMinutes: 30,
        checkParts: [],
        repairUsd: 600,
        safetyCritical: false,
    },
    {
        ruleId: 'fan-belt',
        question: 'whether there is belt dust near the drive',
        checkTitle: 'Fan belt tension check',
        checkLocation: 'fan drive belt',
        checkMinutes: 15,
        checkParts: [],
        repairUsd: 120,
        safetyCritical: false,
    },
];

export const SENSOR_RULE_TABLE: BenchRuleTable = benchRuleTable(SENSOR_RULES, SENSOR_RULE_SPECS);

interface SensorCaseDefinition {
    scenario: EvalScenario;
    trueRuleId: string;
}

const SENSOR_CASES: SensorCaseDefinition[] = [
    {
        trueRuleId: 'pump-bearing',
        scenario: {
            id: 'sensor-pump-bearing',
            name: 'Pump Bearing Vibration',
            description: 'FailureSensorIQ lens: pump sensor to failure mode.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-sensor-pump-bearing',
                userQuery:
                    'Pump vibration 11 mm/s RMS at the bearing housing, bearing temperature 92C and rising, flow down 18%.',
                vehicleContext: { year: 2023, make: 'Plant', model: 'Centrifugal Pump P-101' },
            },
            ground_truth: {
                diagnosis:
                    'Bearing failure on the centrifugal pump: vibration 11 mm/s RMS with a rising bearing temperature.',
                requiredActions: [
                    'Trend the vibration spectrum',
                    'Check bearing temperature',
                    'Schedule a bearing replacement',
                ],
            },
            expected_behavior: { safety_stop_expected: false },
        },
    },
    {
        trueRuleId: 'motor-winding',
        scenario: {
            id: 'sensor-motor-winding',
            name: 'Motor Winding Temperature',
            description: 'FailureSensorIQ lens: motor sensor to failure mode.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-sensor-motor-winding',
                userQuery: 'Motor winding temperature 155C, insulation resistance falling, motor hot to the touch.',
                vehicleContext: { year: 2023, make: 'Plant', model: 'Electric Motor M-204' },
            },
            ground_truth: {
                diagnosis:
                    'Motor winding insulation breakdown: winding temperature high and insulation resistance falling.',
                requiredActions: ['Megger the windings', 'Check cooling airflow', 'Schedule a rewind'],
            },
            expected_behavior: { safety_stop_expected: false },
        },
    },
    {
        trueRuleId: 'compressor-valve',
        scenario: {
            id: 'sensor-compressor-valve',
            name: 'Compressor Discharge Valve Leak',
            description: 'FailureSensorIQ lens: compressor sensor to failure mode.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-sensor-compressor-valve',
                userQuery: 'Compressor discharge temperature 120C, capacity down 20%, valve leak suspected.',
                vehicleContext: { year: 2023, make: 'Plant', model: 'Air Compressor C-301' },
            },
            ground_truth: {
                diagnosis: 'Compressor discharge valve leaking: discharge temperature high and capacity down.',
                requiredActions: [
                    'Check discharge temperature trend',
                    'Leak-test the valves',
                    'Replace the valve plate',
                ],
            },
            expected_behavior: { safety_stop_expected: false },
        },
    },
    {
        trueRuleId: 'fan-imbalance',
        scenario: {
            id: 'sensor-fan-imbalance',
            name: 'Fan Impeller Imbalance',
            description: 'FailureSensorIQ lens: fan sensor to failure mode.',
            input: {
                userId: 'eval-user',
                sessionId: 'eval-sensor-fan-imbalance',
                userQuery: 'Fan vibration 8 mm/s at running speed, impeller buildup visible.',
                vehicleContext: { year: 2023, make: 'Plant', model: 'Cooling Fan F-402' },
            },
            ground_truth: {
                diagnosis: 'Fan impeller imbalance: vibration at running speed.',
                requiredActions: [
                    'Balance the impeller',
                    'Check for buildup on the blades',
                    'Trend vibration at running speed',
                ],
            },
            expected_behavior: { safety_stop_expected: false },
        },
    },
];

/** The four sensor-to-failure-mode snapshots, in definition order. */
export function loadSensorSnapshots(): CaseSnapshot[] {
    return SENSOR_CASES.map((entry) =>
        benchSnapshot(recordedCaseFromScenario(entry.scenario), SENSOR_RULE_TABLE, entry.trueRuleId),
    );
}
