import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Record one real command without a shell. An interrupted run stays incomplete.
const [id, relativeCwd, command, ...args] = process.argv.slice(2)
if (!/^[A-Za-z0-9_.-]+$/.test(id || '') || !relativeCwd || !command) {
  throw new Error('Usage: node run-check.mjs <unique-run-id> <repository-relative-cwd> <command> [args...]')
}
const plan = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(plan, '../..')
const cwd = path.resolve(repository, relativeCwd)
const relative = path.relative(repository, cwd)
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Working directory must be inside the integration worktree')
const directory = path.join(plan, 'evidence/runs', id)
fs.mkdirSync(directory, { recursive: false })
const git = spawnSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true })
if (git.status !== 0) throw new Error('Cannot record tested commit')
const record = {
  id,
  command: [command, ...args],
  cwd,
  tested_commit: git.stdout.trim(),
  started_at: new Date().toISOString(),
  finished_at: null,
  status: 'running',
  exit_code: null,
  signal: null,
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    GOWORK: process.env.GOWORK ?? 'default',
    CGO_ENABLED: process.env.CGO_ENABLED ?? 'default',
    mysql_test_dsn_present: Boolean(process.env.TEST_MYSQL_DSN),
    postgres_test_dsn_present: Boolean(process.env.TEST_POSTGRES_DSN),
  },
  log: 'output.log',
}
const recordPath = path.join(directory, 'result.json')
fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n')
const log = fs.openSync(path.join(directory, record.log), 'wx')
console.log(JSON.stringify({ id, status: record.status, tested_commit: record.tested_commit, directory }))
const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', log, log] })
child.on('error', (error) => {
  record.error = error.message
})
child.on('close', (code, signal) => {
  fs.closeSync(log)
  record.exit_code = code
  record.signal = signal
  record.finished_at = new Date().toISOString()
  record.status = code === 0 && !signal ? 'passed' : 'failed'
  fs.writeFileSync(recordPath + '.tmp', JSON.stringify(record, null, 2) + '\n')
  JSON.parse(fs.readFileSync(recordPath + '.tmp', 'utf8'))
  fs.copyFileSync(recordPath, recordPath + '.previous')
  fs.renameSync(recordPath + '.tmp', recordPath)
  console.log(JSON.stringify(record))
  process.exitCode = code === 0 && !signal ? 0 : 1
})
