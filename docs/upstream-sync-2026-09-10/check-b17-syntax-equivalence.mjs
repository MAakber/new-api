import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { read, save, repository } from './ledger.mjs'

const require = createRequire(import.meta.url)
const parser = require(path.join(repository, 'web/node_modules/@babel/parser/lib/index.js'))
const inventory = read('evidence/B17-file-review.json')
const metadataKeys = new Set(['start', 'end', 'loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens'])
function normalized(ref, file) {
  const result = spawnSync('git', ['show', `${ref}:${file}`], { cwd: repository, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 })
  if (result.status !== 0) return null
  const source = parser.parse(result.stdout, { sourceType: 'module', plugins: ['typescript', 'jsx'], attachComment: false })
  return JSON.stringify(source, (key, value) => metadataKeys.has(key) ? undefined : value)
}
const equivalent = []
const different = []
for (const entry of inventory.entries.filter(e => e.status === 'pending' && e.file.startsWith('web/') && /\.tsx?$/.test(e.file))) {
  const before = normalized(inventory.before, entry.file)
  const upstream = normalized(inventory.upstream, entry.file)
  if (before !== null && before === upstream) {
    equivalent.push({ file: entry.file, syntax_sha256: crypto.createHash('sha256').update(before).digest('hex') })
  } else different.push(entry.file)
}
save('evidence/B17-syntax-equivalence.json', { before: inventory.before, upstream: inventory.upstream, method: 'Installed Babel TypeScript/JSX parser; removes source coordinates, comments and raw lexical metadata only. No semantic AST nodes, values or identifiers ignored.', equivalent, different })
save('evidence/B17-decisions-format.json', equivalent.map(({ file, syntax_sha256 }) => ({ file, source: 'integrated', reason: `Committed ASTs match after comments/quote/format normalization (${syntax_sha256}); preserve accepted formatting and protected headers. No business node differs.` })))
console.log(JSON.stringify({ equivalent: equivalent.map(e => e.file), remaining_behavior_differences: different.length }, null, 2))
