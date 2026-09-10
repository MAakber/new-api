import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Models listed here skip automatic -thinking / -nothinking suffix handling. Matched names are also exempt from @-modifier parsing and 400 validation. Prefix an entry with re: to match the full model name as a Go regular expression, for example re:.*@sha256:.*": "Models listed here skip automatic -thinking / -nothinking suffix handling. Matched names are also exempt from @-modifier parsing and 400 validation. Prefix an entry with re: to match the full model name as a Go regular expression, for example re:.*@sha256:.*"
  },
  "zh": {
    "Models listed here skip automatic -thinking / -nothinking suffix handling. Matched names are also exempt from @-modifier parsing and 400 validation. Prefix an entry with re: to match the full model name as a Go regular expression, for example re:.*@sha256:.*": "此处列出的模型不会自动添加或移除 -thinking / -nothinking 后缀。命中的模型同时豁免 @ 修饰符解析与 400 校验。以 re: 开头的条目会按 Go 正则匹配完整模型名，例如 re:.*@sha256:.*。"
  },
  "zh-TW": {
    "Models listed here skip automatic -thinking / -nothinking suffix handling. Matched names are also exempt from @-modifier parsing and 400 validation. Prefix an entry with re: to match the full model name as a Go regular expression, for example re:.*@sha256:.*": "此處列出的模型不會自動新增或移除 -thinking / -nothinking 後綴。命中的模型同時豁免 @ 修飾符解析與 400 校驗。以 re: 開頭的條目會以 Go 正規表示式匹配完整模型名稱，例如 re:.*@sha256:.*。"
  },
  "fr": {
    "Models listed here skip automatic -thinking / -nothinking suffix handling. Matched names are also exempt from @-modifier parsing and 400 validation. Prefix an entry with re: to match the full model name as a Go regular expression, for example re:.*@sha256:.*": "Les modèles listés ici n'ajoutent ni ne retirent automatiquement les suffixes -thinking / -nothinking. Les noms correspondants sont aussi exemptés de l'analyse et de la validation des modificateurs @ (erreur 400). Un préfixe re: interprète l'entrée comme une expression régulière Go sur le nom complet, par exemple re:.*@sha256:.*"
  },
  "ja": {
    "Models listed here skip automatic -thinking / -nothinking suffix handling. Matched names are also exempt from @-modifier parsing and 400 validation. Prefix an entry with re: to match the full model name as a Go regular expression, for example re:.*@sha256:.*": "ここに記載されたモデルは、-thinking / -nothinking サフィックスの自動付与・削除を行いません。一致した名前は @ 修飾子の解析および 400 バリデーションからも除外されます。re: で始まる項目は完全なモデル名に対する Go 正規表現として扱われます（例: re:.*@sha256:.*）。"
  },
  "ru": {
    "Models listed here skip automatic -thinking / -nothinking suffix handling. Matched names are also exempt from @-modifier parsing and 400 validation. Prefix an entry with re: to match the full model name as a Go regular expression, for example re:.*@sha256:.*": "Модели из этого списка не получают и не теряют автоматически суффиксы -thinking / -nothinking. Совпавшие имена также освобождаются от разбора модификаторов @ и проверки с ответом 400. Запись с префиксом re: — регулярное выражение Go по полному имени модели, например re:.*@sha256:.*"
  },
  "vi": {
    "Models listed here skip automatic -thinking / -nothinking suffix handling. Matched names are also exempt from @-modifier parsing and 400 validation. Prefix an entry with re: to match the full model name as a Go regular expression, for example re:.*@sha256:.*": "Các mô hình được liệt kê ở đây sẽ không tự động thêm hoặc xóa hậu tố -thinking / -nothinking. Tên khớp cũng được miễn phân tích và kiểm tra (400) cho bộ sửa đổi @. Mục bắt đầu bằng re: được coi là biểu thức chính quy Go khớp toàn bộ tên mô hình, ví dụ re:.*@sha256:.*"
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
