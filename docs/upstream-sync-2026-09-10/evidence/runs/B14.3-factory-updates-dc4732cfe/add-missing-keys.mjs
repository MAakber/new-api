import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Updates with the system": "Updates with the system",
    "Built-in is v{{factory}}; delete the custom version to return to it": "Built-in is v{{factory}}; delete the custom version to return to it"
  },
  "zh": {
    "Updates with the system": "随系统更新",
    "Built-in is v{{factory}}; delete the custom version to return to it": "内置版本为 v{{factory}}；删除自定义版本即可恢复"
  },
  "zh-TW": {
    "Updates with the system": "隨系統更新",
    "Built-in is v{{factory}}; delete the custom version to return to it": "內建版本為 v{{factory}}；刪除自訂版本即可恢復"
  },
  "fr": {
    "Updates with the system": "Mise à jour système",
    "Built-in is v{{factory}}; delete the custom version to return to it": "La version intégrée est v{{factory}} ; supprimez la version personnalisée pour y revenir"
  },
  "ja": {
    "Updates with the system": "システムとともに更新",
    "Built-in is v{{factory}}; delete the custom version to return to it": "組み込みは v{{factory}} です。カスタム版を削除すると戻ります"
  },
  "ru": {
    "Updates with the system": "Обновляется с системой",
    "Built-in is v{{factory}}; delete the custom version to return to it": "Встроенная версия — v{{factory}}; удалите свою, чтобы вернуться к ней"
  },
  "vi": {
    "Updates with the system": "Cập nhật cùng hệ thống",
    "Built-in is v{{factory}}; delete the custom version to return to it": "Bản tích hợp là v{{factory}}; xóa bản tùy chỉnh để trở lại"
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
