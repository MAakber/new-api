import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "vi": {
    "Async": "Bất đồng bộ"
  },
  "ja": {
    "Async": "非同期"
  },
  "zh-TW": {
    "Async": "非同步"
  },
  "en": {
    "Async": "Async"
  },
  "ru": {
    "Async": "Асинхронно"
  },
  "fr": {
    "Async": "Asynchrone"
  },
  "zh": {
    "Async": "异步"
  }
}

async function main() {
  let totalAdded = 0
  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, locale + '.json')
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))
    let count = 0
    for (const [key, value] of Object.entries(trans)) {
      if (!Object.prototype.hasOwnProperty.call(json.translation, key) || json.translation[key] !== value) {
        json.translation[key] = value
        count++
      }
    }
    if (count > 0) {
      json.translation = Object.fromEntries(Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b)))
      await fs.writeFile(filePath, stableStringify(json), 'utf8')
    }
    console.log(locale + ': ' + count + ' translations applied')
    totalAdded += count
  }
  console.log('Total: ' + totalAdded + ' translations applied')
}
main().catch((err) => { console.error(err); process.exitCode = 1 })
