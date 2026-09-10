import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { read, save, head, checkpoint, repository, directory } from './ledger.mjs'

// Records a manually adapted patch without pretending a Git operation is active.
const [mode, unitOrSHA, shaOrRationale, rationale] = process.argv.slice(2)
const state = read('state.json')
const batches = read('batches.json')
const ledger = read('upstream-ledger.json')
const sha = mode === 'begin' ? shaOrRationale : unitOrSHA
const row = ledger.find(entry => entry.sha === sha)
if (!row || !['begin', 'finish'].includes(mode)) throw new Error('Expected begin UNIT SHA RATIONALE or finish SHA RATIONALE')
const batch = batches.find(entry => entry.id === row.batchId)
const git = args => spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true })
for (const ref of ['CHERRY_PICK_HEAD', 'MERGE_HEAD', 'REVERT_HEAD']) {
  if (git(['rev-parse', '--verify', '-q', ref]).status === 0) throw new Error(`Existing Git operation: ${ref}`)
}
if (state.active_operation || git(['diff', '--quiet', '--', '.', ':(exclude)docs/upstream-sync-2026-09-10/**']).status !== 0 || git(['diff', '--cached', '--quiet']).status !== 0) {
  throw new Error('Reconcile recorded operation or uncommitted source/index first')
}
const commit = head()
if (mode === 'begin') {
  if (row.status !== 'pending' || state.manual_adaptation || !unitOrSHA.startsWith(batch.id + '.') || !rationale) throw new Error('Invalid or already active adaptation')
  if (batch.depends_on.some(id => batches.find(entry => entry.id === id)?.status !== 'verified')) throw new Error('Unverified prerequisite')
  const evidence = `evidence/runs/${unitOrSHA}-${row.short}`
  fs.mkdirSync(path.join(directory, evidence), { recursive: false })
  const files = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).stdout.trim().split('\n')
  save(`${evidence}/intent.json`, { upstream: sha, unit: unitOrSHA, before_head: commit, rationale, files })
  let unit = batch.units.find(entry => entry.id === unitOrSHA)
  if (!unit) {
    unit = { id: unitOrSHA, action: row.subject, status: 'pending', upstreamCommits: [] }
    batch.units.push(unit)
  }
  unit.status = 'applying'
  unit.upstreamCommits = [...new Set([...(unit.upstreamCommits || []), sha])]
  batch.status = 'in_progress'
  row.status = 'applying'
  state.current_batch = batch.id
  state.current_unit = unitOrSHA
  state.manual_adaptation = { target: sha, unit: unitOrSHA, before_head: commit, evidence }
  state.next_action = `Adapt ${sha}: ${rationale}; retain progress if interrupted.`
  checkpoint(`${unitOrSHA} adaptation begun`, `- Before HEAD: ${commit}.\n- Upstream: ${sha}.\n- ${rationale}\n- Evidence: ${evidence}/intent.json.`)
} else {
  const operation = state.manual_adaptation
  if (operation?.target !== sha || !shaOrRationale || commit === operation.before_head || !git(['log', '-1', '--format=%B']).stdout.includes(sha)) throw new Error('HEAD must identify the recorded adapted upstream SHA')
  const markers = git(['grep', '-n', '-E', '^(<<<<<<< |=======|>>>>>>> )', '--', '*.go', '*.ts', '*.tsx', '*.mjs', '*.json'])
  if (markers.status !== 1) throw new Error('Source contains conflict markers or marker inspection failed: ' + markers.stdout)
  const files = git(['diff', '--name-only', operation.before_head, commit]).stdout.trim().split('\n')
  const evidence = `${operation.evidence}/resolution.json`
  save(evidence, { upstream: sha, before_head: operation.before_head, after_head: commit, files, rationale: shaOrRationale })
  Object.assign(row, { status: 'implemented', resolution: 'adapted', resolution_commits: [commit], resolution_rationale: shaOrRationale, evidence: [...(row.evidence || []), evidence] })
  batch.codeCommits = [...new Set([...batch.codeCommits, commit])]
  batch.units.find(entry => entry.id === operation.unit).status = 'verifying'
  state.manual_adaptation = null
  state.next_action = `${operation.unit}: verify adapted behavior before acceptance.`
  checkpoint(`${operation.unit} adaptation recorded`, `- Code: ${commit}.\n- ${shaOrRationale}\n- Evidence: ${evidence}.\n- Verification remains pending.`)
}
state.last_observed_head = commit
state.updatedAt = new Date().toISOString()
save('upstream-ledger.json', ledger)
save('batches.json', batches)
save('state.json', state)
console.log(JSON.stringify({ upstream: sha, status: row.status, head: commit, next: state.next_action }))
