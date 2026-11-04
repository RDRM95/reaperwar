# Continuation plan — how to carry the V2 release to the finish from a fresh session

Written 2 Nov 2026 by the lead session while its context was nearly full. Everything below is enough for a new session (or this one after compaction) to continue without any memory of the conversation.

## Where things are

- Repository `RDRM95/reaperwar`, branch `claude/mass-effect-reaper-war-simulator-fidrz2` (all work), `main` = what is deployed to https://rdrm95.github.io/reaperwar/ by `.github/workflows/deploy.yml` on push. Recovery checkpoint: commit `e914936` (v0.11.3 + final plan). Hotfixes 0.11.1–0.11.3 (united custom fleets, no-retreat tactical withdrawal, free follow-orbit camera, HUD none level) are live.
- The plan: `docs/V2_CINEMATIC_BRIEF.md` (§1–§10, owner requirements), `docs/apex/ADOPTION_PLAN.md` (every decision and number), `docs/apex/WORK_BREAKDOWN.md` (stages, ownership, interfaces, tests, acceptance), `docs/apex/INTEGRATION_NOTES.md` (owner requirements added after the plan: SSV Omaha standoff, coordinated HADES salvos, regression suites, likeness bar), `docs/design/SCALE_REFERENCE.md`.
- Progress logs the agents keep: `docs/apex/CORE_PROGRESS.md`, `docs/apex/STAGE_<A|B|C|D>_PROGRESS.md`, `docs/apex/CALIBRATION_REPORT.md`, `docs/apex/PERF_LADDER.md`.

## The pipeline (multi-agent workflows; Fable 5.1 preferred by the owner)

1. **CORE** — script `~/.claude/projects/-home-user-reaperwar/<session>/workflows/scripts/apex-v2-core-wf_2f3d7476-5c1.js`, run id `wf_2f3d7476-5c1` (six sequential chunks T1–T20 with a verifier after each, then acceptance). Each task commits and pushes the branch. If a run fails on a usage limit, resume with `Workflow({scriptPath, resumeFromRunId: 'wf_2f3d7476-5c1'})` once the window resets (completed agents replay from cache). If the script file is gone, re-author it from `WORK_BREAKDOWN.md §1` with the same chunking; the CORE_PROGRESS.md log tells any new agent what already landed.
2. **Stages A–D in parallel worktrees** — launch `Workflow({script: <contents of docs/apex/workflows/stages-abcd.js>})` after CORE acceptance passes. Stage A carries the likeness pass (brief §10). Stage branches `stage/A..D` stay local (the proxy refuses tag pushes and the owner's rule is to push only the integration branch).
3. **Integration and release** — `docs/apex/workflows/integration-release.js`: merges A→B→C→D, resolves INTEGRATION_NOTES, runs all suites, the perf ladder (`npm run perf:sim`, `npm run perf`), screenshots and the silhouette lock, bumps to 1.0.0, pushes the branch.
4. **Deploy** — the lead fast-forwards `main` (`git fetch origin main && git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main`); the Pages workflow deploys; verify with `gh api repos/RDRM95/reaperwar/deployments?environment=github-pages` → latest status `success` and `environment_url`. The sandbox cannot load github.io directly; report that.

## State on 2 Nov, 18:00 UTC (lead update after compaction)

- The CORE run was found dead (killed at 01:40 by a usage-limit interruption after T1 landed, commit `5f529ba`); relaunched at 17:50 with `Workflow({scriptPath, resumeFromRunId: 'wf_2f3d7476-5c1'})` (task `wu5vxppr1`). Chunk 1 re-runs T2–T4 (T1 is landed; CORE_PROGRESS.md says so).
- Owner requirement added meanwhile: brief **§15** (standalone stealth classes: unique `normandy_sr2` and the "SR-2-pattern stealth frigate"; IES stealth model silent/revealed/venting with the hunter doctrine; the movement **animation** layer for stage A). Recorded in INTEGRATION_NOTES.md (binding for every chunk from 2 on) and in the chunk notes of the CORE script and the stage prompts of `docs/apex/workflows/stages-abcd.js`.
- A second workflow prepares stage D documents while CORE runs: `apex-v2-stage-d-prep` (run `wf_2f8b94ec-2bf`, script `~/.claude/projects/-home-user-reaperwar/<session>/workflows/scripts/apex-v2-stage-d-prep-wf_2f8b94ec-2bf.js`), writing `docs/apex/CHARACTER_BIBLE.md`, `docs/apex/CONTINUITY_CHECKLIST.md` and the `docs/design/` sheets + `silhouettes.json` in worktrees `/home/user/reaperwar-Dprep` (branch `stage/D-prep`) and `/home/user/reaperwar-Dprep2` (`stage/D-prep-sheets`, merged into `stage/D-prep` at the end). **When it finishes:** in the main checkout, `git merge --no-ff stage/D-prep` (docs only; retry if the CORE agent's index is busy), push the branch, then `git worktree remove /home/user/reaperwar-Dprep && git branch -d stage/D-prep`. Do this before launching stages A–D so B finds the real bible and D continues the sheets (D then fills proportion tables and writes the tests/e2e/codex of §5.3).
- Stage scripts: `stages-abcd.js` agents run with `isolation: 'worktree'`; the prompt tells them to create `../reaperwar-<X>` on `stage/<X>` per §0.1 — if an agent instead works in the orchestrator's temporary worktree, its report names the real path and branch; the integration agent must merge whatever branches the reports name (pass them via `args` if they differ from `stage/A..D`).

## State on 2 Nov, 18:40 UTC — three workflows running

| Run | What | Worktree / branch | When it finishes |
| --- | --- | --- | --- |
| `wf_2f3d7476-5c1` (CORE) | T1–T20 + acceptance; T1, T2 landed | main checkout, integration branch | launch stages B, C, D |
| `wf_2f8b94ec-2bf` (D-prep) | character bible, continuity checklist, design sheets | `/home/user/reaperwar-Dprep` → `stage/D-prep` | merge `stage/D-prep` into the integration branch, push, remove worktree |
| `wf_c90f6423-5b9` (graphics plan) | renderer audits, baseline shots `docs/graphics/before`, `scripts/compare-shots.mjs`, `docs/apex/GRAPHICS_OVERHAUL_PLAN.md` (brief §16) | `/home/user/reaperwar-Gplan` → `stage/G-plan` | merge into the integration branch, push; patch the stage A and B prompts in `docs/apex/workflows/stages-abcd.js` from the plan's §9; then launch stage A alone (`args: { only: ['A'] }`) in parallel with CORE |

Owner requirements added today and binding everywhere: brief §15 (stealth classes, animation layer) and §16 (graphics and cinematic overhaul in three phases; CORE adds a tick-stamped order log for deterministic replay). Stage A may start before CORE finishes because `src/rendering/**` and `src/audio/**` are not CORE-owned and the T2 integration stubs are already on the branch; stage A merges the integration branch into `stage/A` before it finishes. Stages B, C, D start after CORE acceptance. Then `integration-release.js` with `args: { branches: [...] }`, the before/after comparison, the perf ladder, 1.0.0, the `main` fast-forward and the deployment check.

## State on 3 Nov, 21:15 UTC — budget policy and the order of programmes

- **The binding constraint is the account's 5-hour usage window, roughly 1.5 M subagent tokens per window.** Three workflows in parallel exhausted two windows and lost most in-flight work twice (agents killed mid-task restart from scratch; only committed work survives). Policy from now on: **one workflow at a time**, CORE first; every agent commits as soon as a deliverable is complete; resume with `resumeFromRunId` when a window ends (the `Workflow` failure notice names the reset time).
- CORE chunk 1 (T1–T4) is complete and pushed (`65ff043`, 107 unit tests). The CORE run `wf_2f3d7476-5c1` continues with chunk 2 (T5–T7).
- Paused, to resume **after CORE acceptance**, in this order: (1) D-prep `wf_2f8b94ec-2bf` (bible draft and eight sheets sit uncommitted in `/home/user/reaperwar-Dprep` and `-Dprep2`; the prompts tell the agents to complete them); (2) the graphics plan `wf_c90f6423-5b9` (nothing written yet; worktree `/home/user/reaperwar-Gplan` exists); (3) stages B, C, D and a V2-scoped stage A (WORK_BREAKDOWN §2 + brief §10/§15; the full §16 overhaul comes later); (4) integration, 1.0.0, deploy.
- **Programmes after 1.0.0, in the owner's priority order:** V2.1 Extreme Scale (brief §17; plan it with `Workflow({script: <docs/apex/workflows/extreme-scale-plan.js>})`, then staged implementation workflows from the plan's last section), then V2.2 Graphics and cinematic overhaul (brief §16; `docs/apex/GRAPHICS_OVERHAUL_PLAN.md` from the graphics plan run), then V2.3 System theatre (§13), V2.4 Alternate Timelines (§14); pinned: local-hardware build (§18), Collectors, First Contact War, non-eezo, Multiverse.
- Owner requirements recorded today: brief §17 (extreme scale; CORE builds the seams now, see INTEGRATION_NOTES) and §18 (local hardware, pinned).

## Owner decision, 3 Nov 21:30 UTC — the playable build is the only priority

The owner: "you have full workflow auth, playable build is only priority, I leave the rest to you." Consequences:

1. **CORE runs alone** until acceptance (one workflow at a time; resume on every window reset).
2. **Intermediate playable deploys.** After CORE chunk 3 (T8–T10: spatial grid, 3D formations and platforms, the movement rewrite) and after chunk 4 (T11–T13: Oculus, Reaper AI, beats/volley/flagship events), the lead runs `npm run build && npx playwright test` in the main checkout while the agent is between tasks (tree clean); if green, bump the patch version, fast-forward `main` and verify the deployment. New classes render with the T2 role-based placeholder models until stage A lands; that is acceptable for an intermediate build and is noted in the changelog.
3. **1.0.0 scope is trimmed to what playing needs**, in this order after CORE: stage C (custom battle v2 screen, briefing rows, results banner — the old screen only works minimally after T17), stage A-lite (models for the nine new classes incl. Normandy and SSV Omaha variants, the Reaper palette and scale, hull-shaped barriers, HADES/volley/arrival effects and audio, governor tiers applied, the animation layer of brief §15.3), stage B-lite (HUD simplification above 48 hulls, independent overlay toggle, flagship banner and priority comms, volley control, Record mode, the shot-list camera driver, Cinematics mode with the Final Battle scene and the Apex Refuse scene only), stage D-lite (codex entries for the new classes, README/CHANGELOG/KNOWN_ISSUES, the e2e specs). Then integration, 1.0.0, deploy.
4. **Deferred past 1.0.0** (in this order): the remaining cinematic scenes and the full character bible (D-prep run `wf_2f8b94ec-2bf` stays paused; its drafts are in the worktrees), the design-sheet lock-down and likeness loop, the graphics overhaul plan (`wf_c90f6423-5b9`, paused; brief §16), the extreme-scale programme (brief §17), System theatre, Alternate Timelines, the local-hardware build.
5. The stage prompts in `docs/apex/workflows/stages-abcd.js` are the full-scope prompts; for the 1.0.0 run pass `args: { only: [...] }` and prepend the "lite" scope paragraph from item 3 (write it into the script's COMMON before launching).

## Model policy, 4 Nov — Fable weekly budget at 96 %

The owner's Fable weekly maximum is nearly spent. Every workflow agent after CORE chunk 1 now runs on **Opus 5.5** (`model: 'claude-opus-5-5'` in the CORE script; add the same override to the stage, integration and planning scripts before launching them). The lead session itself still runs on Fable: keep its turns short (no polling, no narration), and if the owner wants the lead off Fable too, switching the session model is their call — every plan document is written so that any model can continue.

## Operating rules learned the hard way

- Usage windows: five-hour limits and a separate Fable limit interrupt long workflows; every agent must commit green checkpoints so resumes lose nothing. Never let an agent push `main`; never force-push or rebase; stage branches are merged by INTEGRATION only.
- Keep the repo tree clean between turns (a stop hook demands commits): commit agents' doc files with explicit paths, never `git add -A` while agents are mid-task.
- Tests are the contract: `npm run typecheck && npx vitest run && npm run build && npx playwright test` (one Playwright process; port 4173). Fix at the source; never weaken assertions.
- The code is the truth over the plan's line numbers; re-grep symbols.

## Definition of done (from the owner)

Cinematic ME3-style battles (staggered battlegroups, escort screens, organic movement, no cubes); Reapers press and never retreat; dreadnought standoff incl. SSV Omaha; stable targeting/arcs/cohesion; HADES internal nuclear detonations with coordinated salvos and polished effects/audio; better cameras, silhouettes, lighting and feedback; united custom fleets, no caps; Oculus; Showcase mode; regression suites for non-retreat, engagement ranges, sustained combat and cohesion; version 1.0.0 live on Pages with an honest changelog, test counts, final commit and limitations.
