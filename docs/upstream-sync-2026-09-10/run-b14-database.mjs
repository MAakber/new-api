import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { read, save, directory, repository } from './ledger.mjs'

const [flavor] = process.argv.slice(2)
const engines = {
  sqlite: {},
  mariadb: { container: 'codex-sync-mariadb-20260910', port: 43306, client: 'mariadb' },
  mysql: { container: 'codex-sync-mysql-20260910', port: 43307, client: 'mysql' },
  postgres: { container: 'codex-sync-postgres-20260910', port: 45432 },
}
if (!Object.hasOwn(engines, flavor)) throw new Error('Expected isolated database flavor')
const engine = engines[flavor]
const manifest = read('evidence/B14-fixture-binaries.json')
for (const artifact of Object.values(manifest)) {
  if (createHash('sha256').update(fs.readFileSync(artifact.path)).digest('hex') !== artifact.sha256) throw new Error('Fixture artifact hash mismatch')
}
const baseDSN = process.env[`TEST_${flavor.toUpperCase()}_DSN`]
const fixtureRoot = process.env.TEST_FIXTURE_ROOT
if (!fixtureRoot || !path.isAbsolute(fixtureRoot)) throw new Error('Set isolated TEST_FIXTURE_ROOT')
let password
if (flavor === 'postgres') {
  const parsed = new URL(baseDSN)
  if (parsed.hostname !== '127.0.0.1' || Number(parsed.port) !== engine.port) throw new Error('Expected local container endpoint')
} else if (flavor !== 'sqlite') {
  const parsed = baseDSN?.match(/^root:([^@]+)@tcp\(127\.0\.0\.1:(\d+)\)\//)
  if (!parsed || Number(parsed[2]) !== engine.port) throw new Error('Expected local container endpoint')
  password = parsed[1]
}
const checks = []
function dsn(database) {
  if (flavor === 'sqlite') return 'local'
  if (flavor === 'postgres') {
    const parsed = new URL(baseDSN)
    parsed.pathname = '/' + database
    return parsed.toString()
  }
  return baseDSN.replace(/(\)\/)[^?]+/, '$1' + database)
}
function createDatabase(database) {
  if (!/^codex_sync_b14_[a-z0-9_]+$/.test(database)) throw new Error('Unsafe database name')
  if (flavor === 'sqlite') return
  const args = ['-d', 'Ubuntu-SF3D', '-u', 'root', '--', 'docker', 'exec']
  if (flavor === 'postgres') args.push(engine.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ' + database)
  else args.push('-e', 'MYSQL_PWD=' + password, engine.container, engine.client, '-uroot', '-e', 'CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  const result = spawnSync('wsl', args, { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error('Isolated database creation failed: ' + result.stderr)
}
function run(id, artifact, test, environment = {}) {
  const relative = `evidence/runs/${id}/result.json`
  const result = spawnSync(process.execPath, [path.join(directory, 'run-check.mjs'), id, '.', artifact.path, '-test.run=' + test, '-test.v', '-test.count=1'], {
    cwd: repository, env: { ...process.env, TEST_MYSQL_DSN: '', TEST_POSTGRES_DSN: '', ...environment }, encoding: 'utf8', windowsHide: true,
  })
  const record = read(relative)
  record.runner_commit = record.tested_commit
  record.tested_commit = artifact.source_commit
  record.fixture = { flavor, artifact_sha256: artifact.sha256, build_evidence: artifact.build_evidence }
  save(relative, record)
  checks.push(relative)
  console.log(JSON.stringify({ id, status: record.status, source: record.tested_commit }))
  if (result.status !== 0) throw new Error('Failed fixture: ' + relative)
}
const storage = 'codex_sync_b14_plugins'
createDatabase(storage)
run(`B14-${flavor}-plugin-storage`, manifest.model, '^(TestTaskPluginVersionActivationAndSourceImmutability|TestTaskPluginIconSurvivesRestartsAndSourceUpdates|TestDeleteActiveTaskPluginPromotesNewestRemainingVersion|TestTaskPluginSyncSnapshotRevisionTracksDesiredRuntimeState)$', { TEST_TASK_PLUGIN_DSN: dsn(storage) })
for (const phase of ['fresh', 'seed', 'verify']) {
  const database = 'codex_sync_b14_' + (phase === 'fresh' ? 'fresh' : 'upgrade')
  if (phase !== 'verify') { createDatabase(database); createDatabase(database + '_log') }
  run(`B14-${flavor}-${phase}`, phase === 'seed' ? manifest.baseline : manifest.model, '^TestDatabaseUpgradePreservesDownstreamData$', {
    TEST_UPGRADE_PHASE: phase, TEST_UPGRADE_DSN: dsn(database), TEST_UPGRADE_LOG_DSN: dsn(database + '_log'),
    TEST_UPGRADE_SQLITE_DIR: flavor === 'sqlite' ? path.join(fixtureRoot, database) : '',
  })
}
const kind = flavor === 'mariadb' ? 'mysql' : flavor
run(`B14-${flavor}-pricing`, manifest.controller, '^TestModelManagementDatabaseMatrix$/' + kind + '$', flavor === 'sqlite' ? {} : { [kind === 'mysql' ? 'TEST_MYSQL_DSN' : 'TEST_POSTGRES_DSN']: dsn(storage) })
save(`evidence/B14-${flavor}-database.json`, { flavor, status: 'passed', commit: manifest.model.source_commit, checks, checked_at: new Date().toISOString() })
