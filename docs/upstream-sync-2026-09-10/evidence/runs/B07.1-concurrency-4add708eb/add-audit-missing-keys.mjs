import fs from 'node:fs/promises'
import path from 'node:path'
const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) { return JSON.stringify(obj, null, 2) + '\n' }
const newKeys = {
  "en": {
    "Expand all": "Expand all",
    "Added {{count}} models from \"{{name}}\"": "Added {{count}} models from \"{{name}}\"",
    "Test message must not exceed 4096 characters": "Test message must not exceed 4096 characters",
    "Enter a positive integer": "Enter a positive integer"
  },
  "zh": {
    "Expand all": "展开全部",
    "Added {{count}} models from \"{{name}}\"": "已从“{{name}}”添加 {{count}} 个模型",
    "Test message must not exceed 4096 characters": "测试消息不能超过 4096 个字符",
    "Enter a positive integer": "请输入正整数"
  },
  "zh-TW": {
    "Expand all": "展開全部",
    "Added {{count}} models from \"{{name}}\"": "已從「{{name}}」新增 {{count}} 個模型",
    "Test message must not exceed 4096 characters": "測試訊息不能超過 4096 個字元",
    "Enter a positive integer": "請輸入正整數"
  },
  "fr": {
    "Expand all": "Tout développer",
    "Added {{count}} models from \"{{name}}\"": "{{count}} modèles ajoutés depuis « {{name}} »",
    "Test message must not exceed 4096 characters": "Le message de test ne doit pas dépasser 4096 caractères",
    "Enter a positive integer": "Entrez un entier positif"
  },
  "ja": {
    "Expand all": "すべて展開",
    "Added {{count}} models from \"{{name}}\"": "「{{name}}」から {{count}} 個のモデルを追加しました",
    "Test message must not exceed 4096 characters": "テストメッセージは4096文字以内にしてください",
    "Enter a positive integer": "正の整数を入力してください"
  },
  "ru": {
    "Expand all": "Развернуть всё",
    "Added {{count}} models from \"{{name}}\"": "Добавлено моделей из «{{name}}»: {{count}}",
    "Test message must not exceed 4096 characters": "Тестовое сообщение не должно превышать 4096 символов",
    "Enter a positive integer": "Введите положительное целое число"
  },
  "vi": {
    "Expand all": "Mở rộng tất cả",
    "Added {{count}} models from \"{{name}}\"": "Đã thêm {{count}} mô hình từ \"{{name}}\"",
    "Test message must not exceed 4096 characters": "Tin nhắn kiểm tra không được vượt quá 4096 ký tự",
    "Enter a positive integer": "Nhập số nguyên dương"
  }
}
async function main() {
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
  }
}
main().catch(err => { console.error(err); process.exitCode = 1 })
