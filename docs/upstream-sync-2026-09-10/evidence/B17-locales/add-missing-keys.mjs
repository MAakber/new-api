import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const LOCALES_DIR = path.resolve('src/i18n/locales')
const evidence = path.resolve('../docs/upstream-sync-2026-09-10/evidence')
const inventory = JSON.parse(await fs.readFile(path.join(evidence, 'B17-file-review.json'), 'utf8'))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
if (git('rev-parse', 'HEAD').trim() !== inventory.before || git('rev-parse', 'MERGE_HEAD').trim() !== inventory.upstream) throw new Error('Merge checkpoint changed')

// Method labels HTTP request methods in the usage/audit tables and details.
const newKeys = {
  en: { Method: 'Method' },
  zh: { Method: '请求方法' },
  'zh-TW': { Method: '請求方法' },
  fr: { Method: 'Méthode' },
  ja: { Method: 'メソッド' },
  ru: { Method: 'Метод' },
  vi: { Method: 'Phương thức' },
}
function stableStringify(value) {
  return JSON.stringify(value, null, 2).replaceAll('"footer.newapi.projectAttributionSuffix":', '"footer.new\\u0061pi.projectAttributionSuffix":') + '\n'
}
const sourceFiles = git('ls-files', 'src').trim().split('\n').filter(file => /\.[jt]sx?$/.test(file) && !file.includes('/__tests__/'))
const sources = await Promise.all(sourceFiles.map(async file => [file, await fs.readFile(file, 'utf8')]))
const report = { before: inventory.before, upstream: inventory.upstream, locales: [], policy: 'Retain all accepted downstream translations, adopt upstream HTTP Method translations. Seven incoming scheduler labels have no remaining call sites; equivalent controls use accepted dedicated channel-test-section copy. Keep color Background, check-in meaning, brand names and other accepted wording.' }
const prepared = []
for (const [locale, additions] of Object.entries(newKeys)) {
  const file = `web/src/i18n/locales/${locale}.json`
  const accepted = JSON.parse(git('show', `${inventory.before}:${file}`))
  const incoming = JSON.parse(git('show', `${inventory.upstream}:${file}`))
  const unused = Object.keys(incoming.translation).filter(key => !Object.hasOwn(accepted.translation, key)).map(key => ({ key, references: sources.filter(([, source]) => source.includes(key)).map(([file]) => file) }))
  if (unused.some(item => item.references.length > 0)) throw new Error('Unreviewed referenced incoming key')
  const changed = Object.keys(incoming.translation).filter(key => Object.hasOwn(accepted.translation, key) && incoming.translation[key] !== accepted.translation[key]).map(key => ({ key, accepted: accepted.translation[key], incoming: incoming.translation[key], resolution: Object.hasOwn(additions, key) ? 'incoming' : 'accepted' }))
  for (const [key, value] of Object.entries(additions)) accepted.translation[key] = value
  accepted.translation = Object.fromEntries(Object.entries(accepted.translation).sort(([a], [b]) => a.localeCompare(b)))
  const result = stableStringify(accepted)
  JSON.parse(result)
  prepared.push({ file: path.join(LOCALES_DIR, `${locale}.json`), result })
  report.locales.push({ locale, count: Object.keys(accepted.translation).length, changed, excluded_unused: unused })
}
// Prepare every locale before replacing any conflicted file.
for (const item of prepared) await fs.writeFile(item.file + '.b17-tmp', item.result)
for (const item of prepared) await fs.rename(item.file + '.b17-tmp', item.file)
await fs.writeFile(path.join(evidence, 'B17-locale-review.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ locales: prepared.length, keys: report.locales[0].count, next: 'bun run i18n:sync' }))
