// Decision-theoretic diagnostic loop (LM-04): ranked differential,
// cost-based next test, challenger, stop/escalate. Pure: every number
// traces to a prior, a test rate, or a recorded result.
export * from './types';
export * from './hypotheses';
export * from './update';
export * from './informationGain';
export * from './planner';
export * from './stop';
export * from './loop';
export * from './workup';
