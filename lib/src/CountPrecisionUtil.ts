import { CountPrecision } from "./main";

export function leastPrecise(a: CountPrecision, b: CountPrecision): CountPrecision {
    if (a === CountPrecision.GREATER_THAN || b === CountPrecision.GREATER_THAN) return CountPrecision.GREATER_THAN;

    if (a === CountPrecision.APPROXIMATE || b === CountPrecision.APPROXIMATE) return CountPrecision.APPROXIMATE;

    return CountPrecision.EXACT;
}
