import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
const key = 'Preference saved as {{pref}}, but no active subscription. Requests will be rejected.'
const newKeys = {
  en: { [key]: key },
  zh: { [key]: '已保存偏好为{{pref}}，当前无生效订阅，请求将被拒绝' },
  'zh-TW': { [key]: '已儲存偏好為{{pref}}，目前無生效訂閱，請求將被拒絕' },
  fr: { [key]: 'Préférence enregistrée comme {{pref}}, mais aucun abonnement actif. Les demandes seront rejetées.' },
  ja: { [key]: '設定は{{pref}}として保存されましたが、アクティブなサブスクリプションがありません。リクエストは拒否されます。' },
  ru: { [key]: 'Настройка сохранена как {{pref}}, но нет активной подписки. Запросы будут отклонены.' },
  vi: { [key]: 'Tùy chọn đã lưu là {{pref}}, nhưng không có gói đăng ký đang hoạt động. Các yêu cầu sẽ bị từ chối.' },
}

async function main() {
  for (const [locale, translations] of Object.entries(newKeys)) {
    const file = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(file, 'utf8'))
    for (const [entry, value] of Object.entries(translations)) json.translation[entry] = value
    json.translation = Object.fromEntries(Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b)))
    await fs.writeFile(file, JSON.stringify(json, null, 2) + '\n', 'utf8')
    console.log(`${locale}: ${Object.keys(translations).length} reviewed translations applied`)
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
