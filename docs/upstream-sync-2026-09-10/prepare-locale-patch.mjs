import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { read, directory, repository } from './ledger.mjs'

// Prepare the required seven-locale writer for review, without writing locales.
const [sha] = process.argv.slice(2)
const operation = read('state.json').manual_adaptation
if (operation?.target !== sha) throw new Error('No matching recorded manual adaptation')
const newKeys = {}
const conflicts = []
const sourceStrings = new Set()
const changed = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'web/src'], { cwd: repository, encoding: 'utf8', windowsHide: true })
const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'web/src'], { cwd: repository, encoding: 'utf8', windowsHide: true })
if (changed.status !== 0 || untracked.status !== 0) throw new Error('Cannot inspect frontend dependency keys')
for (const file of new Set((changed.stdout + untracked.stdout).trim().split('\n'))) {
  const absolute = path.join(repository, file)
  if (!/\.[jt]sx?$/.test(file) || file.includes('/__tests__/') || !fs.existsSync(absolute)) continue
  for (const match of fs.readFileSync(absolute, 'utf8').matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)) {
    sourceStrings.add((match[1] ?? match[2]).replace(/\\(['"\\nrtbfv])/g, (_, escaped) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' })[escaped] ?? escaped))
  }
}
for (const locale of ['en', 'zh', 'zh-TW', 'fr', 'ja', 'ru', 'vi']) {
  const file = `web/src/i18n/locales/${locale}.json`
  const readCommit = ref => {
    const result = spawnSync('git', ['show', `${ref}:${file}`], { cwd: repository, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
    if (result.status !== 0) throw new Error(result.stderr)
    return JSON.parse(result.stdout).translation
  }
  const previous = readCommit(sha + '^')
  const next = readCommit(sha)
  const current = JSON.parse(fs.readFileSync(path.join(repository, file), 'utf8')).translation
  newKeys[locale] = {}
  for (const [key, value] of Object.entries(next)) {
    if (previous[key] === value || current[key] === value) continue
    if (Object.hasOwn(current, key)) {
      if (!Object.hasOwn(previous, key)) continue // Retain existing downstream translation of a shared new key.
      if (current[key] !== previous[key]) { conflicts.push({locale, key, current: current[key], upstream: value}); continue }
    }
    newKeys[locale][key] = value
  }
  // Pulled-forward source dependencies may use keys predating this commit.
  // Copy only actual upstream translations and still write via the locale writer.
  for (const key of sourceStrings) {
    if (Object.hasOwn(next, key) && !Object.hasOwn(current, key) && !Object.hasOwn(newKeys[locale], key)) newKeys[locale][key] = next[key]
  }
}
if (conflicts.length) throw new Error('Review conflicting translations: ' + JSON.stringify(conflicts))
const template = fs.readFileSync(path.join(directory, 'evidence/runs/B07.1-auto-ban-mode-5d3423bec/add-missing-keys.mjs'), 'utf8')
const script = template.slice(0, template.indexOf('const newKeys = ')) + 'const newKeys = ' + JSON.stringify(newKeys, null, 2) + '\n\n' + template.slice(template.indexOf('async function main()'))
fs.writeFileSync(path.join(repository, 'web/scripts/add-missing-keys.mjs'), script, { flag: 'wx' })
fs.writeFileSync(path.join(directory, operation.evidence, 'add-missing-keys.mjs'), script, { flag: 'wx' })
console.log(JSON.stringify(newKeys, null, 2))
