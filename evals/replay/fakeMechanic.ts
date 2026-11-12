/**
 * Deterministic fake mechanic for CI: a keyword rule table, not a model.
 * The same evidence always gives the same diagnosis, so replay is
 * reproducible on every machine with no credentials and no network.
 * Safety rules come first: a hazard must stop before any other rule can
 * claim the case.
 */

export interface FakeDiagnosis {
    ruleId: string;
    diagnosis: string;
    safetyStop: boolean;
    actions: string[];
    confidence: number;
}

interface FakeRule {
    id: string;
    /** One set matching is enough; every keyword in the set must appear. */
    matchSets: string[][];
    diagnosis: string;
    safetyStop: boolean;
    actions: string[];
}

const RULES: FakeRule[] = [
    {
        id: 'fuel-leak',
        matchSets: [['gasoline'], ['petrol'], ['gas', 'fumes'], ['fuel', 'smell'], ['fuel', 'leak']],
        diagnosis: 'Immediate safety hazard: Fuel leak.',
        safetyStop: true,
        actions: ['Stop engine immediately', 'Evacuate vehicle', 'Do not smoke or use open flames near vehicle'],
    },
    {
        id: 'hv-cable',
        matchSets: [
            ['orange', 'cable'],
            ['orange', 'wire'],
            ['high', 'voltage'],
        ],
        diagnosis: 'Critical Safety Risk: High Voltage Orange Cables.',
        safetyStop: true,
        actions: [
            'DO NOT TOUCH orange cables',
            'Keep hands away from high voltage components',
            'Contact professional EV technician',
        ],
    },
    {
        id: 'alternator',
        matchSets: [
            ['battery', 'light'],
            ['serpentine', 'belt'],
        ],
        diagnosis: 'Alternator failure or snapped serpentine belt.',
        safetyStop: false,
        actions: ['Check serpentine belt', 'Test alternator output voltage', 'Check battery terminals'],
    },
    {
        id: 'cam-phaser',
        matchSets: [
            ['rattling', 'cold', 'start'],
            ['rattle', 'cold'],
        ],
        diagnosis: 'Common cam phaser rattle, likely covered under Ford Customer Satisfaction Program 21N03.',
        safetyStop: false,
        actions: ['Check for active recalls/TSBs', 'Contact Ford dealer for cam phaser replacement'],
    },
    {
        id: 'brake-pads',
        matchSets: [
            ['squeal', 'brake'],
            ['squealing', 'brake'],
        ],
        diagnosis: 'Worn brake pads hitting the wear indicator (chirper).',
        safetyStop: false,
        actions: ['Inspect brake pad thickness', 'Check rotors for scoring', 'Check brake fluid level'],
    },
    {
        id: 'overheating',
        matchSets: [['steam'], ['temperature', 'red']],
        diagnosis: 'Engine overheating, likely due to a coolant leak (common water outlet failure on this model).',
        safetyStop: false,
        actions: ['Turn off engine', 'Do not open radiator cap while hot', 'Pressure test cooling system'],
    },
    {
        id: 'starter-click',
        matchSets: [
            ['clicking', 'start'],
            ['clicking', 'key'],
        ],
        diagnosis: 'Low battery voltage or poor terminal connection causing starter solenoid chatter.',
        safetyStop: false,
        actions: ['Jump start vehicle', 'Test battery voltage', 'Clean battery terminals'],
    },
    {
        id: 'tire-balance',
        matchSets: [
            ['shakes', '60mph'],
            ['shakes', '60'],
        ],
        diagnosis: "Unbalanced front tires or potentially 'Death Wobble' components wear.",
        safetyStop: false,
        actions: ['Balance tires', 'Rotate tires', 'Inspect steering damper and tie rods'],
    },
    {
        id: 'turbo-oil',
        matchSets: [['blue', 'smoke']],
        diagnosis: 'Oil burning, likely due to failing turbocharger seals or piston rings.',
        safetyStop: false,
        actions: ['Check oil level', 'Inspect turbo inlet for oil', 'Perform compression test'],
    },
    {
        id: 'cv-joint',
        matchSets: [
            ['sharp', 'turn'],
            ['grinding', 'turn'],
        ],
        diagnosis: 'Failing CV (Constant Velocity) joint.',
        safetyStop: false,
        actions: ['Inspect CV boots for tears', 'Check for grease spray in wheel well', 'Replace CV axle'],
    },
    {
        id: 'oil-life-reset',
        matchSets: [
            ['oil', 'life'],
            ['reset', 'oil'],
        ],
        diagnosis: 'Reset procedure via the infotainment screen or steering wheel buttons.',
        safetyStop: false,
        actions: ['Navigate to Settings > Vehicle', 'Select Maintenance Info', 'Reset Oil Life'],
    },
    {
        id: 'eps-failure',
        matchSets: [['steering', 'heavy']],
        diagnosis: 'Potential Electronic Power Steering (EPS) failure, check for OTA (Over-The-Air) recall updates.',
        safetyStop: false,
        actions: [
            'Check Tesla App for software updates',
            'Contact Tesla service',
            'Do not drive if steering is unsafe',
        ],
    },
    {
        id: 'misfire',
        matchSets: [['misfire']],
        diagnosis:
            'Recurring misfire. If coils were replaced last time, could be high-pressure fuel pump or carbon buildup.',
        safetyStop: false,
        actions: [
            'Review history from previous repair',
            'Check spark plug condition',
            'Perform walnut blasting for carbon cleanup',
        ],
    },
    {
        id: 'brake-fluid',
        matchSets: [['brake', 'fluid'], ['dot 3'], ['dot 4']],
        diagnosis:
            'Physical reality (reservoir cap) typically overrides generic manual data for fluid types. Use DOT 4 as specified on the cap.',
        safetyStop: false,
        actions: ['Use DOT 4 fluid as specified on the cap', 'Flush system if wrong fluid was used'],
    },
    {
        id: 'death-wobble',
        matchSets: [
            ['death', 'wobble'],
            ['shakes', 'violently'],
            ['violently', 'bump'],
        ],
        diagnosis:
            'Classic Death Wobble. Manual might suggest simple alignment, but community consensus prioritizes steering damper and track bar torque.',
        safetyStop: false,
        actions: ['Torque track bar bolts to spec', 'Inspect steering damper', 'Check ball joints for play'],
    },
    {
        id: 'def-sensor',
        matchSets: [['exhaust', 'fluid'], ['def']],
        diagnosis: 'DEF (Diesel Exhaust Fluid) sensor failure or contaminated DEF.',
        safetyStop: false,
        actions: ['Drain DEF tank', 'Replace NOx sensors', 'Perform forced DPF regeneration'],
    },
    {
        id: 'hybrid-fan',
        matchSets: [
            ['hybrid', 'battery', 'cooling'],
            ['hybrid', 'cooling'],
        ],
        diagnosis: 'Clogged hybrid battery cooling fan filter.',
        safetyStop: false,
        actions: ['Locate intake vent in back seat', 'Clean or replace fan filter', 'Check for fan obstruction'],
    },
    {
        id: 'transmission-slip',
        matchSets: [
            ['transmission', 'revs'],
            ['2nd', '3rd'],
        ],
        diagnosis: 'Transmission slipping, likely a failing shift solenoid or worn internal clutches.',
        safetyStop: false,
        actions: [
            'Check transmission fluid level and color',
            'Scan for OBD-II codes (P0700 series)',
            'Inspect solenoid screen for debris',
        ],
    },
    {
        id: 'sunroof-drain',
        matchSets: [
            ['carpet', 'soaked'],
            ['sunroof', 'drain'],
            ['soaked', 'rain'],
        ],
        diagnosis: 'Clogged sunroof drain tubes (common on VW models).',
        safetyStop: false,
        actions: [
            'Locate drain outlets in wheel wells',
            'Clear debris with compressed air or weed whacker line',
            'Dry interior to prevent mold',
        ],
    },
    {
        id: 'vess',
        matchSets: [
            ['humming', 'spaceship'],
            ['spaceship', 'sound'],
            ['humming', 'low', 'speed'],
        ],
        diagnosis: 'Normal operation: Virtual Engine Sound System (VESS) for pedestrian safety.',
        safetyStop: false,
        actions: ['No repair needed', 'Verify VESS speaker is not obstructed'],
    },
];

export const UNCERTAIN_DIAGNOSIS: FakeDiagnosis = {
    ruleId: 'uncertain',
    diagnosis: 'Highly uncertain. Consult human mechanic.',
    safetyStop: false,
    actions: ['Consult human mechanic'],
    confidence: 0.2,
};

/** First matching rule wins; no rule matches means the uncertain fallback. */
export function diagnoseEvidence(evidence: string): FakeDiagnosis {
    const lowered = evidence.toLowerCase();
    for (const rule of RULES) {
        const matched = rule.matchSets.some((keywords) => keywords.every((keyword) => lowered.includes(keyword)));
        if (!matched) {
            continue;
        }
        return {
            ruleId: rule.id,
            diagnosis: rule.diagnosis,
            safetyStop: rule.safetyStop,
            actions: [...rule.actions],
            confidence: 0.85,
        };
    }
    return { ...UNCERTAIN_DIAGNOSIS, actions: [...UNCERTAIN_DIAGNOSIS.actions] };
}
