import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Auto-disable-enabled channels only": "Auto-disable-enabled channels only",
    "Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled.": "Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled."
  },
  "zh": {
    "Auto-disable-enabled channels only": "仅测试已开启自动禁用的渠道",
    "Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled.": "此模式仅探测已开启自动禁用且未被手动禁用的渠道。"
  },
  "zh-TW": {
    "Auto-disable-enabled channels only": "僅測試已啟用自動停用的渠道",
    "Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled.": "此模式僅探測已啟用自動停用且未被手動停用的渠道。"
  },
  "fr": {
    "Auto-disable-enabled channels only": "Canaux avec désactivation automatique uniquement",
    "Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled.": "Ce mode sonde uniquement les canaux dont la désactivation automatique est activée et qui ne sont pas désactivés manuellement."
  },
  "ja": {
    "Auto-disable-enabled channels only": "自動無効化が有効なチャネルのみ",
    "Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled.": "このモードでは、自動無効化が有効で、手動で無効化されていないチャネルのみを検査します。"
  },
  "ru": {
    "Auto-disable-enabled channels only": "Только каналы с автовыключением",
    "Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled.": "В этом режиме проверяются только каналы с включённым автоматическим отключением, которые не были отключены вручную."
  },
  "vi": {
    "Auto-disable-enabled channels only": "Chỉ kênh đã bật tự động vô hiệu hóa",
    "Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled.": "Chế độ này chỉ kiểm tra các kênh đã bật tự động vô hiệu hóa và không bị vô hiệu hóa thủ công."
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
