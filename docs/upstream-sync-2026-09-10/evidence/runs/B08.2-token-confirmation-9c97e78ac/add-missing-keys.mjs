import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Access tokens are shown only once": "Access tokens are shown only once",
    "For security, existing access tokens cannot be displayed. Regenerate only when you need a new token.": "For security, existing access tokens cannot be displayed. Regenerate only when you need a new token.",
    "Regenerate access token?": "Regenerate access token?",
    "Regenerate token": "Regenerate token",
    "Regenerating immediately invalidates any existing token.": "Regenerating immediately invalidates any existing token.",
    "Save this token now. You won't be able to view it again after closing this dialog.": "Save this token now. You won't be able to view it again after closing this dialog.",
    "The new token will only be shown once. Copy it and store it securely.": "The new token will only be shown once. Copy it and store it securely.",
    "This will immediately invalidate your existing access token. Any applications or scripts using it will stop working.": "This will immediately invalidate your existing access token. Any applications or scripts using it will stop working."
  },
  "zh": {
    "Access tokens are shown only once": "访问令牌仅显示一次",
    "For security, existing access tokens cannot be displayed. Regenerate only when you need a new token.": "出于安全考虑，现有访问令牌无法再次显示。仅在需要新令牌时重新生成。",
    "Regenerate access token?": "重新生成访问令牌？",
    "Regenerate token": "重新生成令牌",
    "Regenerating immediately invalidates any existing token.": "重新生成会立即使所有现有令牌失效。",
    "Save this token now. You won't be able to view it again after closing this dialog.": "请立即保存此令牌。关闭此对话框后，您将无法再次查看。",
    "The new token will only be shown once. Copy it and store it securely.": "新令牌仅显示一次。请复制并妥善保存。",
    "This will immediately invalidate your existing access token. Any applications or scripts using it will stop working.": "这会立即使现有访问令牌失效。任何正在使用它的应用程序或脚本都将停止工作。"
  },
  "zh-TW": {
    "Access tokens are shown only once": "存取令牌僅顯示一次",
    "For security, existing access tokens cannot be displayed. Regenerate only when you need a new token.": "基於安全考量，現有存取令牌無法再次顯示。僅在需要新令牌時重新生成。",
    "Regenerate access token?": "重新生成存取令牌？",
    "Regenerate token": "重新生成令牌",
    "Regenerating immediately invalidates any existing token.": "重新生成會立即使所有現有令牌失效。",
    "Save this token now. You won't be able to view it again after closing this dialog.": "請立即儲存此令牌。關閉此對話框後，您將無法再次查看。",
    "The new token will only be shown once. Copy it and store it securely.": "新令牌僅顯示一次。請複製並妥善保存。",
    "This will immediately invalidate your existing access token. Any applications or scripts using it will stop working.": "這會立即使現有存取令牌失效。任何正在使用它的應用程式或指令碼都將停止運作。"
  },
  "fr": {
    "Access tokens are shown only once": "Les jetons d'accès ne sont affichés qu'une seule fois",
    "For security, existing access tokens cannot be displayed. Regenerate only when you need a new token.": "Pour des raisons de sécurité, les jetons d'accès existants ne peuvent pas être réaffichés. Ne les régénérez que si vous en avez besoin d'un nouveau.",
    "Regenerate access token?": "Régénérer le jeton d'accès ?",
    "Regenerate token": "Régénérer le jeton",
    "Regenerating immediately invalidates any existing token.": "La régénération invalide immédiatement tout jeton existant.",
    "Save this token now. You won't be able to view it again after closing this dialog.": "Enregistrez ce jeton maintenant. Vous ne pourrez plus le consulter après la fermeture de cette boîte de dialogue.",
    "The new token will only be shown once. Copy it and store it securely.": "Le nouveau jeton ne sera affiché qu’une seule fois. Copiez-le et conservez-le en lieu sûr.",
    "This will immediately invalidate your existing access token. Any applications or scripts using it will stop working.": "Cela invalidera immédiatement votre jeton d'accès actuel. Les applications ou scripts qui l'utilisent cesseront de fonctionner."
  },
  "ja": {
    "Access tokens are shown only once": "アクセストークンは一度だけ表示されます",
    "For security, existing access tokens cannot be displayed. Regenerate only when you need a new token.": "セキュリティ上、既存のアクセストークンは再表示できません。新しいトークンが必要な場合のみ再生成してください。",
    "Regenerate access token?": "アクセストークンを再生成しますか？",
    "Regenerate token": "トークンを再生成",
    "Regenerating immediately invalidates any existing token.": "再生成すると、既存のトークンは直ちに無効になります。",
    "Save this token now. You won't be able to view it again after closing this dialog.": "このトークンを今すぐ保存してください。このダイアログを閉じると、再度表示できません。",
    "The new token will only be shown once. Copy it and store it securely.": "新しいトークンは一度だけ表示されます。コピーして安全に保管してください。",
    "This will immediately invalidate your existing access token. Any applications or scripts using it will stop working.": "既存のアクセストークンは直ちに無効になります。使用中のアプリケーションやスクリプトは動作しなくなります。"
  },
  "ru": {
    "Access tokens are shown only once": "Токены доступа отображаются только один раз",
    "For security, existing access tokens cannot be displayed. Regenerate only when you need a new token.": "В целях безопасности существующие токены доступа нельзя просмотреть повторно. Создавайте новый токен только при необходимости.",
    "Regenerate access token?": "Перегенерировать токен доступа?",
    "Regenerate token": "Перегенерировать токен",
    "Regenerating immediately invalidates any existing token.": "Перегенерация немедленно делает недействительными все существующие токены.",
    "Save this token now. You won't be able to view it again after closing this dialog.": "Сохраните этот токен сейчас. После закрытия диалогового окна вы не сможете просмотреть его снова.",
    "The new token will only be shown once. Copy it and store it securely.": "Новый токен будет показан только один раз. Скопируйте его и сохраните в безопасном месте.",
    "This will immediately invalidate your existing access token. Any applications or scripts using it will stop working.": "Это немедленно сделает текущий токен доступа недействительным. Использующие его приложения и скрипты перестанут работать."
  },
  "vi": {
    "Access tokens are shown only once": "Token truy cập chỉ được hiển thị một lần",
    "For security, existing access tokens cannot be displayed. Regenerate only when you need a new token.": "Vì lý do bảo mật, không thể hiển thị lại token truy cập hiện có. Chỉ tạo lại khi bạn cần token mới.",
    "Regenerate access token?": "Tạo lại token truy cập?",
    "Regenerate token": "Tạo lại token",
    "Regenerating immediately invalidates any existing token.": "Việc tạo lại sẽ vô hiệu hóa ngay mọi token hiện có.",
    "Save this token now. You won't be able to view it again after closing this dialog.": "Hãy lưu token này ngay. Bạn sẽ không thể xem lại sau khi đóng hộp thoại.",
    "The new token will only be shown once. Copy it and store it securely.": "Token mới chỉ được hiển thị một lần. Hãy sao chép và lưu trữ an toàn.",
    "This will immediately invalidate your existing access token. Any applications or scripts using it will stop working.": "Thao tác này sẽ vô hiệu hóa ngay token truy cập hiện có. Mọi ứng dụng hoặc tập lệnh đang sử dụng token đó sẽ ngừng hoạt động."
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
