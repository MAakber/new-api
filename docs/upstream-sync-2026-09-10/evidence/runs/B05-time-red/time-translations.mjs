import fs from 'node:fs/promises'
import path from 'node:path'
const LOCALES_DIR = path.resolve('src/i18n/locales')
const newKeys = {
  "en": {
    "Time range": "Time range",
    "Start ≤ end: within the day; start > end: across midnight": "Start ≤ end: within the day; start > end: across midnight"
  },
  "zh": {
    "Time range": "时间范围",
    "Start ≤ end: within the day; start > end: across midnight": "开始 ≤ 结束为当日区间，开始 > 结束为跨零点区间"
  },
  "zh-TW": {
    "Time range": "時間範圍",
    "Start ≤ end: within the day; start > end: across midnight": "開始 ≤ 結束為當日區間，開始 > 結束為跨午夜區間"
  },
  "fr": {
    "Time range": "Plage horaire",
    "Start ≤ end: within the day; start > end: across midnight": "Début ≤ fin : plage dans la journée ; début > fin : plage après minuit"
  },
  "ja": {
    "Time range": "時間範囲",
    "Start ≤ end: within the day; start > end: across midnight": "開始 ≤ 終了は日内範囲、開始 > 終了は日をまたぐ範囲"
  },
  "ru": {
    "Time range": "Временной диапазон",
    "Start ≤ end: within the day; start > end: across midnight": "Начало ≤ конца — в пределах дня, начало > конца — через полночь"
  },
  "vi": {
    "Time range": "Khoảng thời gian",
    "Start ≤ end: within the day; start > end: across midnight": "Bắt đầu ≤ kết thúc: trong ngày; bắt đầu > kết thúc: qua nửa đêm"
  }
}

async function main() {
  for (const [locale, translations] of Object.entries(newKeys)) {
    const file = path.join(LOCALES_DIR, locale + '.json')
    const json = JSON.parse(await fs.readFile(file, 'utf8'))
    for (const [key, value] of Object.entries(translations)) json.translation[key] = value
    json.translation = Object.fromEntries(Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b)))
    await fs.writeFile(file, JSON.stringify(json, null, 2) + '\n', 'utf8')
    console.log(locale + ': ' + Object.keys(translations).length + ' reviewed translations applied')
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
