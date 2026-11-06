/**
 * Cross-engine determinism pins (ARCHITECTURE.md: replay = re-simulation, bit-identical). `BattleSimulation
 * .positionDigest()` of the canon Battle of Earth, seed 42, at tick 600 (30 s): pinned in Node by
 * tests/battlegroups.test.ts and recomputed in the browser by e2e/game.spec.ts, so the battle the owner watches is the
 * battle the tests, the calibration pins and `npm run sim` measure. A change to the simulation that moves any hull in
 * the first 30 s changes it: re-pin it with the reason in the commit message.
 */
export const DIGEST_PIN = { scenario: 'battle_of_earth', rules: 'canon_me3', seed: 42, tick: 600, digest: 'c662140e' } as const;
