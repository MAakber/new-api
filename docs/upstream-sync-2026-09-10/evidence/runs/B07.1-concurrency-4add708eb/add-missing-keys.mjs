import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Channel test concurrency": "Channel test concurrency",
    "Channel test concurrency must be between 1 and 32": "Channel test concurrency must be between 1 and 32",
    "Interval must be at least 1 minute": "Interval must be at least 1 minute",
    "Invalid status code rules: {{tokens}}": "Invalid status code rules: {{tokens}}",
    "Maximum number of channels tested at the same time (1-32)": "Maximum number of channels tested at the same time (1-32)"
  },
  "zh": {
    "Channel test concurrency": "渠道测试并发数",
    "Channel test concurrency must be between 1 and 32": "渠道测试并发数必须在 1 到 32 之间",
    "Interval must be at least 1 minute": "间隔必须至少为 1 分钟",
    "Invalid status code rules: {{tokens}}": "无效的状态码规则：{{tokens}}",
    "Maximum number of channels tested at the same time (1-32)": "同时测试的最大渠道数（1-32）"
  },
  "zh-TW": {
    "Channel test concurrency": "渠道測試並行數",
    "Channel test concurrency must be between 1 and 32": "渠道測試並行數必須介於 1 到 32 之間",
    "Interval must be at least 1 minute": "間隔必須至少為 1 分鐘",
    "Invalid status code rules: {{tokens}}": "無效的狀態碼規則：{{tokens}}",
    "Maximum number of channels tested at the same time (1-32)": "同時測試的最大渠道數（1-32）"
  },
  "fr": {
    "Channel test concurrency": "Parallélisme des tests de canaux",
    "Channel test concurrency must be between 1 and 32": "Le parallélisme des tests de canaux doit être compris entre 1 et 32",
    "Interval must be at least 1 minute": "L'intervalle doit être d'au moins 1 minute",
    "Invalid status code rules: {{tokens}}": "Règles de code de statut invalides : {{tokens}}",
    "Maximum number of channels tested at the same time (1-32)": "Nombre maximal de canaux testés simultanément (1 à 32)"
  },
  "ja": {
    "Channel test concurrency": "チャンネルテストの同時実行数",
    "Channel test concurrency must be between 1 and 32": "チャンネルテストの同時実行数は1～32にしてください",
    "Interval must be at least 1 minute": "間隔は1分以上にしてください",
    "Invalid status code rules: {{tokens}}": "無効なステータスコードルール：{{tokens}}",
    "Maximum number of channels tested at the same time (1-32)": "同時にテストするチャンネルの最大数（1～32）"
  },
  "ru": {
    "Channel test concurrency": "Параллельность проверки каналов",
    "Channel test concurrency must be between 1 and 32": "Параллельность проверки каналов должна быть от 1 до 32",
    "Interval must be at least 1 minute": "Интервал должен быть не менее 1 минуты",
    "Invalid status code rules: {{tokens}}": "Недопустимые правила кодов состояния: {{tokens}}",
    "Maximum number of channels tested at the same time (1-32)": "Максимальное число одновременно проверяемых каналов (1–32)"
  },
  "vi": {
    "Channel test concurrency": "Mức đồng thời khi kiểm tra kênh",
    "Channel test concurrency must be between 1 and 32": "Mức đồng thời khi kiểm tra kênh phải từ 1 đến 32",
    "Interval must be at least 1 minute": "Khoảng thời gian phải ít nhất 1 phút",
    "Invalid status code rules: {{tokens}}": "Quy tắc mã trạng thái không hợp lệ: {{tokens}}",
    "Maximum number of channels tested at the same time (1-32)": "Số kênh tối đa được kiểm tra cùng lúc (1–32)"
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
