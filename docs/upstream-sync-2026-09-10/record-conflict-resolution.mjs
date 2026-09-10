import { spawnSync } from 'node:child_process'
import { read, save, head, checkpoint, repository } from './ledger.mjs'

// Record a reviewed resolution only after Git has completed its cherry-pick.
const [sha, rationale] = process.argv.slice(2)
const state = read('state.json')
const batches = read('batches.json')
const ledger = read('upstream-ledger.json')
const row = ledger.find(entry => entry.sha === sha)
const operation = state.active_operation
if (!row || !rationale || operation?.kind !== 'cherry-pick' || operation.target !== sha) {
  throw new Error('Expected the recorded cherry-pick and a concrete resolution rationale')
}
const git = args => spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true })
for (const ref of ['CHERRY_PICK_HEAD', 'MERGE_HEAD', 'REVERT_HEAD']) {
  if (git(['rev-parse', '--verify', '-q', ref]).status === 0) throw new Error(`Git operation remains: ${ref}`)
}
const commit = head()
const message = git(['log', '-1', '--format=%B'])
if (message.status !== 0 || !message.stdout.includes(sha) || commit === operation.before_head) {
  throw new Error('HEAD does not identify the completed upstream cherry-pick')
}
if (git(['diff', '--quiet', '--', '.', ':(exclude)docs/upstream-sync-2026-09-10/**']).status !== 0 || git(['diff', '--cached', '--quiet']).status !== 0) {
  throw new Error('Uncommitted source or index remains')
}
const evidence = `evidence/runs/${operation.unit}-${row.short}/resolution.json`
save(evidence, { upstream: sha, before_head: operation.before_head, after_head: commit, rationale, recorded_at: new Date().toISOString() })
Object.assign(row, {
  status: 'implemented', resolution: 'adapted',
  resolution_commits: [...new Set([...(row.resolution_commits || []), commit])],
  resolution_rationale: rationale,
  evidence: [...new Set([...(row.evidence || []), evidence])],
})
const batch = batches.find(entry => entry.id === row.batchId)
batch.codeCommits = [...new Set([...batch.codeCommits, commit])]
batch.units.find(entry => entry.id === operation.unit).status = 'verifying'
Object.assign(state, { active_operation: null, last_observed_head: commit, updatedAt: new Date().toISOString(), next_action: `${operation.unit}: validate resolved behavior and continue remaining inspected units.` })
save('upstream-ledger.json', ledger)
save('batches.json', batches)
save('state.json', state)
checkpoint(`${operation.unit} conflict resolution recorded`, `- Code: ${commit}.\n- ${rationale}\n- Evidence: ${evidence}.\n- Behavior verification remains pending.`)
console.log(JSON.stringify({ upstream: sha, commit, status: row.status }))
