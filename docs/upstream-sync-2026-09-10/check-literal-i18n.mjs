import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { repository } from './ledger.mjs'

// Read-only check of literal t() keys in production files changed since a checkpoint.
const [baseline] = process.argv.slice(2)
if (!baseline) throw new Error('Expected a baseline commit')
const changed = spawnSync('git', ['diff', '--name-only', baseline, 'HEAD', '--', 'web/src'], { cwd: repository, encoding: 'utf8', windowsHide: true })
if (changed.status !== 0) throw new Error(changed.stderr)
const files = changed.stdout.trim().split('\n').filter(file => /\.[jt]sx?$/.test(file) && !file.includes('/__tests__/'))
const locales = ['en', 'zh', 'zh-TW', 'fr', 'ja', 'ru', 'vi']
const translations = Object.fromEntries(locales.map(locale => [locale, JSON.parse(fs.readFileSync(path.join(repository, 'web/src/i18n/locales', locale + '.json'), 'utf8')).translation]))
const missing = []
const checked = new Set()
for (const file of files) {
  if (!fs.existsSync(path.join(repository, file))) continue
  const source = fs.readFileSync(path.join(repository, file), 'utf8')
  for (const match of source.matchAll(/\bt\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")\s*[,)]/g)) {
    const key = (match[1] ?? match[2]).replace(/\\(['"\\nrtbfv])/g, (_, escaped) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' })[escaped] ?? escaped)
    checked.add(key)
    const absent = locales.filter(locale => !Object.hasOwn(translations[locale], key))
    if (absent.length) missing.push({ file, key, locales: absent })
  }
}
console.log(JSON.stringify({ files: files.length, checked_keys: checked.size, missing, scope: 'Literal call sites only; dynamic keys require explicit review.' }, null, 2))
process.exitCode = missing.length ? 1 : 0
