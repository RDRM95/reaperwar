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

## Operating rules learned the hard way

- Usage windows: five-hour limits and a separate Fable limit interrupt long workflows; every agent must commit green checkpoints so resumes lose nothing. Never let an agent push `main`; never force-push or rebase; stage branches are merged by INTEGRATION only.
- Keep the repo tree clean between turns (a stop hook demands commits): commit agents' doc files with explicit paths, never `git add -A` while agents are mid-task.
- Tests are the contract: `npm run typecheck && npx vitest run && npm run build && npx playwright test` (one Playwright process; port 4173). Fix at the source; never weaken assertions.
- The code is the truth over the plan's line numbers; re-grep symbols.

## Definition of done (from the owner)

Cinematic ME3-style battles (staggered battlegroups, escort screens, organic movement, no cubes); Reapers press and never retreat; dreadnought standoff incl. SSV Omaha; stable targeting/arcs/cohesion; HADES internal nuclear detonations with coordinated salvos and polished effects/audio; better cameras, silhouettes, lighting and feedback; united custom fleets, no caps; Oculus; Showcase mode; regression suites for non-retreat, engagement ranges, sustained combat and cohesion; version 1.0.0 live on Pages with an honest changelog, test counts, final commit and limitations.
