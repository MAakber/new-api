// Consolidates existing evidence; does not execute tests or change application code.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { read, save, head, checkpoint, directory, repository } from '../ledger.mjs'

const candidate = '33398851f677845f450b9cf6f7af546d5a218e0c'
const merge = 'd46dec4abad83d575d7a7d74558508c898b0193b'
const recordedAt = new Date().toISOString()
assert.equal(head(), candidate, 'Run only at the reviewed candidate, before ledger commits')
function git(args) {
  const r = spawnSync('git', ['--no-optional-locks', '-C', repository, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
  })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}
assert.equal(git(['diff', '--name-only', candidate, '--', '.', ':(exclude)docs/upstream-sync-2026-09-10/**']), '')
const state = read('state.json')
const upstream = read('upstream-ledger.json')
const downstream = read('downstream-ledger.json')
const features = read('preservation.json')
const batches = read('batches.json')
const ancestry = new Set(git(['rev-list', candidate]).split('\n'))
for (const ref of [state.baseline.downstream, state.baseline.upstream, merge]) assert(ancestry.has(ref))
assert(git(['show', '-s', '--format=%P', merge]).split(' ').includes(state.baseline.upstream))
const equivalence = read('evidence/B18-source-equivalence.json')
assert.equal(equivalence.candidate, candidate)
assert.deepEqual(git(['diff', '--name-only', merge, candidate, '--', '.', ':(exclude)docs/upstream-sync-2026-09-10/**']).split('\n'), equivalence.test_only_delta)
const backend = read('evidence/B18-backend-regression.json')
assert.equal(backend.status, 'passed')
assert.equal(backend.candidate, candidate)

const passedIds = ['B18-web-regression', 'B18-web-format', 'B18-web-typecheck', 'B18-web-lint',
  'B18-web-build', 'B18-web-copyright', 'B18-i18n-literals', 'B18-relaykit-build',
  'B18-relaykit-test', 'B18-backend-build', 'B18-controller-cleanup-recheck', 'B18-vitest-discovery']
const receipts = passedIds.map(id => {
  const evidence = `evidence/runs/${id}/result.json`
  const result = read(evidence)
  assert.equal(result.status, 'passed', id)
  assert.equal(result.exit_code, 0, id)
  assert(ancestry.has(result.tested_commit), id)
  assert(fs.existsSync(path.join(directory, path.dirname(evidence), result.log)), id)
  return { id, evidence, tested_commit: result.tested_commit, status: result.status }
})
const webLog = fs.readFileSync(path.join(directory, 'evidence/runs/B18-web-regression/output.log'), 'utf8')
assert(/Test Files\s+210 passed \(210\)/.test(webLog))
assert(/Tests\s+1531 passed \(1531\)/.test(webLog))
const discovered = fs.readFileSync(path.join(directory, 'evidence/runs/B18-vitest-discovery/output.log'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(line => line.replace(/^\[[^\]]+\]\s*/, ''))
assert.equal(discovered.length, 210)
assert.equal(new Set(discovered).size, 210)
const passedPackages = new Set([...backend.unchanged_passed_packages, 'github.com/QuantumNous/new-api/controller'])
const allTests = [...new Set(features.flatMap(f => f.existingTests))]
const webTests = allTests.filter(file => file.startsWith('web/'))
const goTests = allTests.filter(file => file.endsWith('.go'))
for (const file of allTests) assert(fs.existsSync(path.join(repository, file)), file)
for (const file of webTests) assert(discovered.includes(file.slice(4)), file)
for (const file of goTests) {
  assert(!/^\/\/go:build/m.test(fs.readFileSync(path.join(repository, file), 'utf8')), file)
  assert(passedPackages.has('github.com/QuantumNous/new-api/' + path.posix.dirname(file)), file)
}
const blobs = new Map(git(['ls-tree', '-r', candidate]).split('\n').map(line => {
  const [metadata, file] = line.split('\t')
  return [file, metadata.split(' ')[2]]
}))
const mergeReview = read('evidence/B17-file-review.json')
assert.equal(mergeReview.entries.length, 326)
assert(mergeReview.entries.every(row => row.status === 'reviewed' && row.resolution))

const browserChecks = [
  { id: 'fresh_setup_login', result: 'passed', detail: 'Fresh isolated SQLite setup and real UI login; repeated login on the final private page.' },
  { id: 'independent_editors', result: 'passed', detail: 'Two editors retained independent channel IDs, names, URLs and models; 22 unique control IDs; saved B then A and reopened A.' },
  { id: 'window_interaction', result: 'passed', detail: 'Real mouse drag, focus/z-index activation, scrolling and keyboard close button.' },
  { id: 'saved_disabled_queue', result: 'passed', detail: 'Previously saved queue settings were disabled and edited; enabled=false and the edited message survived save and reopen.' },
  { id: 'downstream_channel_controls', result: 'passed', detail: 'Client identity/version, queue, custom balance/check-in, ignore-balance-ban, append-key and sensitive-key verification controls present.' },
  { id: 'profile_security', result: 'passed_in_local_scope', detail: 'Avatar/profile controls, sessions, mandatory IP audit and named Passkey entry flow present. Disabled Passkey configuration correctly blocked the sensitive operation; no real ceremony or OAuth.' },
  { id: 'wallet_redemption', result: 'passed_in_local_scope', detail: 'Synthetic balance displayed; registration/subscription reward variants retained. Missing fresh-install compliance confirmation correctly blocked redemption/transfers; no legal confirmation made.' },
  { id: 'task_plugins', result: 'passed_in_local_scope', detail: 'Ten factory plugins rendered; no live provider task submitted.' },
  { id: 'theme', result: 'passed', detail: 'Dark theme persisted through navigation and reload; light profile/login checked.' },
  { id: 'mobile_editor', result: 'passed', detail: '390x844 editor stayed inside viewport; body scrolled and footer controls stayed usable; Tab and keyboard close worked.' },
  { id: 'mobile_drawing', result: 'passed_in_local_scope', detail: 'Canvas, toolbar and empty state rendered at 390x844 in dark mode. Real image generation is an external gate.' },
  { id: 'mobile_profile_login', result: 'passed', detail: 'Document width exactly 390; username-to-password keyboard order. Stable light profile screenshot has no open dialog.' },
]
const browserArtifacts = fs.readdirSync(path.join(directory, 'evidence/B18-browser')).sort().map(name => {
  const relative = `evidence/B18-browser/${name}`
  const data = fs.readFileSync(path.join(directory, relative))
  return { path: relative, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') }
})
save('evidence/B18-browser-acceptance.json', {
  status: 'verified', scope: 'Local UI acceptance only', candidate, recorded_at: recordedAt,
  runtime_source: merge, browser: 'Playwright, isolated local context', base_url: 'http://localhost:43118',
  data: 'Fresh synthetic accounts and two disabled synthetic channels; no production data or provider credentials in evidence.',
  backend_version: 'v20260911-d46dec4a', frontend_version: 'rv.v20260911-d46dec4a.2k6e8r7p',
  checks: browserChecks, artifacts: browserArtifacts,
  artifact_notes: ['B18-profile-mobile-light.png captured a theme-panel transition; use B18-profile-mobile-light-stable.png for final visual review. Both retained.'],
  harness_notes: ['Window activation reorders DOM; drag checks used stable aria-labelledby identity.',
    'A never-enabled new queue draft is intentionally omitted as in baseline; persistence was checked on previously saved configuration.',
    'Default browser page was shared by another task. Acceptance used an owned context; the final stable profile recapture used a fresh owned context after the prior page disappeared.'],
  limitations: ['No real provider calls, paid requests, production changes, hardware Passkey/OAuth ceremony or legal confirmation.',
    'Synthetic localhost favicon targets were absent; their connection failures do not exercise upstream availability.'],
})

// Reviewed behavior-to-evidence mapping; it does not claim online-provider success.
const specs = [
  ['D01', ['B04','B07','B14'], '61 identity, Responses conversion, image/tool/session and stream contracts retained.', ['provider_interop','production_snapshot']],
  ['D02', ['B04','B07','B14'], '62, count_tokens, client headers/beta and context/tool/thinking contracts retained.', ['provider_interop','production_snapshot']],
  ['D03', ['B04','B07','B14'], '63 request identity, system/compact handling, continuation and Chat/Responses conversions retained.', ['provider_interop','production_snapshot']],
  ['D04', ['B07','B14'], '64 URL/authentication/model dispatch and Vercel relay contracts retained.', ['provider_interop','production_snapshot']],
  ['D05', ['B07','B12','B14'], 'Model selection, fetch preferences, missing-model confirmation and append-key payloads retained; two-channel saving checked in browser.', ['provider_interop','production_snapshot']],
  ['D06', ['B07','B15'], 'Independent window instances, saved form identity, real drag, activation, mobile scroll and keyboard close verified.', []],
  ['D07', ['B07','B10'], 'Existing scheduled/passive modes, diagnostics, queue/cancel and new concurrency contracts retained.', ['provider_interop']],
  ['D08', ['B07'], 'Stable client-version filtering, template fallback and per-channel override contracts retained.', ['provider_interop','production_snapshot']],
  ['D09', ['B07'], 'Previously saved disabled queue configuration survives; existing Codex/system-prompt and queue/cancel contracts retained without reviving reverted changes.', ['provider_interop','production_snapshot']],
  ['D10', ['B07'], 'Custom balance, random check-in and ignore-auto-ban contracts retained; settings controls visible.', ['provider_interop','production_snapshot']],
  ['D11', ['B08','B09'], 'Auto-sync persistence, upstream interception, sensitive-word/UA bans and audit contracts retained.', ['production_snapshot']],
  ['D12', ['B08','B10'], 'Per-user RPM remains additive to existing limits; automatic groups/retries and self-profile restrictions covered.', ['production_snapshot']],
  ['D13', ['B08','B11'], 'Login proxy and atomic registration-code completion retained; fresh login checked, no live OAuth claimed.', ['production_snapshot']],
  ['D14', ['B08','B11'], 'Multiple named credentials and scoped verification retained; Passkey UI moved into security center. Existing-identity fixture coverage plus local entry-flow check.', ['production_snapshot']],
  ['D15', ['B08','B13'], 'Raw request diagnostics, truncation/redaction, role projections and log/date behavior retained.', ['production_snapshot']],
  ['D16', ['B08','B13'], 'Private avatar authorization, OAuth import and cache isolation contracts retained; profile/avatar UI rendered.', ['production_snapshot']],
  ['D17', ['B09','B15'], 'Global/default/personal theme precedence and old storage contracts retained; dark navigation/reload and light mobile rendering checked.', ['production_snapshot']],
  ['D18', ['B03','B09','B15'], 'Public banner/interval/visibility and login/header contracts retained; mobile light/dark and keyboard checked.', ['production_snapshot']],
  ['D19', ['B09','B13'], 'Availability history fallback, ranking permissions and user usage semantics retained.', ['production_snapshot']],
  ['D20', ['B10','B11','B13'], 'Registration/subscription/balance rewards, CSV and batch-management contracts retained; concurrent accounting fixtures and reward controls covered.', ['production_snapshot']],
  ['D21', ['B11','B12'], 'Balance-tier boundaries, daily idempotency/timezone and reward-limit contracts retained across wallet expansion.', ['production_snapshot']],
  ['D22', ['B04','B15'], 'History-before-send, batched search/tools, stream errors, cancellation and existing no-round-cap policy retained.', ['provider_interop']],
  ['D23', ['B03','B15'], 'Image routes/auth/billing, editing/masks/references/retry and account-isolated canvas persistence contracts retained; mobile canvas rendered.', ['provider_interop']],
  ['D24', ['B15','B17'], 'Shared inputs/dialog contracts and seven-locale keys retained; all protected frontend paths discovered in final 210-file suite.', []],
  ['D25', ['B16'], 'Date/SHA and release-tag version contracts, Windows worktree packaging, license resources and project/author identity retained; platform limits recorded.', []],
  ['D26', ['B04','B10','B11','B14'], 'Input bounds, explicit zeros, checked saturation/audit, ratio guards and accounting contracts retained; independent relaykit build/test and database fixtures covered.', ['production_snapshot']],
]
const scope = 'Final candidate code and local contract review; production-snapshot and live-provider gates remain separate and unresolved'
const featureReviews = []
for (const [id, stageIds, conclusion, externalGates] of specs) {
  const feature = features.find(row => row.id === id)
  assert(feature, id)
  if (id === 'D14') {
    feature.baseline_sourcePaths = [...feature.sourcePaths]
    feature.sourcePaths = feature.sourcePaths.map(file => file === 'web/src/features/profile/components/passkey-card.tsx'
      ? 'web/src/features/security/components/passkey-card.tsx' : file)
    feature.source_relocations = [{ from: 'web/src/features/profile/components/passkey-card.tsx',
      to: 'web/src/features/security/components/passkey-card.tsx', reason: 'B08 security-center integration retains named multi-Passkey management' }]
  }
  for (const file of feature.sourcePaths) assert(fs.existsSync(path.join(repository, file)), file)
  const stageEvidence = stageIds.flatMap(id => fs.existsSync(path.join(directory, `evidence/${id}-acceptance.json`))
    ? [`evidence/${id}-acceptance.json`] : batches.find(b => b.id === id).evidence)
  const tests = feature.existingTests.map(file => ({ file, blob: blobs.get(file),
    evidence: file.startsWith('web/') ? 'evidence/runs/B18-web-regression/result.json' : 'evidence/B18-backend-regression.json',
    discovery: file.startsWith('web/') ? 'evidence/runs/B18-vitest-discovery/result.json' : 'Referenced Go file has no build constraints and its package is covered by combined final regression' }))
  assert(tests.every(test => test.blob), id)
  const review = { id, title: feature.title, status: 'verified', candidate, scope, conclusion,
    external_gate_ids: externalGates, stage_ids: stageIds, stage_evidence: stageEvidence,
    source_paths: feature.sourcePaths, source_relocations: feature.source_relocations || [], tests,
    merge_review_files: mergeReview.entries.filter(entry => entry.preservation_ids.includes(id)).map(entry => entry.file),
    browser_evidence: 'evidence/B18-browser-acceptance.json', source_equivalence: 'evidence/B18-source-equivalence.json' }
  featureReviews.push(review)
  feature.status = 'verified'
  feature.coverageReview = `B18: ${allTests.length} distinct protection files retained; ${webTests.length} frontend paths all included in 210-file/1531-test run. Go package results plus focused controller cleanup rechecks and existing real-engine matrices. See B18-preservation-review.json; external gates are not passed.`
  feature.evidence = [...new Set([...feature.evidence, ...stageEvidence, 'evidence/B18-preservation-review.json'])]
  feature.final_review = { status: 'verified', commit: candidate, scope, conclusion,
    evidence: ['evidence/B18-preservation-review.json'], unresolved_external_gates: externalGates }
}
save('evidence/B18-preservation-review.json', {
  status: 'verified', scope, candidate, recorded_at: recordedAt,
  baseline_mapping: 'evidence/runs/B00-002/downstream-mapping-review.json',
  counts: { features: 26, downstream_commits: 120, distinct_test_files: allTests.length,
    go_test_files: goTests.length, frontend_test_files: webTests.length, discovered_frontend_files: 210, passed_frontend_tests: 1531 },
  method: 'Review existing behavior mappings, retained tests, final suite inclusion, merge decisions, stage evidence and final source equivalence; file existence alone is not behavioral proof.',
  reviews: featureReviews, backend: 'evidence/B18-backend-regression.json',
  external_limitations: ['No sanitized production snapshot', 'No authorized real provider configuration/calls'],
})
for (const row of upstream) {
  assert.equal(row.status, 'verified', row.short)
  assert(row.resolution_commits.length && row.resolution_commits.every(ref => ancestry.has(ref)), row.short)
  for (const evidence of row.evidence) assert(fs.existsSync(path.join(directory, evidence)), evidence)
  row.evidence = [...new Set([...row.evidence, 'evidence/B18-local-acceptance.json'])]
  row.final_review = { status: 'verified', commit: candidate, scope,
    evidence: ['evidence/B17-merge-review.json', 'evidence/B18-local-acceptance.json'],
    resolution_commits_in_history: true, unresolved_external_gates: ['production_snapshot','provider_interop'] }
}
for (const row of downstream) {
  assert.equal(row.mapping_review, 'verified', row.short)
  assert(ancestry.has(row.sha), row.short)
  const protections = row.preservationIds.map(id => features.find(feature => feature.id === id))
  assert(protections.length && protections.every(feature => feature?.status === 'verified'), row.short)
  row.status = 'verified'
  row.evidence = [...new Set([...row.evidence, 'evidence/B18-preservation-review.json'])]
  row.final_review = { status: 'verified', commit: candidate, scope,
    preservationIds: row.preservationIds, evidence: ['evidence/B18-preservation-review.json'],
    baseline_commit_in_history: true,
    unresolved_external_gates: [...new Set(protections.flatMap(feature => feature.final_review.unresolved_external_gates))] }
}

const executable = 'D:/10178/Projects/new-api-upstream-sync-backup-2026-09-10/B18-local-acceptance/new-api.exe'
const exeHash = crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex')
assert.equal(exeHash, 'e9a9259851b943163fb9cd05fd84086511dbbe5943e8d86aad285c7b184c6476')
save('evidence/B18-local-acceptance.json', {
  status: 'verified', scope, candidate, merge_commit: merge, recorded_at: recordedAt,
  implementation: { upstream_rows: upstream.length, resolution_counts: upstream.reduce((counts, row) => {
    counts[row.resolution] = (counts[row.resolution] || 0) + 1; return counts
  }, {}), downstream_rows: downstream.length, preservation_rows: features.length, merge_file_reviews: 326 },
  successful_receipts: receipts, backend_combined: 'evidence/B18-backend-regression.json',
  backend_limitation: 'No single all-root run fully green. Root passed packages plus controller final run and same-candidate targeted cleanup rechecks compose acceptance. Original failures and external-DSN skips retained.',
  frontend: { files: 210, tests: 1531, protected_distinct_files: webTests.length, omitted_protected_files: [] },
  database_evidence: ['evidence/B11-acceptance.json','evidence/B12-acceptance.json','evidence/B13-acceptance.json','evidence/B14-acceptance.json'],
  database_engines: ['SQLite 3.41.2 upgrade fixtures; 3.50.4 current wallet/controller tests','MariaDB 11.4.4','MySQL 5.7.44','PostgreSQL 9.6.24'],
  database_reuse: 'B14-to-candidate migration/driver inputs and Go modernization reviewed in B18-source-equivalence.json; final local regressions compose with earlier real-engine contract evidence. No assertion that all B11 source equals final source or its rollback binary covers final plugins.',
  source_equivalence: 'evidence/B18-source-equivalence.json', preservation: 'evidence/B18-preservation-review.json',
  browser: 'evidence/B18-browser-acceptance.json',
  artifact: { path: executable, sha256: exeHash, built_at_commit: 'b28997e8d4e52f1198ae5b2aa91ba0df328161f3',
    runtime_source: merge, backend_version: 'v20260911-d46dec4a', frontend_version: 'rv.v20260911-d46dec4a.2k6e8r7p' },
  packaging: { evidence: 'evidence/B16-acceptance.json', scope: 'Unchanged Windows packaging configuration; final standalone B18 binary. B16 installers are not final-candidate installers; macOS/Linux desktop not built here.' },
  unresolved_external_gates: [
    { id: 'production_snapshot', status: 'blocked', reason: 'Sanitized production-copy migration, pricing review and final compatible rollback/transaction reconciliation not performed.' },
    { id: 'provider_interop', status: 'blocked', reason: 'No authorized real test-channel configuration and call scope. Local protocol tests do not close this gate.' },
  ],
  complete_plan: false, production_operations: false, push_or_publish: false,
})

const gateEvidence = {
  upstream_behavior: ['evidence/B17-merge-review.json','evidence/B18-local-acceptance.json'],
  downstream_preservation: ['evidence/B18-preservation-review.json'],
  backend_regression: ['evidence/B18-backend-regression.json'],
  relaykit_independence: ['evidence/runs/B18-relaykit-build/result.json','evidence/runs/B18-relaykit-test/result.json'],
  frontend_regression: ['evidence/runs/B18-web-regression/result.json','evidence/runs/B18-vitest-discovery/result.json'],
  frontend_build: ['evidence/runs/B18-web-build/result.json'], browser_acceptance: ['evidence/B18-browser-acceptance.json'],
  i18n: ['evidence/runs/B18-i18n-literals/result.json'],
  sqlite_migration: ['evidence/B14-acceptance.json','evidence/B18-source-equivalence.json'],
  mysql_migration: ['evidence/B14-acceptance.json','evidence/B18-source-equivalence.json'],
  postgres_migration: ['evidence/B14-acceptance.json','evidence/B18-source-equivalence.json'],
  billing_reconciliation: ['evidence/B11-acceptance.json','evidence/B13-acceptance.json','evidence/B18-backend-regression.json','evidence/B18-source-equivalence.json'],
  task_plugin_migration: ['evidence/B14-acceptance.json','evidence/B18-source-equivalence.json'],
  build_release: ['evidence/B16-acceptance.json','evidence/B18-local-acceptance.json','evidence/B18-source-equivalence.json'],
  ancestry: ['evidence/B17-acceptance.json','evidence/B18-local-acceptance.json'],
}
for (const gate of state.gates) {
  if (gateEvidence[gate.id]) Object.assign(gate, { status: 'verified', verified_commit: candidate, evidence: gateEvidence[gate.id], scope })
  if (gate.id === 'provider_interop') Object.assign(gate, { status: 'blocked', verified_commit: null,
    evidence: ['evidence/B18-local-acceptance.json'], detail: 'Local protocol coverage exists; real authorized provider calls remain unavailable.' })
}
const b18 = batches.find(batch => batch.id === 'B18')
b18.status = 'blocked'
b18.units[0] = { ...b18.units[0], status: 'verified', evidence: ['evidence/B18-local-acceptance.json'] }
b18.units[1] = { ...b18.units[1], status: 'blocked', local_matrix: 'verified',
  blockers: ['production_snapshot','provider_interop'], evidence: ['evidence/B18-source-equivalence.json','evidence/B18-local-acceptance.json'] }
b18.units[2] = { ...b18.units[2], status: 'blocked', final_code_review: 'verified',
  counts: { upstream: 153, downstream: 120, features: 26 },
  detail: 'All final code/contract rows reviewed; all-gate acceptance awaits the two external requirements.', evidence: ['evidence/B18-local-acceptance.json'] }
b18.codeCommits = [merge, 'b28997e8d4e52f1198ae5b2aa91ba0df328161f3', candidate]
b18.evidence = ['evidence/B18-local-acceptance.json','evidence/B18-preservation-review.json','evidence/B18-browser-acceptance.json','evidence/B18-source-equivalence.json','evidence/B18-backend-regression.json']
b18.nextAction = 'Complete sanitized production snapshot rehearsal and authorized real-provider interoperability; do not repeat unchanged local suites.'
const b19 = batches.find(batch => batch.id === 'B19')
b19.status = 'in_progress'
b19.dependencyStatus = 'A33: B19.1/B19.2 may follow verified B18.1 for reversible local main integration. Whole B19 still depends on every B18 gate; no push/deployment.'
b19.unitPrerequisites = { 'B19.1': ['B18.1'], 'B19.2': ['B18.1','B19.1'], 'B19.3': ['B18','B19.2'] }
b19.units[2].action = '记录本地 SHA、证据与迁移/回退边界；外部门槛通过后才能确认完整交付'
state.updatedAt = recordedAt
state.last_verified_code_commit = candidate
state.last_observed_head = candidate
state.current_batch = 'B19'
state.current_unit = 'B19.1'
state.next_action = 'Preserve and hash the original untracked plan, verify unchanged local main, then fast-forward local main under A33. Keep production/provider gates open.'
state.local_acceptance = { status: 'verified', commit: candidate, evidence: 'evidence/B18-local-acceptance.json' }
state.blockers.find(blocker => blocker.id === 'production_snapshot').detail = 'MariaDB 11.4.4 confirmed read-only; matching isolated engine and released fixtures passed. Sanitized production snapshot migration, pricing review and final rollback/transaction reconciliation remain pending. No production writes authorized.'
state.blockers.find(blocker => blocker.id === 'provider_interop').detail = 'Local protocol and browser contracts passed. Real authorized provider configurations and call scope remain unavailable; no paid/live requests performed.'
save('preservation.json', features)
save('upstream-ledger.json', upstream)
save('downstream-ledger.json', downstream)
save('batches.json', batches)
save('state.json', state)
fs.appendFileSync(path.join(directory, 'DECISIONS.md'), `\n## ${recordedAt} — A33 Local main integration after local acceptance\n\nThe user requested continued merging with fewer unnecessary checks. Reuse only passing unchanged inputs with explicit B18 equivalence, and preserve every failed receipt. All 153 upstream, 120 downstream and 26 protection rows now have final-candidate local code/contract review at ${candidate}. Their scope does not certify production data or third-party services. B19.1/B19.2 may precede the unavailable external portion of B18; this is reversible local source integration only. Keep the original B18 dependency for full B19 completion, retain both blockers, and use code_complete after main receives the result. Do not mark completed or alter verify-plan --final to hide missing gates. No push, publication, paid request or production write is authorized.\n`)
checkpoint('B18 local acceptance verified; B19 local integration prepared',
  `Candidate ${candidate}; 153/120/26 local reviews recorded. ${allTests.length} distinct protection tests retained, ${webTests.length} frontend paths included in 210 files / 1531 passing tests. Backend combines 49 passed root packages, controller run and two same-candidate cleanup rechecks. Source equivalence and browser reports persisted. A33 permits only reversible local main integration before the production-snapshot/provider gates. Next: hash/preserve original untracked plan, verify main baseline and fast-forward; output stays untouched.`)
console.log(JSON.stringify({ candidate, upstream: upstream.length, downstream: downstream.length, features: features.length,
  protected_tests: allTests.length, web_protected: webTests.length, root_passed_packages: backend.unchanged_passed_packages.length,
  local_acceptance: 'verified', full_plan: 'not_completed', next: state.next_action }, null, 2))
