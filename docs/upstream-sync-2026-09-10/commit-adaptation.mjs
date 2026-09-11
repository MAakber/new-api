import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { read, directory, repository } from './ledger.mjs'

// Save an already reviewed manual adaptation. This does not mark it verified.
const [sha, title, rationale] = process.argv.slice(2)
const operation = read('state.json').manual_adaptation
if (operation?.target !== sha || !title || !rationale) throw new Error('Expected active SHA TITLE RATIONALE')
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: repository, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}\n${result.stdout}`)
  return result.stdout
}
const files = [...new Set([
  ...run('git', ['diff', '--name-only', 'HEAD', '-z']).split('\0'),
  ...run('git', ['diff', '--name-only', '-z']).split('\0'),
  ...run('git', ['diff', '--name-only', '--diff-filter=U', '-z']).split('\0'),
  ...run('git', ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
].filter(file => file && !file.startsWith('docs/upstream-sync-2026-09-10/')))]
if (files.length === 0) throw new Error('No source changes; record equivalence explicitly instead')
if (files.some(file => file.startsWith('web/src/i18n/locales/_reports/'))) throw new Error('Review generated reports before committing')
for (const file of files) {
  const absolute = path.join(repository, file)
  if (!fs.existsSync(absolute) || !/\.(go|tsx?|mjs|json|js)$/.test(file)) continue
  if (/^(<<<<<<< |=======\r?$|>>>>>>> )/m.test(fs.readFileSync(absolute, 'utf8'))) throw new Error(`Unresolved markers: ${file}`)
}
const goFiles = files.filter(file => file.endsWith('.go') && fs.existsSync(path.join(repository, file)))
if (goFiles.length) run('gofmt', ['-w', ...goFiles])
run('git', ['add', '--', ...files])
if (run('git', ['ls-files', '--unmerged']).trim()) throw new Error('Unmerged index entries remain')
run('git', ['diff', '--cached', '--check'])
const message = `${title}\n\nAdapt upstream ${sha}.\n\n${rationale}\n\nImplementation checkpoint; consolidated acceptance is recorded separately.\n`
const messagePath = path.join(directory, operation.evidence, 'commit-message.txt')
fs.writeFileSync(messagePath, message, { flag: 'wx' })
console.log(run('git', ['commit', '--file', messagePath]).split('\n').slice(0, 3).join('\n'))
console.log(run(process.execPath, [path.join(directory, 'adapt-upstream.mjs'), 'finish', sha, rationale]).trim())
