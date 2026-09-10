import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "OAuth": "OAuth",
    "Count": "Count"
  },
  "zh": {
    "OAuth": "OAuth",
    "Count": "数量"
  },
  "zh-TW": {
    "OAuth": "OAuth",
    "Count": "數量"
  },
  "fr": {
    "OAuth": "OAuth",
    "Count": "Nombre"
  },
  "ja": {
    "OAuth": "OAuth",
    "Count": "件数"
  },
  "ru": {
    "OAuth": "OAuth",
    "Count": "Количество"
  },
  "vi": {
    "OAuth": "OAuth",
    "Count": "Số lượng"
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
