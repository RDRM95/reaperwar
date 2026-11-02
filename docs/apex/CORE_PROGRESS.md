# CORE stage — progress log

Running log of the CORE stage of the V2 release (`docs/apex/WORK_BREAKDOWN.md` §1). One dated entry per task: what landed, test counts, deviations from the plan with reasons, and open issues for later chunks. Later CORE agents continue from the last entry and never redo landed work.

Baseline before CORE (2 November 2026, head `e914936`): `npm run typecheck` clean; `npx vitest run` → 10 files, **87 tests** passed in 52 s wall (the plan's "83 tests in 9 files" predates hotfix 0.11.1, which added `tests/custom.test.ts` with 4 tests). Three hotfixes sit on top of the plan's v0.11.0 snapshot and are preserved: 0.11.1 united fleets in custom battles (`CustomBattleInput.extraA/extraB`, `reinforcementFaction`, `countsForFaction`), 0.11.2 "nobody runs" (no fleet-wide 12 % auto-retreat, no automatic escape of damaged ships; tactical withdrawal to a station behind the line in `ai.ts`), 0.11.3 camera/HUD changes (`cameras.ts`, `battleView.ts`, `app.ts` `hudLevel`, `hud.ts`, `style.css` — not CORE files).

## 2026-11-02 — T1 Lints and scaffolding

Landed:
- `src/core/lint.ts`: `FORBIDDEN_WORDING` (the AP §7 regex), `forbiddenWording(text)`, `hadesWordingOk(text)` for stage D's `tests/wording.test.ts`. The source file never spells the forbidden phrase out; the positive examples live only in `tests/lint.test.ts`.
- `src/simulation/profile.ts`: `SimProfile` with `PROFILE_PHASES` (`reinforcements, fleets, ai, movement, housekeeping, carriers, weapons, projectiles, missiles, end`), an injected clock `now: () => number` defaulting to `() => 0`, `enabled = false` by default (every method a no-op, no clock read), `mark()/lap()/endStep()/reset()/split()/report()` and `phaseSum`. Not yet wired into `BattleSimulation` (T2 adds the `profile` field to the public surface, T8 measures with it).
- `tests/lint.test.ts` (5 tests): walks `src/simulation`, `src/data`, `src/timelines`, `src/scenarios`, `src/campaign`, `src/core`, `src/showcase/scenes` (when present) for `Math.random`, `Date.now`, `performance.now` (same regex as the §1.7 `git grep`), allow-listing exactly three sites by path and line pattern — `src/core/saves.ts` slot id, `src/campaign/engine.ts` campaign id, `src/simulation/profile.ts` clock injection line — and asserting each allow-list entry matches exactly one line, so a deleted or duplicated exception fails the test; plus the wording-helper assertions of §1.6.3.

Tests: 87 → 92 (11 files). Typecheck clean.

Deviations: none. Note for T8/T19: the allow-listed clock line is `now: () => number = () => 0; // injection point: …performance.now` — keep the trailing comment on that line (the lint pattern anchors on it) and inject the clock from the script as `profile.now = () => performance.now()`.
