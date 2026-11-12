// Labor/parts cost model (LM-36): prices one bench run in dollars.
//
// The pricing is the LM-04 loop's own cost function (testCostUsd): labor
// minutes at the shop rate, parts consumed by the test, downtime while
// the vehicle is out of service, and risk priced by safety class. The
// bench does not keep a second cost model that could drift from the
// engine — it sums the engine's per-test breakdowns and adds the repair
// the run committed to. Totals are what the bench report scores.
import { testCostUsd, type CostBreakdown, type TestDefinition, type TestLibrary } from '@lemonade/core';

/** The priced cost of one bench run: every test the loop ordered, plus the repair it committed to. */
export interface RunCost {
    laborUsd: number;
    partsUsd: number;
    downtimeUsd: number;
    riskUsd: number;
    repairUsd: number;
    totalUsd: number;
    testsPriced: number;
}

function zeroBreakdown(): CostBreakdown {
    return { laborUsd: 0, partsUsd: 0, downtimeUsd: 0, riskUsd: 0, totalUsd: 0 };
}

/** Prices the completed tests through the loop's cost function and adds the committed repair. */
export function priceRun(completedTests: TestDefinition[], library: TestLibrary, repairUsd: number): RunCost {
    const summed = completedTests.reduce((accumulator, test) => {
        const priced = testCostUsd(test, library);
        return {
            laborUsd: accumulator.laborUsd + priced.laborUsd,
            partsUsd: accumulator.partsUsd + priced.partsUsd,
            downtimeUsd: accumulator.downtimeUsd + priced.downtimeUsd,
            riskUsd: accumulator.riskUsd + priced.riskUsd,
            totalUsd: accumulator.totalUsd + priced.totalUsd,
        };
    }, zeroBreakdown());
    return {
        ...summed,
        repairUsd,
        totalUsd: summed.totalUsd + repairUsd,
        testsPriced: completedTests.length,
    };
}

export function formatRunCost(cost: RunCost): string {
    return (
        `$${cost.totalUsd.toFixed(0)} (labor $${cost.laborUsd.toFixed(0)}, parts $${cost.partsUsd.toFixed(0)}, ` +
        `downtime $${cost.downtimeUsd.toFixed(0)}, risk $${cost.riskUsd.toFixed(0)}, ` +
        `repair $${cost.repairUsd.toFixed(0)}, ${cost.testsPriced} tests)`
    );
}
