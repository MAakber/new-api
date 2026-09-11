import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Delete model \"{{name}}\"? This cannot be undone.": "Delete model \"{{name}}\"? This cannot be undone.",
    "{{count}} announcements deleted. Click \"Save Settings\" to apply.": "{{count}} announcements deleted. Click \"Save Settings\" to apply.",
    "{{count}} API entries deleted. Click \"Save Settings\" to apply.": "{{count}} API entries deleted. Click \"Save Settings\" to apply.",
    "{{count}} FAQs deleted. Click \"Save Settings\" to apply.": "{{count}} FAQs deleted. Click \"Save Settings\" to apply.",
    "{{count}} groups deleted. Click \"Save Settings\" to apply.": "{{count}} groups deleted. Click \"Save Settings\" to apply."
  },
  "zh": {
    "Delete model \"{{name}}\"? This cannot be undone.": "确定删除模型“{{name}}”吗？此操作无法撤销。",
    "{{count}} announcements deleted. Click \"Save Settings\" to apply.": "已删除 {{count}} 条公告。点击“保存设置”生效。",
    "{{count}} API entries deleted. Click \"Save Settings\" to apply.": "已删除 {{count}} 条 API 信息。点击“保存设置”生效。",
    "{{count}} FAQs deleted. Click \"Save Settings\" to apply.": "已删除 {{count}} 条常见问题。点击“保存设置”生效。",
    "{{count}} groups deleted. Click \"Save Settings\" to apply.": "已删除 {{count}} 个分组。点击“保存设置”生效。"
  },
  "zh-TW": {
    "Delete model \"{{name}}\"? This cannot be undone.": "確定刪除模型「{{name}}」嗎？此操作無法復原。",
    "{{count}} announcements deleted. Click \"Save Settings\" to apply.": "已刪除 {{count}} 則公告。點擊「儲存設定」以套用。",
    "{{count}} API entries deleted. Click \"Save Settings\" to apply.": "已刪除 {{count}} 筆 API 資訊。點擊「儲存設定」以套用。",
    "{{count}} FAQs deleted. Click \"Save Settings\" to apply.": "已刪除 {{count}} 則常見問題。點擊「儲存設定」以套用。",
    "{{count}} groups deleted. Click \"Save Settings\" to apply.": "已刪除 {{count}} 個群組。點擊「儲存設定」以套用。"
  },
  "fr": {
    "Delete model \"{{name}}\"? This cannot be undone.": "Supprimer le modèle « {{name}} » ? Cette action est irréversible.",
    "{{count}} announcements deleted. Click \"Save Settings\" to apply.": "{{count}} annonces supprimées. Cliquez sur « Enregistrer les paramètres » pour appliquer.",
    "{{count}} API entries deleted. Click \"Save Settings\" to apply.": "{{count}} entrées API supprimées. Cliquez sur « Enregistrer les paramètres » pour appliquer.",
    "{{count}} FAQs deleted. Click \"Save Settings\" to apply.": "{{count}} questions fréquentes supprimées. Cliquez sur « Enregistrer les paramètres » pour appliquer.",
    "{{count}} groups deleted. Click \"Save Settings\" to apply.": "{{count}} groupes supprimés. Cliquez sur « Enregistrer les paramètres » pour appliquer."
  },
  "ja": {
    "Delete model \"{{name}}\"? This cannot be undone.": "モデル「{{name}}」を削除しますか？この操作は取り消せません。",
    "{{count}} announcements deleted. Click \"Save Settings\" to apply.": "{{count}} 件のお知らせを削除しました。「設定を保存」をクリックして適用してください。",
    "{{count}} API entries deleted. Click \"Save Settings\" to apply.": "{{count}} 件の API 情報を削除しました。「設定を保存」をクリックして適用してください。",
    "{{count}} FAQs deleted. Click \"Save Settings\" to apply.": "{{count}} 件のよくある質問を削除しました。「設定を保存」をクリックして適用してください。",
    "{{count}} groups deleted. Click \"Save Settings\" to apply.": "{{count}} 個のグループを削除しました。「設定を保存」をクリックして適用してください。"
  },
  "ru": {
    "Delete model \"{{name}}\"? This cannot be undone.": "Удалить модель «{{name}}»? Это действие нельзя отменить.",
    "{{count}} announcements deleted. Click \"Save Settings\" to apply.": "Удалено объявлений: {{count}}. Нажмите «Сохранить настройки», чтобы применить изменения.",
    "{{count}} API entries deleted. Click \"Save Settings\" to apply.": "Удалено записей API: {{count}}. Нажмите «Сохранить настройки», чтобы применить изменения.",
    "{{count}} FAQs deleted. Click \"Save Settings\" to apply.": "Удалено частых вопросов: {{count}}. Нажмите «Сохранить настройки», чтобы применить изменения.",
    "{{count}} groups deleted. Click \"Save Settings\" to apply.": "Удалено групп: {{count}}. Нажмите «Сохранить настройки», чтобы применить изменения."
  },
  "vi": {
    "Delete model \"{{name}}\"? This cannot be undone.": "Xóa mô hình \"{{name}}\"? Không thể hoàn tác thao tác này.",
    "{{count}} announcements deleted. Click \"Save Settings\" to apply.": "Đã xóa {{count}} thông báo. Nhấp vào \"Lưu cài đặt\" để áp dụng.",
    "{{count}} API entries deleted. Click \"Save Settings\" to apply.": "Đã xóa {{count}} mục API. Nhấp vào \"Lưu cài đặt\" để áp dụng.",
    "{{count}} FAQs deleted. Click \"Save Settings\" to apply.": "Đã xóa {{count}} câu hỏi thường gặp. Nhấp vào \"Lưu cài đặt\" để áp dụng.",
    "{{count}} groups deleted. Click \"Save Settings\" to apply.": "Đã xóa {{count}} nhóm. Nhấp vào \"Lưu cài đặt\" để áp dụng."
  }
}

async function main() {
  let totalAdded = 0
  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
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
    console.log(`${locale}: ${count} translations applied`)
    totalAdded += count
  }
  console.log(`Total: ${totalAdded} translations applied`)
}
main().catch((err) => { console.error(err); process.exitCode = 1 })

