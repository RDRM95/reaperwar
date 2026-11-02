/**
 * Performance budget and governor (ADOPTION_PLAN.md §21; WORK_BREAKDOWN.md
 * §1.3.10). Pure data and functions: the controller measures, the renderer
 * applies, the simulation never reads any of it. This file lands in two
 * steps: the budget shape here (so preferences and the App stub typecheck),
 * the governor ladder, `budgetFromLadder`, `refineBudget`, `ladderParams` and
 * `perfWarning` in the budget/governor task (T18). Nothing here is a cap:
 * budgets only warn, and the player may override every warning.
 */
export interface PerfBudget {
  liveHullsPerSide: number;
  smallCraftPerSide: number;
  source: 'default' | 'measured';
  measuredAt?: string;
  machine?: string;
}

export const DEFAULT_PERF_BUDGET: PerfBudget = { liveHullsPerSide: 400, smallCraftPerSide: 160, source: 'default' };
