import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const directory = path.dirname(fileURLToPath(import.meta.url))
export const repository = path.resolve(directory, '../..')

export function read(name) {
  return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
}

export function save(name, value) {
  const file = path.join(directory, name)
  const relative = path.relative(directory, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Ledger path escapes plan')
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n')
  JSON.parse(fs.readFileSync(file + '.tmp', 'utf8'))
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.previous')
  fs.renameSync(file + '.tmp', file)
}

export function head() {
  const result = spawnSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error('Cannot read integration HEAD')
  return result.stdout.trim()
}

export function checkpoint(title, body) {
  fs.appendFileSync(path.join(directory, 'CHECKPOINTS.md'), `\n## ${new Date().toISOString()} — ${title}\n\n${body}\n`)
}
