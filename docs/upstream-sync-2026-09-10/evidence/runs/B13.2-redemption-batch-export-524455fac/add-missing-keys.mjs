import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Include reward": "Include reward",
    "Batch deleted {{count}} redemption codes": "Batch deleted {{count}} redemption codes",
    "Batch deleted redemption codes (count not recorded)": "Batch deleted redemption codes (count not recorded)",
    "Delete {{count}} redemption codes?": "Delete {{count}} redemption codes?",
    "Delete selected redemption codes": "Delete selected redemption codes",
    "Failed to batch delete redemption codes": "Failed to batch delete redemption codes",
    "Failed to delete {{count}} redemption codes": "Failed to delete {{count}} redemption codes",
    "Include name": "Include name",
    "Include quota": "Include quota",
    "Redemption codes created": "Redemption codes created",
    "Requested redemption code IDs": "Requested redemption code IDs",
    "Save as a file": "Save as a file",
    "Save as Markdown": "Save as Markdown",
    "Save as TXT": "Save as TXT",
    "Save redemption codes": "Save redemption codes",
    "Successfully deleted {{count}} redemption codes": "Successfully deleted {{count}} redemption codes"
  },
  "zh": {
    "Include reward": "包含权益",
    "Batch deleted {{count}} redemption codes": "批量删除了 {{count}} 个兑换码",
    "Batch deleted redemption codes (count not recorded)": "批量删除兑换码（数量未记录）",
    "Delete {{count}} redemption codes?": "删除 {{count}} 个兑换码？",
    "Delete selected redemption codes": "删除选中的兑换码",
    "Failed to batch delete redemption codes": "批量删除兑换码失败",
    "Failed to delete {{count}} redemption codes": "{{count}} 个兑换码删除失败",
    "Include name": "包含名称",
    "Include quota": "包含额度",
    "Redemption codes created": "兑换码创建完成",
    "Requested redemption code IDs": "请求删除的兑换码 ID",
    "Save as a file": "保存为文件",
    "Save as Markdown": "保存为 Markdown",
    "Save as TXT": "保存为 TXT",
    "Save redemption codes": "保存兑换码",
    "Successfully deleted {{count}} redemption codes": "成功删除 {{count}} 个兑换码"
  },
  "zh-TW": {
    "Include reward": "包含權益",
    "Batch deleted {{count}} redemption codes": "批次刪除了 {{count}} 個兌換碼",
    "Batch deleted redemption codes (count not recorded)": "批次刪除兌換碼（數量未記錄）",
    "Delete {{count}} redemption codes?": "刪除 {{count}} 個兌換碼？",
    "Delete selected redemption codes": "刪除選取的兌換碼",
    "Failed to batch delete redemption codes": "批次刪除兌換碼失敗",
    "Failed to delete {{count}} redemption codes": "{{count}} 個兌換碼刪除失敗",
    "Include name": "包含名稱",
    "Include quota": "包含額度",
    "Redemption codes created": "兌換碼建立完成",
    "Requested redemption code IDs": "請求刪除的兌換碼 ID",
    "Save as a file": "儲存為檔案",
    "Save as Markdown": "儲存為 Markdown",
    "Save as TXT": "儲存為 TXT",
    "Save redemption codes": "儲存兌換碼",
    "Successfully deleted {{count}} redemption codes": "成功刪除 {{count}} 個兌換碼"
  },
  "fr": {
    "Include reward": "Inclure la récompense",
    "Batch deleted {{count}} redemption codes": "{{count}} codes d’échange supprimés en lot",
    "Batch deleted redemption codes (count not recorded)": "Codes d’échange supprimés en lot (nombre non enregistré)",
    "Delete {{count}} redemption codes?": "Supprimer {{count}} codes d’échange ?",
    "Delete selected redemption codes": "Supprimer les codes sélectionnés",
    "Failed to batch delete redemption codes": "Échec de la suppression des codes d’échange en lot",
    "Failed to delete {{count}} redemption codes": "Échec de la suppression de {{count}} codes d’échange",
    "Include name": "Inclure le nom",
    "Include quota": "Inclure le quota",
    "Redemption codes created": "Codes d’échange créés",
    "Requested redemption code IDs": "ID des codes d’échange à supprimer",
    "Save as a file": "Enregistrer dans un fichier",
    "Save as Markdown": "Enregistrer en Markdown",
    "Save as TXT": "Enregistrer en TXT",
    "Save redemption codes": "Enregistrer les codes d’échange",
    "Successfully deleted {{count}} redemption codes": "{{count}} codes d’échange supprimés"
  },
  "ja": {
    "Include reward": "特典を含める",
    "Batch deleted {{count}} redemption codes": "{{count}} 件の引き換えコードを一括削除しました",
    "Batch deleted redemption codes (count not recorded)": "引き換えコードを一括削除（件数未記録）",
    "Delete {{count}} redemption codes?": "{{count}} 件の引き換えコードを削除しますか？",
    "Delete selected redemption codes": "選択した引き換えコードを削除",
    "Failed to batch delete redemption codes": "引き換えコードの一括削除に失敗しました",
    "Failed to delete {{count}} redemption codes": "{{count}} 件の引き換えコードを削除できませんでした",
    "Include name": "名前を含める",
    "Include quota": "クォータを含める",
    "Redemption codes created": "引き換えコードを作成しました",
    "Requested redemption code IDs": "削除を要求した引き換えコードの ID",
    "Save as a file": "ファイルに保存",
    "Save as Markdown": "Markdown で保存",
    "Save as TXT": "TXT で保存",
    "Save redemption codes": "引き換えコードを保存",
    "Successfully deleted {{count}} redemption codes": "{{count}} 件の引き換えコードを削除しました"
  },
  "ru": {
    "Include reward": "Включить вознаграждение",
    "Batch deleted {{count}} redemption codes": "Массово удалено кодов погашения: {{count}}",
    "Batch deleted redemption codes (count not recorded)": "Массовое удаление кодов погашения (количество не записано)",
    "Delete {{count}} redemption codes?": "Удалить коды погашения ({{count}})?",
    "Delete selected redemption codes": "Удалить выбранные коды погашения",
    "Failed to batch delete redemption codes": "Не удалось массово удалить коды погашения",
    "Failed to delete {{count}} redemption codes": "Не удалось удалить коды погашения: {{count}}",
    "Include name": "Включить название",
    "Include quota": "Включить квоту",
    "Redemption codes created": "Коды погашения созданы",
    "Requested redemption code IDs": "ID кодов погашения, запрошенных к удалению",
    "Save as a file": "Сохранить в файл",
    "Save as Markdown": "Сохранить в Markdown",
    "Save as TXT": "Сохранить в TXT",
    "Save redemption codes": "Сохранить коды погашения",
    "Successfully deleted {{count}} redemption codes": "Коды погашения удалены: {{count}}"
  },
  "vi": {
    "Include reward": "Bao gồm quyền lợi",
    "Batch deleted {{count}} redemption codes": "Đã xóa hàng loạt {{count}} mã quy đổi",
    "Batch deleted redemption codes (count not recorded)": "Đã xóa hàng loạt mã quy đổi (không ghi lại số lượng)",
    "Delete {{count}} redemption codes?": "Xóa {{count}} mã quy đổi?",
    "Delete selected redemption codes": "Xóa mã quy đổi đã chọn",
    "Failed to batch delete redemption codes": "Không thể xóa hàng loạt mã quy đổi",
    "Failed to delete {{count}} redemption codes": "Không thể xóa {{count}} mã quy đổi",
    "Include name": "Bao gồm tên",
    "Include quota": "Bao gồm hạn mức",
    "Redemption codes created": "Đã tạo mã quy đổi",
    "Requested redemption code IDs": "ID mã quy đổi được yêu cầu xóa",
    "Save as a file": "Lưu thành tệp",
    "Save as Markdown": "Lưu dạng Markdown",
    "Save as TXT": "Lưu dạng TXT",
    "Save redemption codes": "Lưu mã quy đổi",
    "Successfully deleted {{count}} redemption codes": "Đã xóa {{count}} mã quy đổi"
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
