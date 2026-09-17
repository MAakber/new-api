import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const list = process.argv.includes('--list')
const filters = process.argv.slice(2).filter((arg) => arg !== '--list')
const result = spawnSync(
  'bun',
  ['x', 'vitest', ...(list ? ['list', '--filesOnly'] : ['run']), ...filters],
  { cwd: web, windowsHide: true, stdio: 'inherit' }
)
process.exitCode = result.status ?? 1
