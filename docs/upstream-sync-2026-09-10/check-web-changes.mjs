import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { repository } from './ledger.mjs'

const [mode, baseline = 'HEAD'] = process.argv.slice(2)
if (!['lint', 'format'].includes(mode)) throw new Error('Expected lint|format [baseline]')
const git = args => {
  const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}
const files = [...new Set((git(['diff', '--name-only', baseline, '--', 'web']) + git(['ls-files', '--others', '--exclude-standard', '--', 'web'])).trim().split('\n'))]
  .filter(file => /\.(tsx?|mjs)$/.test(file) && fs.existsSync(path.join(repository, file)))
if (files.length === 0) {
  console.log('No changed frontend source files')
  process.exit(0)
}
const headers = new Map()
try {
  if (mode === 'format') {
    for (const file of files) {
      const absolute = path.join(repository, file)
      const source = fs.readFileSync(absolute, 'utf8')
      const header = source.match(/^\/\*[\s\S]*?Copyright[\s\S]*?\*\/(?:\r?\n)*/)
      if (header) {
        headers.set(absolute, header[0])
        fs.writeFileSync(absolute, source.slice(header[0].length))
      }
    }
  }
  const args = mode === 'format' ? ['x', 'oxfmt', '--write'] : ['x', 'oxlint', '-c', '.oxlintrc.json']
  const result = spawnSync('bun', [...args, ...files.map(file => file.slice(4))], { cwd: path.join(repository, 'web'), windowsHide: true, stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally {
  for (const [file, header] of headers) fs.writeFileSync(file, header + fs.readFileSync(file, 'utf8'))
}
