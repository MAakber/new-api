import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { read, directory, repository } from './ledger.mjs'

// Apply only the source portion of a previously inspected manual adaptation.
// Locale writes are intentionally left to add-missing-keys.mjs.
const [sha, ...excluded] = process.argv.slice(2)
const operation = read('state.json').manual_adaptation
if (operation?.target !== sha) throw new Error('No matching recorded manual adaptation')
const resultFile = path.join(directory, operation.evidence, 'source-patch.json')
if (fs.existsSync(resultFile)) throw new Error('Source patch already attempted; reconcile the recorded state')
const diff = spawnSync('git', ['diff', sha + '^', sha, '--', '.', ':(exclude)web/src/i18n/locales/**', ...excluded.map(file => ':(exclude)' + file)], { cwd: repository, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
if (diff.status !== 0) throw new Error(diff.stderr.toString())
const result = spawnSync('git', ['apply', '--3way'], { cwd: repository, input: diff.stdout, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
fs.writeFileSync(resultFile, JSON.stringify({ upstream: sha, excluded, exit_code: result.status, output: result.stdout + result.stderr }, null, 2) + '\n', { flag: 'wx' })
console.log(result.stdout + result.stderr)
process.exitCode = result.status
