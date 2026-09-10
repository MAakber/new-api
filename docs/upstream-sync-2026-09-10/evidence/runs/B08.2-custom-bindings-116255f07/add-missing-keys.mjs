import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.": "Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.",
    "e.g. Requires level {{required}}; your current level is {{current}}": "e.g. Requires level {{required}}; your current level is {{current}}",
    "Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.": "Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.",
    "Fill template: level and active": "Fill template: level and active",
    "Fill template: level message": "Fill template: level message",
    "Fill template: organization message": "Fill template: organization message",
    "Fill template: organization or role": "Fill template: organization or role",
    "Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users.": "Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users."
  },
  "zh": {
    "Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.": "可用变量：{{provider}}、{{field}}、{{op}}、{{required}}、{{current}}，以及 {{current.roles}} 等路径变量。",
    "e.g. Requires level {{required}}; your current level is {{current}}": "例如：需要等级 {{required}}；你当前的等级是 {{current}}",
    "Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.": "根据提供商返回的用户信息字段执行策略判断。条件和嵌套分组支持 and/or 逻辑。",
    "Fill template: level and active": "填充模板：等级和激活状态",
    "Fill template: level message": "填充模板：等级提示",
    "Fill template: organization message": "填充模板：组织提示",
    "Fill template: organization or role": "填充模板：组织或角色",
    "Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users.": "支持的操作符：eq、ne、gt、gte、lt、lte、in、not_in、contains、not_contains、exists、not_exists。留空则允许所有用户。"
  },
  "zh-TW": {
    "Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.": "可用變數：{{provider}}、{{field}}、{{op}}、{{required}}、{{current}}，以及 {{current.roles}} 等路徑變數。",
    "e.g. Requires level {{required}}; your current level is {{current}}": "例如：需要等級 {{required}}；你目前的等級是 {{current}}",
    "Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.": "根據提供商回傳的用戶資訊欄位執行政策判斷。條件和巢狀分組支援 and/or 邏輯。",
    "Fill template: level and active": "填入模板：等級和啟用狀態",
    "Fill template: level message": "填入模板：等級提示",
    "Fill template: organization message": "填入模板：組織提示",
    "Fill template: organization or role": "填入模板：組織或角色",
    "Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users.": "支援的操作符：eq、ne、gt、gte、lt、lte、in、not_in、contains、not_contains、exists、not_exists。留空則允許所有用戶。"
  },
  "fr": {
    "Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.": "Variables disponibles : {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, ainsi que des chemins comme {{current.roles}}.",
    "e.g. Requires level {{required}}; your current level is {{current}}": "ex. Niveau {{required}} requis ; votre niveau actuel est {{current}}",
    "Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.": "Évalue les champs de la réponse d'informations utilisateur du fournisseur. Les conditions et groupes imbriqués utilisent la logique and/or.",
    "Fill template: level and active": "Insérer le modèle : niveau et état actif",
    "Fill template: level message": "Insérer le modèle : message de niveau",
    "Fill template: organization message": "Insérer le modèle : message d'organisation",
    "Fill template: organization or role": "Insérer le modèle : organisation ou rôle",
    "Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users.": "Opérateurs pris en charge : eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Laissez vide pour autoriser tous les utilisateurs."
  },
  "ja": {
    "Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.": "使用可能な変数：{{provider}}、{{field}}、{{op}}、{{required}}、{{current}}、および {{current.roles}} のようなパス。",
    "e.g. Requires level {{required}}; your current level is {{current}}": "例：レベル {{required}} が必要です。現在のレベルは {{current}} です",
    "Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.": "プロバイダーのユーザー情報レスポンスのフィールドを評価します。条件とネストしたグループでは and/or ロジックを使用します。",
    "Fill template: level and active": "テンプレートを入力：レベルと有効状態",
    "Fill template: level message": "テンプレートを入力：レベルメッセージ",
    "Fill template: organization message": "テンプレートを入力：組織メッセージ",
    "Fill template: organization or role": "テンプレートを入力：組織またはロール",
    "Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users.": "対応演算子：eq、ne、gt、gte、lt、lte、in、not_in、contains、not_contains、exists、not_exists。すべてのユーザーを許可する場合は空のままにしてください。"
  },
  "ru": {
    "Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.": "Доступные переменные: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, а также пути вида {{current.roles}}.",
    "e.g. Requires level {{required}}; your current level is {{current}}": "напр. Требуется уровень {{required}}; ваш текущий уровень — {{current}}",
    "Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.": "Проверяет поля ответа с данными пользователя от провайдера. Условия и вложенные группы используют логику and/or.",
    "Fill template: level and active": "Заполнить шаблон: уровень и активность",
    "Fill template: level message": "Заполнить шаблон: сообщение об уровне",
    "Fill template: organization message": "Заполнить шаблон: сообщение об организации",
    "Fill template: organization or role": "Заполнить шаблон: организация или роль",
    "Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users.": "Поддерживаемые операторы: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Оставьте поле пустым, чтобы разрешить доступ всем пользователям."
  },
  "vi": {
    "Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.": "Các biến khả dụng: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}} và các đường dẫn như {{current.roles}}.",
    "e.g. Requires level {{required}}; your current level is {{current}}": "ví dụ: Yêu cầu cấp độ {{required}}; cấp độ hiện tại của bạn là {{current}}",
    "Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.": "Đánh giá các trường trong phản hồi thông tin người dùng của nhà cung cấp. Điều kiện và nhóm lồng nhau sử dụng logic and/or.",
    "Fill template: level and active": "Điền mẫu: cấp độ và trạng thái hoạt động",
    "Fill template: level message": "Điền mẫu: thông báo cấp độ",
    "Fill template: organization message": "Điền mẫu: thông báo tổ chức",
    "Fill template: organization or role": "Điền mẫu: tổ chức hoặc vai trò",
    "Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users.": "Toán tử được hỗ trợ: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Để trống để cho phép tất cả người dùng."
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
