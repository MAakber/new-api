import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { read, save, head, checkpoint, directory, repository } from './ledger.mjs'

// One inspected commit per invocation; failures preserve Git's recovery state.
const [unitId, sha] = process.argv.slice(2)
const state = read('state.json')
const batches = read('batches.json')
const upstream = read('upstream-ledger.json')
const row = upstream.find((entry) => entry.sha === sha)
const batch = batches.find((entry) => entry.id === row?.batchId)
if (!row || !batch || !unitId?.startsWith(batch.id + '.')) throw new Error('Unknown upstream commit/unit')
if (row.status !== 'pending') throw new Error('Commit already has recorded work; reconcile instead of reapplying')
if (batch.depends_on.some((id) => batches.find((entry) => entry.id === id)?.status !== 'verified')) throw new Error('Unverified batch prerequisite')
const git = (args) => spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
for (const operation of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
  if (git(['rev-parse', '--verify', '-q', operation]).status === 0) throw new Error('Existing Git operation: ' + operation)
}
if (git(['diff', '--quiet', '--', '.', ':(exclude)docs/upstream-sync-2026-09-10/**']).status !== 0 || git(['diff', '--cached', '--quiet']).status !== 0) throw new Error('Uncommitted source/index changes; reconcile first')
const filesResult = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha])
if (filesResult.status !== 0) throw new Error('Cannot inspect patch paths')
const files = filesResult.stdout.trim().split('\n').filter(Boolean)
if (files.some((file) => file.startsWith('web/src/i18n/locales/'))) throw new Error('Locale commits require scripted translation adaptation, not direct cherry-pick')
let unit = batch.units.find((entry) => entry.id === unitId)
if (!unit) {
  unit = { id: unitId, action: row.subject, status: 'pending', upstreamCommits: [] }
  batch.units.push(unit)
}
const before = head()
const runDir = path.join(directory, 'evidence/runs', unitId + '-' + row.short)
fs.mkdirSync(runDir, { recursive: false })
const evidencePath = path.relative(directory, runDir).replaceAll('\\', '/')
state.current_batch = batch.id
state.current_unit = unitId
state.last_observed_head = before
state.updatedAt = new Date().toISOString()
state.active_operation = { kind: 'cherry-pick', target: sha, before_head: before, unit: unitId }
state.next_action = `Apply inspected ${sha}; preserve any conflict state, then validate affected behavior.`
batch.status = 'in_progress'
unit.status = 'applying'
unit.upstreamCommits = [...new Set([...(unit.upstreamCommits || []), sha])]
row.status = 'applying'
save('state.json', state)
save('batches.json', batches)
save('upstream-ledger.json', upstream)
checkpoint(`${unitId} applying ${row.short}`, `- Before HEAD: ${before}.\n- Upstream: ${sha} — ${row.subject}.\n- Reviewed paths: ${files.join(', ')}.\n- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.`)
const result = git(['cherry-pick', '-x', sha])
fs.writeFileSync(path.join(runDir, 'output.log'), result.stdout + result.stderr)
const after = head()
const conflicts = git(['diff', '--name-only', '--diff-filter=U']).stdout.trim().split('\n').filter(Boolean)
save(`${evidencePath}/result.json`, { upstream: sha, unit: unitId, before_head: before, after_head: after, command: ['git', 'cherry-pick', '-x', sha], exit_code: result.status, conflicts, files })
if (result.status === 0) {
  row.status = 'implemented'
  row.resolution = 'applied'
  row.resolution_commits = [after]
  row.resolution_rationale = 'Inspected upstream patch applied with original SHA retained; behavior verification pending.'
  row.evidence = [...(row.evidence || []), `${evidencePath}/result.json`]
  state.active_operation = null
  unit.status = 'verifying'
  batch.codeCommits = [...new Set([...batch.codeCommits, after])]
  state.next_action = `${unitId}: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.`
} else {
  row.status = conflicts.length ? 'conflicts' : 'blocked'
  state.next_action = `${unitId}: reconcile failed cherry-pick using ${evidencePath}; do not restart or abort automatically.`
}
state.last_observed_head = after
state.updatedAt = new Date().toISOString()
save('state.json', state)
save('batches.json', batches)
save('upstream-ledger.json', upstream)
checkpoint(`${unitId} ${row.status}`, `- Result: exit ${result.status}; HEAD ${after}.\n- Conflicts: ${conflicts.join(', ') || 'none'}.\n- Evidence: ${evidencePath}/result.json.\n- Next: ${state.next_action}`)
console.log(result.stdout + result.stderr)
console.log(JSON.stringify({ unit: unitId, upstream: sha, status: row.status, head: after, conflicts }))
process.exitCode = result.status === 0 ? 0 : 1
