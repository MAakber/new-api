import fs from 'node:fs'
import path from 'node:path'
import { read, save, head, checkpoint, directory } from './ledger.mjs'

const required = ['B16-bun-toolchain', 'B16-web-dependencies', 'B16-web-build-stamped', 'B16-build-config-lint', 'B16-web-copyright', 'B16-electron-dependencies-mirror', 'B16-electron-graph', 'B16-release-config-final', 'B16-windows-backend', 'B16-binary-version', 'B16-version-wsl', 'B16-electron-windows-task-cache', 'B16-packaged-artifacts']
const runs = required.map(id => {
  const evidence = `evidence/runs/${id}/result.json`
  const result = read(evidence)
  if (result.status !== 'passed' || result.exit_code !== 0) throw new Error(`Unpassed ${id}`)
  return { id, evidence, tested_commit: result.tested_commit }
})
const code = head()
const batches = read('batches.json')
const batch = batches.find(item => item.id === 'B16')
if (batch.status !== 'in_progress') throw new Error('B16 already closed or not started')
save('evidence/B16-acceptance.json', {
  status: 'verified', code_commit: code, runs,
  artifacts: 'evidence/B16-artifacts.json', configuration: 'evidence/B16-release-configuration.json',
  version_contract: 'Shared UTC date/eight-character commit local version, exact triggering release tag, actual Go linker package and frontend import.meta.env build substitution verified.',
  platforms: 'Windows x64 NSIS and portable packaging passed. Existing macOS/Linux targets and license resources match baseline; those platforms were not built on this Windows host.',
  local_environment: 'Electron runtime installed with checksum-verified process-local mirror. Builder reused installed runtime. D-drive task-local ELECTRON_BUILDER_CACHE/TEMP/TMP resolved Windows EXDEV. No global configuration changes; publish never.',
  retained_failures: ['B16-electron-dependencies', 'B16-electron-install-retry', 'B16-electron-windows', 'B16-electron-windows-local-runtime', 'B16-release-config'],
  git_bash: 'Windows Git Bash had a host fork error; WSL executed the real shared version script successfully. No unrelated process terminated.',
  final_acceptance: 'B17 real merge and B18 final candidate acceptance remain required.'
})
batch.status = 'verified'
batch.codeCommits = [...new Set([...batch.codeCommits, '82eb859a19d80550b633d0c6d6ba8254e6fa3db3', code])]
batch.evidence = [...new Set([...batch.evidence, 'evidence/B16-acceptance.json'])]
batch.nextAction = 'B17: execute a real merge of the fixed upstream and review conflicts plus automatic merge changes.'
for (const unit of batch.units) {
  unit.status = 'verified'
  unit.evidence = [...new Set([...(unit.evidence || []), 'evidence/B16-acceptance.json'])]
}
const upstream = read('upstream-ledger.json')
for (const row of upstream.filter(item => item.batchId === 'B16')) {
  if (row.status !== 'implemented') throw new Error(`Unexpected source status ${row.sha}`)
  row.status = 'verified'
  row.evidence = [...new Set([...row.evidence, 'evidence/B16-acceptance.json'])]
}
const state = read('state.json')
state.current_batch = 'B17'
state.current_unit = 'B17.1'
state.last_verified_code_commit = code
state.last_observed_head = code
state.next_action = batch.nextAction
state.updatedAt = new Date().toISOString()
save('batches.json', batches)
save('upstream-ledger.json', upstream)
save('state.json', state)
checkpoint('B16 verified; all 153 upstream adaptations accepted at stage level', `Code ${code}. Windows NSIS and portable artifacts built; packaged backend, desktop source, version and all license files verified. B17 real merge and final 153/120/26 acceptance remain. No publishing or production changes.`)
fs.appendFileSync(path.join(directory, 'DECISIONS.md'), '\n## A32 — Preserve release and desktop build contracts\n\nLocal builds retain UTC date and eight-character revision; release builds use the exact triggering tag. Windows worktree paths are converted only in WSL, and both frontend and Go executable embed the resulting version. Existing platform targets and license resources are retained. Windows packaging used a task-local cache to avoid a host EXDEV cache failure, and reused the checksum-verified installed Electron runtime. No publishing, deployment, global toolchain change or unrelated process termination was performed.\n')
console.log(JSON.stringify({ batch: 'B16', status: batch.status, code, verified_upstream: upstream.filter(row => row.status === 'verified').length }))
