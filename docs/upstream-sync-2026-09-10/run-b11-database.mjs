import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { read, save, directory, repository } from './ledger.mjs'

const [flavor] = process.argv.slice(2)
if (!['sqlite', 'mysql', 'mariadb', 'postgres'].includes(flavor)) throw new Error('Choose an isolated B11 database flavor')
const manifest = read('evidence/B11-fixture-binaries.json')
for (const artifact of [manifest.current, manifest.rollback, manifest.released_upgrade]) {
  if (!artifact || createHash('sha256').update(fs.readFileSync(artifact.path)).digest('hex') !== artifact.sha256) throw new Error('Fixture binary hash mismatch')
}
const fixtureRoot = process.env.TEST_FIXTURE_ROOT
if (!fixtureRoot || !path.isAbsolute(fixtureRoot)) throw new Error('Set the absolute isolated TEST_FIXTURE_ROOT')
const baseDSN = process.env[`TEST_${flavor.toUpperCase()}_DSN`]
if (flavor !== 'sqlite' && !baseDSN) throw new Error('Configure the selected local fixture DSN')
const results = []

function databaseDSN(database) {
  if (flavor === 'sqlite') return 'local'
  if (flavor === 'postgres') {
    const parsed = new URL(baseDSN)
    if (!['127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Only loopback database fixtures are allowed')
    parsed.pathname = '/' + database
    return parsed.toString()
  }
  if (!/@tcp\((127\.0\.0\.1|\[::1\]):\d+\)\//.test(baseDSN)) throw new Error('Only loopback TCP database fixtures are allowed')
  return baseDSN.replace(/(\)\/)[^?]+/, '$1' + database)
}

function fixture(id, test, artifact, extraEnvironment = {}) {
  const relative = `evidence/runs/${id}/result.json`
  if (fs.existsSync(path.join(directory, relative))) {
    const existing = read(relative)
    if (existing.status !== 'passed' || existing.fixture?.artifact_sha256 !== artifact.sha256) throw new Error(`Reconcile incomplete or changed fixture ${id}`)
    results.push(relative)
    return
  }
  const result = spawnSync(process.execPath, [path.join(directory, 'run-check.mjs'), id, '.', artifact.path, '-test.run=^' + test + '$', '-test.v'], {
    cwd: repository, env: { ...process.env, ...extraEnvironment, SKIP_64BIT_QUOTA_SCHEMA_CHECK: 'false' }, encoding: 'utf8', windowsHide: true,
  })
  const record = read(relative)
  record.runner_commit = record.tested_commit
  record.tested_commit = artifact.source_commit
  record.fixture = { flavor, artifact_sha256: artifact.sha256, build_evidence: artifact.build_evidence }
  save(relative, record)
  console.log(JSON.stringify({ id, status: record.status, source: record.tested_commit }))
  if (result.status !== 0) throw new Error(`Failed ${id}; inspect ${relative}`)
  results.push(relative)
}

function startup(phase) {
  const id = `B11-${flavor}-${phase}`
  const relative = `evidence/runs/${id}/result.json`
  if (fs.existsSync(path.join(directory, relative))) {
    const existing = read(relative)
    const expected = phase === 'seed' ? manifest.baseline : manifest.current
    if (existing.status !== 'passed' || existing.fixture?.artifact_sha256 !== expected.sha256) throw new Error(`Reconcile incomplete or changed startup ${id}`)
    results.push(relative)
    return
  }
  const result = spawnSync(process.execPath, [path.join(directory, 'run-database-fixture.mjs'), id, flavor, phase, `codex_sync_b11_${phase === 'fresh' ? 'fresh' : 'upgrade'}`], { cwd: repository, env: process.env, encoding: 'utf8', windowsHide: true })
  const record = read(relative)
  console.log(JSON.stringify({ id, status: record.status, source: record.tested_commit }))
  if (result.status !== 0) throw new Error(`Failed ${id}; inspect ${relative}`)
  results.push(relative)
}

fixture(`B11-accounting-${flavor}`, 'TestAccountingDatabaseContracts', manifest.current, { TEST_ACCOUNTING_DSN: databaseDSN('codex_sync_b11_accounting') })
startup('fresh')
startup('seed')
const walletEnvironment = {
  TEST_WALLET_RELEASED_DSN: databaseDSN('codex_sync_b11_upgrade'),
  TEST_WALLET_ROLLBACK_DSN: databaseDSN('codex_sync_b11_upgrade'),
}
if (flavor === 'sqlite') walletEnvironment.TEST_WALLET_SQLITE_PATH = path.join(fixtureRoot, 'codex_sync_b11_upgrade', 'main.db')
fixture(`B11-${flavor}-explicit-upgrade-2`, 'TestWalletMigrateReleasedSchema', manifest.released_upgrade, walletEnvironment)
startup('verify')
for (const phase of ['seed', 'rollback', 'verify']) {
  fixture(`B11-${flavor}-rollback-${phase}`, 'TestWalletCompatibleRollback', phase === 'rollback' ? manifest.rollback : manifest.current, { ...walletEnvironment, TEST_WALLET_ROLLBACK_PHASE: phase })
}
save(`evidence/B11-${flavor}-rehearsal.json`, { flavor, candidate: manifest.current.source_commit, rollback: manifest.rollback.source_commit, status: 'passed', checked_at: new Date().toISOString(), checks: results })
