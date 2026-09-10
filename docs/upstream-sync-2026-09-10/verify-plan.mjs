import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Read-only: never changes refs, index, files, databases, or network state.
function git(repo, args) {
  return spawnSync('git', ['--no-optional-locks', '-C', repo, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  })
}

function readPlan(directory) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
  return {
    state: read('state.json'),
    batches: read('batches.json'),
    upstream: read('upstream-ledger.json'),
    downstream: read('downstream-ledger.json'),
    features: read('preservation.json'),
  }
}

function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--final') ? 'final' : args.includes('--validate') ? 'validate' : 'status'
  if (args.includes('--final') && args.includes('--validate')) throw new Error('Choose one mode')
  let directory = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plan-dir' && args[i + 1]) {
      directory = path.resolve(args[++i])
    } else if (!['--validate', '--final'].includes(args[i])) {
      throw new Error('Unknown argument: ' + args[i])
    }
  }
  let data = readPlan(directory)
  let redirectedFrom = null
  const designated = path.resolve(data.state.integration.worktree)
  const canonical = path.join(designated, 'docs', 'upstream-sync-2026-09-10')
  if (mode !== 'validate' && path.resolve(directory) !== canonical && fs.existsSync(path.join(canonical, 'state.json'))) {
    const branch = git(designated, ['branch', '--show-current'])
    if (branch.status === 0 && branch.stdout.trim() === data.state.integration.branch) {
      redirectedFrom = directory
      directory = canonical
      data = readPlan(directory)
    }
  }
  const { state, batches, upstream, downstream, features } = data
  const errors = []
  const reconcile = []
  const shaPattern = /^[0-9a-f]{40}$/
  const entryStatuses = new Set(['pending', 'applying', 'conflicts', 'implemented', 'verifying', 'verified', 'blocked'])
  const resolutions = new Set(['applied', 'adapted', 'equivalent', 'superseded', 'preserved'])
  const requiredGates = ['upstream_behavior', 'downstream_preservation', 'backend_regression', 'relaykit_independence', 'frontend_regression', 'frontend_build', 'browser_acceptance', 'i18n', 'sqlite_migration', 'mysql_migration', 'postgres_migration', 'billing_reconciliation', 'provider_interop', 'task_plugin_migration', 'build_release', 'ancestry', 'downstream_main_merge']
  if (!['planned', 'in_progress', 'blocked', 'code_complete', 'completed'].includes(state.status)) errors.push('Invalid aggregate status')
  if (!Array.isArray(state.gates) || new Set(state.gates.map((gate) => gate.id)).size !== requiredGates.length || requiredGates.some((id) => !state.gates.some((gate) => gate.id === id))) errors.push('Required acceptance gates are missing or duplicated')
  for (const [name, value] of Object.entries({ batches, upstream, downstream, features })) {
    if (!Array.isArray(value)) throw new Error(name + ' must be an array')
  }
  for (const [key, value] of Object.entries(state.baseline)) {
    if (['downstream', 'origin', 'upstream', 'mergeBase'].includes(key) && !shaPattern.test(value)) errors.push('Invalid baseline SHA: ' + key)
  }
  const extra = state.additional_downstream_commits || []
  const originalUpstream = JSON.parse(fs.readFileSync(path.join(directory, 'evidence', 'baseline-review', 'inventory.json'), 'utf8'))
  const originalDownstream = JSON.parse(fs.readFileSync(path.join(directory, 'evidence', 'downstream-baseline.json'), 'utf8'))
  if (originalUpstream.head !== state.baseline.downstream || originalUpstream.upstream !== state.baseline.upstream) errors.push('Pinned scope differs from archived assessment')
  if (originalUpstream.commits.some((commit) => !upstream.some((row) => row.sha === commit.sha)) || upstream.some((row) => !originalUpstream.commits.some((commit) => commit.sha === row.sha))) errors.push('Upstream ledger differs from pinned 153-commit inventory')
  if (originalDownstream.commits.some((commit) => !downstream.some((row) => row.sha === commit.sha)) || downstream.some((row) => !originalDownstream.commits.some((commit) => commit.sha === row.sha) && !extra.includes(row.sha))) errors.push('Downstream ledger omits/replaces a protected baseline commit')
  for (const [name, list, key, expected] of [
    ['batches', batches, 'id', 20],
    ['upstream', upstream, 'sha', state.baseline.upstreamCommitCount],
    ['downstream', downstream, 'sha', state.baseline.downstreamCommitCount + extra.length],
    ['features', features, 'id', state.baseline.preservationCount],
  ]) {
    if (list.length !== expected) errors.push(name + ': unexpected count ' + list.length + ', expected ' + expected)
    if (new Set(list.map((row) => row[key])).size !== list.length) errors.push(name + ': duplicate IDs')
  }
  const batchMap = new Map(batches.map((row) => [row.id, row]))
  const featureIds = new Set(features.map((row) => row.id))
  const upstreamMap = new Map(upstream.map((row) => [row.sha, row]))
  const assignments = new Map()
  for (const batch of batches) {
    if (!['pending', 'in_progress', 'verified', 'blocked'].includes(batch.status)) errors.push('Invalid batch status: ' + batch.id)
    for (const dependency of batch.depends_on) if (!batchMap.has(dependency)) errors.push('Unknown dependency: ' + dependency)
    for (const sha of batch.upstreamCommits) {
      assignments.set(sha, (assignments.get(sha) || 0) + 1)
      if (upstreamMap.get(sha)?.batchId !== batch.id) errors.push('Wrong commit assignment: ' + batch.id + ' ' + sha)
    }
    if (new Set(batch.units.map((unit) => unit.id)).size !== batch.units.length) errors.push('Duplicate units: ' + batch.id)
    if (batch.status === 'verified' && batch.units.some((unit) => unit.status !== 'verified')) errors.push('Verified batch has unfinished units: ' + batch.id)
  }
  const visiting = new Set()
  const visited = new Set()
  function visit(id) {
    if (visiting.has(id)) { errors.push('Dependency cycle at ' + id); return }
    if (visited.has(id) || !batchMap.has(id)) return
    visiting.add(id)
    for (const dependency of batchMap.get(id).depends_on) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of batchMap.keys()) visit(id)
  for (const row of upstream) {
    if (!shaPattern.test(row.sha) || !entryStatuses.has(row.status)) errors.push('Invalid upstream row: ' + row.short)
    if (assignments.get(row.sha) !== 1) errors.push('Upstream commit must occur in exactly one batch: ' + row.short)
    if (!resolutions.has(row.plannedResolution)) errors.push('Unknown planned resolution: ' + row.short)
    if (row.status === 'verified' && (!resolutions.has(row.resolution) || !row.resolution_rationale || !row.resolution_commits.length)) errors.push('Verified upstream row lacks resolution: ' + row.short)
  }
  for (const row of downstream) {
    if (!shaPattern.test(row.sha) || !entryStatuses.has(row.status)) errors.push('Invalid downstream row: ' + row.short)
    if (!row.preservationIds.length || row.preservationIds.some((id) => !featureIds.has(id))) errors.push('Missing/invalid preservation mapping: ' + row.short)
    if (row.status === 'verified' && row.mapping_review !== 'verified') errors.push('Downstream mapping unreviewed: ' + row.short)
  }
  for (const row of features) if (!entryStatuses.has(row.status)) errors.push('Invalid feature status: ' + row.id)
  const current = batchMap.get(state.current_batch)
  if (!current || !current.units.some((unit) => unit.id === state.current_unit)) errors.push('Current batch/unit is invalid')
  if (!state.next_action?.trim()) errors.push('Missing next action')
  for (const name of ['PLAN.md', 'RESUME.md', 'PRESERVATION.md', 'CHECKPOINTS.md', 'DECISIONS.md']) {
    if (!fs.existsSync(path.join(directory, name))) errors.push('Missing document: ' + name)
  }
  const allRecords = [...upstream, ...downstream, ...features, ...batches]
  for (const row of allRecords) {
    if (row.status !== 'verified') continue
    if (!row.evidence?.length) errors.push('Verified row has no evidence: ' + (row.id || row.short))
    for (const evidence of row.evidence || []) {
      const resolved = path.resolve(directory, evidence)
      const relative = path.relative(directory, resolved)
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolved)) errors.push('Missing/outside evidence: ' + evidence)
    }
  }
  let live = null
  if (mode !== 'validate') {
    const repo = path.resolve(directory, '..', '..')
    const headResult = git(repo, ['rev-parse', 'HEAD'])
    if (headResult.status !== 0) throw new Error('Plan is not inside a readable Git working tree: ' + repo)
    const head = headResult.stdout.trim()
    const branch = git(repo, ['branch', '--show-current']).stdout.trim()
    const operations = []
    for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
      const result = git(repo, ['rev-parse', '--verify', '-q', name])
      if (result.status === 0) operations.push({ name, target: result.stdout.trim() })
    }
    for (const name of ['rebase-merge', 'rebase-apply', 'sequencer']) {
      const result = git(repo, ['rev-parse', '--git-path', name])
      if (result.status === 0 && fs.existsSync(path.resolve(repo, result.stdout.trim()))) operations.push({ name })
    }
    const statusResult = git(repo, ['status', '--porcelain=v1', '--untracked-files=normal'])
    const conflictsResult = git(repo, ['diff', '--name-only', '--diff-filter=U'])
    if (statusResult.status !== 0 || conflictsResult.status !== 0) errors.push('Failed to inspect index/worktree')
    live = { repository: repo, branch, head, operations, conflicts: conflictsResult.stdout.trim().split('\n').filter(Boolean), status: statusResult.stdout.trimEnd() }
    if (operations.length) reconcile.push('Git operation in progress; follow RESUME.md before starting another unit')
    if (state.active_operation && !operations.length) reconcile.push('Recorded operation is absent in Git; reconcile result before repeating it')
    if (state.last_observed_head !== head) {
      // A ledger commit cannot contain its own SHA. Accept only descendant
      // commits that change this plan, while still rejecting any code drift.
      const observed = state.last_observed_head
      const ancestor = shaPattern.test(observed || '') && git(repo, ['merge-base', '--is-ancestor', observed, head]).status === 0
      const planOnly = ancestor && git(repo, ['diff', '--quiet', observed, head, '--', '.', ':(exclude)docs/upstream-sync-2026-09-10/**']).status === 0
      if (!planOnly) reconcile.push('HEAD differs in code/history from last_observed_head; inspect commits and ledger')
    }
    if (state.integration.created && branch !== state.integration.branch && !(mode === 'final' && branch === 'main')) reconcile.push('Not on the recorded integration branch')
    if (!state.integration.created && fs.existsSync(designated)) reconcile.push('Designated worktree path exists; inspect before creating/reusing it')
    const tracked = git(repo, ['status', '--porcelain=v1', '--untracked-files=no']).stdout.trim()
    if (tracked) reconcile.push('Tracked modifications exist; preserve and reconcile with current unit')
    const untracked = git(repo, ['ls-files', '--others', '--exclude-standard']).stdout.trim().split('\n').filter(Boolean)
    const unexpected = untracked.filter((name) => !name.startsWith('docs/upstream-sync-2026-09-10/') && !name.startsWith('output/'))
    if (unexpected.length) reconcile.push('Untracked implementation/user files exist: ' + unexpected.join(', '))
    for (const ref of [state.baseline.upstream, state.baseline.downstream]) {
      if (git(repo, ['cat-file', '-e', ref + '^{commit}']).status !== 0) errors.push('Missing pinned commit: ' + ref)
    }
    if (mode === 'final') {
      if (state.status !== 'completed') errors.push('Plan status is not completed')
      if (allRecords.some((row) => row.status !== 'verified')) errors.push('Unfinished upstream/downstream/feature/batch rows remain')
      if (state.blockers.length) errors.push('Unresolved blockers remain')
      const tested = state.last_verified_code_commit
      if (!shaPattern.test(tested || '')) errors.push('Missing final verified code commit')
      else {
        const ancestry = git(repo, ['merge-base', '--is-ancestor', tested, head])
        const difference = git(repo, ['diff', '--quiet', tested, head, '--', '.', ':(exclude)docs/upstream-sync-2026-09-10/**'])
        if (ancestry.status !== 0 || difference.status !== 0) errors.push('HEAD differs in business code from final tested commit')
        for (const row of [...upstream, ...downstream, ...features]) {
          if (row.final_review?.status !== 'verified' || row.final_review?.commit !== tested) errors.push('Final review missing/stale: ' + (row.id || row.short))
        }
        for (const gate of state.gates) {
          if (gate.status !== 'verified' || gate.verified_commit !== tested || !gate.evidence.length) errors.push('Incomplete final gate: ' + gate.id)
          for (const evidence of gate.evidence) {
            const relative = path.relative(directory, path.resolve(directory, evidence))
            if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(path.resolve(directory, evidence))) errors.push('Missing/outside gate evidence: ' + evidence)
          }
        }
      }
      for (const ref of [state.baseline.upstream, state.baseline.downstream]) {
        if (git(repo, ['merge-base', '--is-ancestor', ref, head]).status !== 0) errors.push('Final history lacks pinned ancestor: ' + ref)
      }
      if (!shaPattern.test(state.final_merge_commit || '')) errors.push('Missing actual upstream merge commit')
      else {
        const parents = git(repo, ['show', '-s', '--format=%P', state.final_merge_commit])
        if (parents.status !== 0 || !parents.stdout.trim().split(' ').includes(state.baseline.upstream) || parents.stdout.trim().split(' ').length < 2) errors.push('Recorded upstream merge is not a real merge of the target')
        if (git(repo, ['merge-base', '--is-ancestor', state.final_merge_commit, head]).status !== 0) errors.push('Recorded merge is not in final history')
      }
      if (!shaPattern.test(state.final_downstream_commit || '') || git(repo, ['merge-base', '--is-ancestor', state.final_downstream_commit, 'main']).status !== 0 || git(repo, ['merge-base', '--is-ancestor', state.final_merge_commit || 'invalid-ref', state.final_downstream_commit || 'invalid-ref']).status !== 0) errors.push('Downstream main has not received the recorded integration')
      if (shaPattern.test(tested || '') && git(repo, ['diff', '--quiet', tested, 'main', '--', '.', ':(exclude)docs/upstream-sync-2026-09-10/**']).status !== 0) errors.push('Current downstream main business code has not received final validation')
      if (reconcile.length) errors.push('Git/checkpoint reconciliation still required')
    }
  }
  const readyBatches = batches.filter((batch) => batch.status === 'pending' && batch.depends_on.every((id) => batchMap.get(id)?.status === 'verified')).sort((a, b) => a.priority - b.priority).map((batch) => batch.id)
  console.log(JSON.stringify({ mode, planDirectory: directory, redirectedFrom, state: state.status, currentBatch: state.current_batch, currentUnit: state.current_unit, nextAction: state.next_action, counts: { upstream: upstream.length, downstream: downstream.length, features: features.length, batches: batches.length }, readyBatches, verified: { upstream: upstream.filter((row) => row.status === 'verified').length, downstream: downstream.filter((row) => row.status === 'verified').length }, live, errors, reconcile }, null, 2))
  process.exitCode = errors.length ? 1 : reconcile.length ? 2 : 0
}

try {
  main()
} catch (error) {
  console.error(JSON.stringify({ error: error.message }))
  process.exitCode = 1
}
