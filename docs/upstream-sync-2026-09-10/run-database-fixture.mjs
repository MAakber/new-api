import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { read, save, directory, repository } from './ledger.mjs'

// DSNs stay in the environment. Only disposable database names and artifact
// hashes are written into evidence. Database creation is a separate step.
const [id, flavor, phase, database] = process.argv.slice(2)
if (!/^[A-Za-z0-9_.-]+$/.test(id || '') || !['sqlite', 'mysql', 'mariadb', 'postgres'].includes(flavor) || !['fresh', 'seed', 'verify'].includes(phase) || !/^codex_sync_[a-z0-9_]+$/.test(database || '')) {
  throw new Error('Usage: run-database-fixture.mjs RUN_ID sqlite|mysql|mariadb|postgres fresh|seed|verify codex_sync_DATABASE')
}
const manifest = read('evidence/B06-fixture-binaries.json')
const artifact = phase === 'seed' ? manifest.baseline : manifest.current
const hash = createHash('sha256').update(fs.readFileSync(artifact.path)).digest('hex')
if (hash !== artifact.sha256) throw new Error('Test binary no longer matches its recorded build')
const environment = { ...process.env, TEST_UPGRADE_PHASE: phase }
if (flavor === 'sqlite') {
  const fixtureRoot = process.env.TEST_FIXTURE_ROOT
  if (!fixtureRoot || !path.isAbsolute(fixtureRoot)) throw new Error('Set TEST_FIXTURE_ROOT to the isolated fixture directory')
  environment.TEST_UPGRADE_SQLITE_DIR = path.join(fixtureRoot, database)
  environment.TEST_UPGRADE_DSN = 'local'
  environment.TEST_UPGRADE_LOG_DSN = 'local'
} else {
  const dsn = process.env[`TEST_${flavor.toUpperCase()}_DSN`]
  if (!dsn) throw new Error('Requested database fixture DSN is not configured')
  for (const [name, target] of [['TEST_UPGRADE_DSN', database], ['TEST_UPGRADE_LOG_DSN', database + '_log']]) {
    if (flavor === 'postgres') {
      const parsed = new URL(dsn)
      parsed.pathname = '/' + target
      environment[name] = parsed.toString()
    } else {
      if (!/\)\/[^?]+(?:\?|$)/.test(dsn)) throw new Error('Expected a TCP MySQL test DSN with a database name')
      environment[name] = dsn.replace(/(\)\/)[^?]+/, '$1' + target)
    }
  }
}
const result = spawnSync(process.execPath, [path.join(directory, 'run-check.mjs'), id, '.', artifact.path, '-test.run=^TestDatabaseUpgradePreservesDownstreamData$', '-test.v'], {
  cwd: repository, env: environment, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024,
})
const evidence = `evidence/runs/${id}/result.json`
const record = read(evidence)
record.runner_commit = record.tested_commit
record.tested_commit = artifact.source_commit
record.fixture = { flavor, phase, database, log_database: database + '_log', artifact_sha256: hash, fixture_sha256: artifact.fixture_sha256, build_evidence: artifact.build_evidence }
save(evidence, record)
process.stdout.write(result.stdout + result.stderr)
console.log(JSON.stringify({ id, status: record.status, tested_commit: record.tested_commit, fixture: record.fixture }))
process.exitCode = result.status === 0 ? 0 : 1
