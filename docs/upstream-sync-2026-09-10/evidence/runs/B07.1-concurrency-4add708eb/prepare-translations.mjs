import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const sha = '4add708ebe3b74e02dcf141887da2c81cb9b1526'
const newKeys = {}
for (const locale of ['en', 'zh', 'zh-TW', 'fr', 'ja', 'ru', 'vi']) {
  const file = `web/src/i18n/locales/${locale}.json`
  const readCommit = ref => {
    const result = spawnSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
    if (result.status !== 0) throw new Error(result.stderr)
    return JSON.parse(result.stdout).translation
  }
  const previous = readCommit(sha + '^')
  const next = readCommit(sha)
  const current = JSON.parse(fs.readFileSync(file, 'utf8')).translation
  newKeys[locale] = Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== previous[key] && !Object.hasOwn(current, key)))
}
console.log(JSON.stringify(newKeys, null, 2))
const template = fs.readFileSync('docs/upstream-sync-2026-09-10/evidence/runs/B07.1-auto-ban-mode-5d3423bec/add-missing-keys.mjs', 'utf8')
const script = template.slice(0, template.indexOf('const newKeys = ')) + 'const newKeys = ' + JSON.stringify(newKeys, null, 2) + '\n\n' + template.slice(template.indexOf('async function main()'))
const destination = 'web/scripts/add-missing-keys.mjs'
fs.writeFileSync(destination, script, { flag: 'wx' })
fs.writeFileSync(path.join(import.meta.dirname, 'add-missing-keys.mjs'), script, { flag: 'wx' })
