export const meta = {
  name: 'apex-v2-integration-release',
  description: 'Merge stage/A→B→C→D into the integration branch, resolve notes, run the full suites, perf ladder, screenshots, silhouettes, release 1.0.0 (push branch; main fast-forward is done by the lead)',
  phases: [{ title: 'Integrate' }, { title: 'Verify' }, { title: 'Release' }],
}
const REPO = '/home/user/reaperwar'
const BRANCH = 'claude/mass-effect-reaper-war-simulator-fidrz2'
const R = { type: 'object', properties: { commits: { type: 'array', items: { type: 'string' } }, green: { type: 'boolean' }, unitTests: { type: 'number' }, e2eTests: { type: 'number' }, perfGate: { type: 'string' }, notes: { type: 'string' } }, required: ['commits', 'green', 'unitTests', 'e2eTests', 'perfGate', 'notes'] }
const STAGE_BRANCHES = (args && Array.isArray(args.branches) && args.branches.length) ? args.branches : ['stage/A', 'stage/B', 'stage/C', 'stage/D']
log(`merging in order: ${STAGE_BRANCHES.join(' → ')}`)
phase('Integrate')
const integ = await agent(`You are the INTEGRATION agent for the V2 release in ${REPO} on ${BRANCH} (main checkout). Follow docs/apex/WORK_BREAKDOWN.md §6 exactly: merge the stage branches ${STAGE_BRANCHES.join(', ')} in that order with --no-ff (branches exist locally; their worktrees may still exist under /home/user/reaperwar-*; remove a worktree with git worktree remove --force before deleting nothing — keep the branches), resolve the §6.2 hot spots by the stated rules, resolve every bullet in docs/apex/INTEGRATION_NOTES.md as its own commit, run §6.3 (npm ci, typecheck, V2_MODELS=1 npm test, build, test:e2e), §6.4 perf ladder (write docs/apex/PERF_LADDER.md; if the 300-vs-100 gate fails apply the ADOPTION_PLAN §21.5 levers and record), §6.5 screenshots and silhouette lock, §6.6 final checks (version 1.0.0, CHANGELOG with the §7 matrix ticked, README perf sentence). Rules: never force-push, never rebase, push only ${BRANCH} (git push -u origin ${BRANCH}) after each green milestone; never push main. Fix failures at the source; never disable or weaken a test. Report honestly.`, { label: 'integration', phase: 'Integrate', schema: R })
if (!integ) throw new Error('integration agent failed; resume to retry')
phase('Verify')
const V = { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fix-needed'] }, findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string' }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'where', 'problem', 'fix'] } } }, required: ['verdict', 'findings'] }
const checks = await parallel([
  () => agent(`Release verifier (engineering) for ${REPO} on ${BRANCH}: re-run npm run typecheck, V2_MODELS=1 npx vitest run, npm run build, npm run test:e2e and npm run perf:sim; grep for Math.random in sim/data/timelines/scenarios/campaign/core/showcase/rendering/audio; check no hull cap exists; confirm docs/apex/PERF_LADDER.md numbers match a fresh run within noise. Report pass or fix-needed.`, { label: 'verify:engineering', phase: 'Verify', schema: V }),
  () => agent(`Release verifier (product) for ${REPO} on ${BRANCH}: walk WORK_BREAKDOWN.md §7 row by row and the owner requirements in docs/apex/INTEGRATION_NOTES.md and brief §8–§10; take screenshots (scripts/cinematic-shots.mjs) and judge likeness, formations (no cubes, staggered battlegroups, escort screens), no retreat, standoff, HADES salvos, Showcase scene, custom united fleets, flagship banner. Any unmet requirement is a finding. Report pass or fix-needed.`, { label: 'verify:product', phase: 'Verify', schema: V }),
])
const findings = checks.filter(Boolean).flatMap((c) => c.findings.filter((f) => f.severity !== 'minor'))
phase('Release')
const release = await agent(`Release fixer for ${REPO} on ${BRANCH}: ${findings.length ? `fix these verified findings at the source (never weaken tests): ${JSON.stringify(findings)}; then` : 'no findings remain;'} re-run the full suites (typecheck, V2_MODELS=1 unit, build, e2e, perf:sim), make sure CHANGELOG.md 1.0.0 is complete and honest (verified-by list, limitations), commit and push ${BRANCH}. Do not push main. Report final commit SHA, test counts and limitations.`, { label: 'release', phase: 'Release', schema: R })
if (!release) throw new Error('release agent failed; resume to retry')
return { integ, findings, release }
