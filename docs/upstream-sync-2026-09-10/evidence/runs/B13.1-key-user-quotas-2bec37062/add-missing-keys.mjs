import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "API Key Quota": "API Key Quota",
    "Automatic selection": "Automatic selection",
    "Available Balance": "Available Balance",
    "Current total = used + remaining. Changing the remaining quota updates the total and percentage.": "Current total = used + remaining. Changing the remaining quota updates the total and percentage.",
    "Current total quota": "Current total quota",
    "Dynamic multiplier": "Dynamic multiplier",
    "Earnings": "Earnings",
    "Follow user group": "Follow user group",
    "Inherited": "Inherited",
    "Invited {{count}} users": "Invited {{count}} users",
    "No IP restriction": "No IP restriction",
    "No quota limit": "No quota limit",
    "Remaining percentage": "Remaining percentage",
    "Routing Group": "Routing Group",
    "This API key has no quota limit. Requests still require available wallet or subscription quota.": "This API key has no quota limit. Requests still require available wallet or subscription quota.",
    "Total = used + remaining. It is not an initial allocation or a periodic budget; changing the remaining quota changes the total and percentage.": "Total = used + remaining. It is not an initial allocation or a periodic budget; changing the remaining quota changes the total and percentage.",
    "Total Revenue": "Total Revenue",
    "Total Used": "Total Used",
    "Usage percentage": "Usage percentage",
    "Used {{used}} of {{total}} ({{percent}}%)": "Used {{used}} of {{total}} ({{percent}}%)",
    "Used amount": "Used"
  },
  "zh": {
    "API Key Quota": "令牌额度",
    "Automatic selection": "自动选择",
    "Available Balance": "可用余额",
    "Current total = used + remaining. Changing the remaining quota updates the total and percentage.": "当前总额度 = 已用 + 剩余。修改剩余额度后，总额度和已用比例会随之更新。",
    "Current total quota": "当前总额度",
    "Dynamic multiplier": "动态倍率",
    "Earnings": "收益",
    "Follow user group": "跟随用户",
    "Inherited": "继承",
    "Invited {{count}} users": "邀请 {{count}} 人",
    "Last Used": "最后使用",
    "No IP restriction": "未限制",
    "No quota limit": "不限额",
    "Remaining percentage": "剩余比例",
    "Routing Group": "路由分组",
    "This API key has no quota limit. Requests still require available wallet or subscription quota.": "此令牌不限额，请求仍受钱包余额或订阅额度约束。",
    "Total = used + remaining. It is not an initial allocation or a periodic budget; changing the remaining quota changes the total and percentage.": "总额度 = 已用 + 剩余，并非初始额度或周期预算。修改剩余额度会改变总额度和已用比例。",
    "Total Revenue": "累计收益",
    "Total Used": "累计已用",
    "Usage percentage": "已用比例",
    "Used {{used}} of {{total}} ({{percent}}%)": "已用 {{used}} / {{total}}（{{percent}}%）",
    "Used amount": "已用"
  },
  "zh-TW": {
    "API Key Quota": "權杖額度",
    "Automatic selection": "自動選擇",
    "Available Balance": "可用餘額",
    "Current total = used + remaining. Changing the remaining quota updates the total and percentage.": "目前總額度 = 已用 + 剩餘。修改剩餘額度後，總額度和已用比例會隨之更新。",
    "Current total quota": "目前總額度",
    "Dynamic multiplier": "動態倍率",
    "Earnings": "收益",
    "Follow user group": "跟隨使用者",
    "Inherited": "繼承",
    "Invited {{count}} users": "邀請 {{count}} 人",
    "Last Used": "最後使用",
    "No IP restriction": "未限制",
    "No quota limit": "不限額",
    "Remaining percentage": "剩餘比例",
    "Routing Group": "路由分組",
    "This API key has no quota limit. Requests still require available wallet or subscription quota.": "此權杖不限額，請求仍受錢包餘額或訂閱額度限制。",
    "Total = used + remaining. It is not an initial allocation or a periodic budget; changing the remaining quota changes the total and percentage.": "總額度 = 已用 + 剩餘，並非初始額度或週期預算。修改剩餘額度會改變總額度和已用比例。",
    "Total Revenue": "累計收益",
    "Total Used": "累計已用",
    "Usage percentage": "已用比例",
    "Used {{used}} of {{total}} ({{percent}}%)": "已用 {{used}} / {{total}}（{{percent}}%）",
    "Used amount": "已用"
  },
  "fr": {
    "API Key Quota": "Quota de la clé API",
    "Automatic selection": "Sélection auto",
    "Available Balance": "Solde disponible",
    "Current total = used + remaining. Changing the remaining quota updates the total and percentage.": "Total actuel = utilisé + restant. Modifier le quota restant actualise le total et le pourcentage.",
    "Current total quota": "Quota total actuel",
    "Dynamic multiplier": "Multiplicateur variable",
    "Earnings": "Gains",
    "Follow user group": "Groupe utilisateur",
    "Inherited": "Hérité",
    "Invited {{count}} users": "{{count}} invitations",
    "No IP restriction": "Non restreint",
    "No quota limit": "Sans plafond",
    "Remaining percentage": "Pourcentage restant",
    "Routing Group": "Groupe de routage",
    "This API key has no quota limit. Requests still require available wallet or subscription quota.": "Cette clé API est sans plafond. Les requêtes nécessitent toujours un solde ou un quota d’abonnement disponible.",
    "Total = used + remaining. It is not an initial allocation or a periodic budget; changing the remaining quota changes the total and percentage.": "Total = utilisé + restant. Ce n’est ni une allocation initiale ni un budget périodique. Modifier le quota restant change le total et le pourcentage.",
    "Total Revenue": "Revenus cumulés",
    "Total Used": "Total consommé",
    "Usage percentage": "Pourcentage utilisé",
    "Used {{used}} of {{total}} ({{percent}}%)": "Utilisé : {{used}} sur {{total}} ({{percent}} %)",
    "Used amount": "Utilisé"
  },
  "ja": {
    "API Key Quota": "APIキー割当",
    "Automatic selection": "自動選択",
    "Available Balance": "利用可能残高",
    "Current total = used + remaining. Changing the remaining quota updates the total and percentage.": "現在の合計 = 使用済み + 残り。残りの利用枠を変更すると、合計と使用率も更新されます。",
    "Current total quota": "現在の合計枠",
    "Dynamic multiplier": "動的倍率",
    "Earnings": "収益",
    "Follow user group": "ユーザーに従う",
    "Inherited": "継承",
    "Invited {{count}} users": "招待 {{count}} 人",
    "No IP restriction": "制限なし",
    "No quota limit": "上限なし",
    "Remaining percentage": "残りの割合",
    "Routing Group": "ルーティンググループ",
    "This API key has no quota limit. Requests still require available wallet or subscription quota.": "このAPIキーに上限はありませんが、リクエストにはウォレット残高またはサブスクリプションの利用枠が必要です。",
    "Total = used + remaining. It is not an initial allocation or a periodic budget; changing the remaining quota changes the total and percentage.": "合計 = 使用済み + 残り。初期の割当量や期間ごとの予算ではありません。残りを変更すると合計と使用率も変わります。",
    "Total Revenue": "累計収益",
    "Total Used": "累計使用額",
    "Usage percentage": "使用率",
    "Used {{used}} of {{total}} ({{percent}}%)": "使用済み {{used}} / {{total}}（{{percent}}%）",
    "Used amount": "使用済み"
  },
  "ru": {
    "API Key Quota": "Квота API-ключа",
    "Automatic selection": "Автовыбор",
    "Available Balance": "Доступный баланс",
    "Current total = used + remaining. Changing the remaining quota updates the total and percentage.": "Текущий итог = использовано + остаток. Изменение остатка квоты обновляет итог и процент использования.",
    "Current total quota": "Текущая общая квота",
    "Dynamic multiplier": "Динамический множитель",
    "Earnings": "Доход",
    "Follow user group": "Группа пользователя",
    "Inherited": "Наследуется",
    "Invited {{count}} users": "Приглашено: {{count}}",
    "No IP restriction": "Без ограничений",
    "No quota limit": "Без лимита",
    "Remaining percentage": "Оставшаяся доля",
    "Routing Group": "Группа маршрутизации",
    "This API key has no quota limit. Requests still require available wallet or subscription quota.": "У этого API-ключа нет лимита. Для запросов по-прежнему нужен доступный баланс кошелька или квота подписки.",
    "Total = used + remaining. It is not an initial allocation or a periodic budget; changing the remaining quota changes the total and percentage.": "Итого = использовано + остаток. Это не начальная квота и не бюджет на период. Изменение остатка меняет итог и процент использования.",
    "Total Revenue": "Общий доход",
    "Total Used": "Всего использовано",
    "Usage percentage": "Процент использования",
    "Used {{used}} of {{total}} ({{percent}}%)": "Использовано {{used}} из {{total}} ({{percent}}%)",
    "Used amount": "Использовано"
  },
  "vi": {
    "API Key Quota": "Hạn mức khóa API",
    "Automatic selection": "Chọn tự động",
    "Available Balance": "Số dư khả dụng",
    "Current total = used + remaining. Changing the remaining quota updates the total and percentage.": "Tổng hiện tại = đã dùng + còn lại. Thay đổi hạn mức còn lại sẽ cập nhật tổng và tỷ lệ đã dùng.",
    "Current total quota": "Tổng hạn mức hiện tại",
    "Dynamic multiplier": "Hệ số động",
    "Earnings": "Thu nhập",
    "Follow user group": "Theo nhóm người dùng",
    "Inherited": "Kế thừa",
    "Invited {{count}} users": "Đã mời {{count}} người",
    "No IP restriction": "Không giới hạn",
    "No quota limit": "Không giới hạn",
    "Remaining percentage": "Tỷ lệ còn lại",
    "Routing Group": "Nhóm định tuyến",
    "This API key has no quota limit. Requests still require available wallet or subscription quota.": "Khóa API này không có hạn mức. Yêu cầu vẫn cần số dư ví hoặc hạn mức gói đăng ký khả dụng.",
    "Total = used + remaining. It is not an initial allocation or a periodic budget; changing the remaining quota changes the total and percentage.": "Tổng = đã dùng + còn lại, không phải hạn mức ban đầu hay ngân sách định kỳ. Thay đổi phần còn lại sẽ thay đổi tổng và tỷ lệ đã dùng.",
    "Total Revenue": "Tổng thu nhập",
    "Total Used": "Tổng đã dùng",
    "Usage percentage": "Tỷ lệ đã dùng",
    "Used {{used}} of {{total}} ({{percent}}%)": "Đã dùng {{used}} trên {{total}} ({{percent}}%)",
    "Used amount": "Đã dùng"
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
