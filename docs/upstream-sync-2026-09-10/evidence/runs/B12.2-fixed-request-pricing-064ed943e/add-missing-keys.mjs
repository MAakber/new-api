import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "{{unit}} tokens": "{{unit}} tokens",
    "Per token": "Per token",
    "Price per request": "Price per request",
    "Tier billing mode": "Tier billing mode",
    "Token or per-call pricing": "Token or per-call pricing",
    "Use tier(name, fixed(amount)) for a USD price per request. Group and request multipliers still apply.": "Use tier(name, fixed(amount)) for a USD price per request. Group and request multipliers still apply."
  },
  "zh": {
    "{{unit}} tokens": "{{unit}} token",
    "Per token": "按 token",
    "Price per request": "每次请求价格",
    "Tier billing mode": "分支计费方式",
    "Token or per-call pricing": "按 token 或按次计费",
    "Use tier(name, fixed(amount)) for a USD price per request. Group and request multipliers still apply.": "使用 tier(name, fixed(amount)) 设置以美元计价的每次请求价格。分组倍率和请求倍率仍然生效。"
  },
  "zh-TW": {
    "{{unit}} tokens": "{{unit}} token",
    "Per token": "按 token",
    "Price per request": "每次請求價格",
    "Tier billing mode": "分支計費方式",
    "Token or per-call pricing": "按 token 或按次計費",
    "Use tier(name, fixed(amount)) for a USD price per request. Group and request multipliers still apply.": "使用 tier(name, fixed(amount)) 設定以美元計價的每次請求價格。分組倍率和請求倍率仍然生效。"
  },
  "fr": {
    "{{unit}} tokens": "{{unit}} jetons",
    "Per token": "Par jeton",
    "Price per request": "Prix par requête",
    "Tier billing mode": "Facturation du palier",
    "Token or per-call pricing": "Par jeton ou par requête",
    "Use tier(name, fixed(amount)) for a USD price per request. Group and request multipliers still apply.": "Utilisez tier(name, fixed(amount)) pour un prix en USD par requête. Les multiplicateurs de groupe et de requête restent applicables."
  },
  "ja": {
    "{{unit}} tokens": "{{unit}} トークン",
    "Per token": "トークン単位",
    "Price per request": "リクエスト単価",
    "Tier billing mode": "階層の課金方式",
    "Token or per-call pricing": "トークン単位またはリクエスト単位の課金",
    "Use tier(name, fixed(amount)) for a USD price per request. Group and request multipliers still apply.": "tier(name, fixed(amount)) でリクエストごとの米ドル価格を設定します。グループ倍率とリクエスト倍率も適用されます。"
  },
  "ru": {
    "{{unit}} tokens": "{{unit}} токенов",
    "Per token": "За токен",
    "Price per request": "Цена за запрос",
    "Tier billing mode": "Тарификация уровня",
    "Token or per-call pricing": "По токенам или за запрос",
    "Use tier(name, fixed(amount)) for a USD price per request. Group and request multipliers still apply.": "Используйте tier(name, fixed(amount)) для цены за запрос в USD. Множители группы и запроса по-прежнему применяются."
  },
  "vi": {
    "{{unit}} tokens": "{{unit}} token",
    "Per token": "Theo token",
    "Price per request": "Giá mỗi yêu cầu",
    "Tier billing mode": "Cách tính phí bậc",
    "Token or per-call pricing": "Tính phí theo token hoặc theo yêu cầu",
    "Use tier(name, fixed(amount)) for a USD price per request. Group and request multipliers still apply.": "Dùng tier(name, fixed(amount)) để đặt giá USD cho mỗi yêu cầu. Hệ số nhóm và yêu cầu vẫn được áp dụng."
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
