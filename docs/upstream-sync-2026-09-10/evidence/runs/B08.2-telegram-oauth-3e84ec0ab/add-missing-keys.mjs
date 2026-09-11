import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "In BotFather, open Login Widget, register this callback URL, and copy the Client ID and Client Secret. Existing Telegram bindings will continue to work after configuration.": "In BotFather, open Login Widget, register this callback URL, and copy the Client ID and Client Secret. Existing Telegram bindings will continue to work after configuration.",
    "Login session": "Login session",
    "Telegram authorization failed. Please try again.": "Telegram authorization failed. Please try again.",
    "Telegram login has changed. Reload the page and start Telegram OAuth again.": "Telegram login has changed. Reload the page and start Telegram OAuth again.",
    "Telegram OAuth Client ID from BotFather": "Telegram OAuth Client ID from BotFather",
    "Telegram OAuth Client Secret from BotFather": "Telegram OAuth Client Secret from BotFather",
    "Telegram OAuth is not configured or enabled. Please contact your administrator.": "Telegram OAuth is not configured or enabled. Please contact your administrator.",
    "The telegram OAuth provider name is reserved. Ask your administrator to rename the conflicting custom provider.": "The telegram OAuth provider name is reserved. Ask your administrator to rename the conflicting custom provider.",
    "This Telegram account is not linked. Sign in using another method and link it first.": "This Telegram account is not linked. Sign in using another method and link it first."
  },
  "zh": {
    "In BotFather, open Login Widget, register this callback URL, and copy the Client ID and Client Secret. Existing Telegram bindings will continue to work after configuration.": "在 BotFather 中打开 Login Widget，登记此回调地址并复制 Client ID 和 Client Secret。完成配置后，现有 Telegram 绑定可继续使用。",
    "Login session": "登录会话",
    "Telegram authorization failed. Please try again.": "Telegram 授权失败，请重试。",
    "Telegram login has changed. Reload the page and start Telegram OAuth again.": "Telegram 登录方式已更新，请刷新页面并重新发起 Telegram OAuth 登录。",
    "Telegram OAuth Client ID from BotFather": "BotFather 提供的 Telegram OAuth Client ID",
    "Telegram OAuth Client Secret from BotFather": "BotFather 提供的 Telegram OAuth Client Secret",
    "Telegram OAuth is not configured or enabled. Please contact your administrator.": "Telegram OAuth 尚未配置或启用，请联系管理员。",
    "The telegram OAuth provider name is reserved. Ask your administrator to rename the conflicting custom provider.": "telegram 是保留的 OAuth 提供方名称，请联系管理员重命名冲突的自定义提供方。",
    "This Telegram account is not linked. Sign in using another method and link it first.": "此 Telegram 账号尚未绑定，请先通过其他方式登录并绑定。"
  },
  "zh-TW": {
    "In BotFather, open Login Widget, register this callback URL, and copy the Client ID and Client Secret. Existing Telegram bindings will continue to work after configuration.": "在 BotFather 中開啟 Login Widget，登記此回呼網址並複製 Client ID 和 Client Secret。完成設定後，現有 Telegram 綁定可繼續使用。",
    "Login session": "登入工作階段",
    "Telegram authorization failed. Please try again.": "Telegram 授權失敗，請重試。",
    "Telegram login has changed. Reload the page and start Telegram OAuth again.": "Telegram 登入方式已更新，請重新載入頁面並重新發起 Telegram OAuth 登入。",
    "Telegram OAuth Client ID from BotFather": "BotFather 提供的 Telegram OAuth Client ID",
    "Telegram OAuth Client Secret from BotFather": "BotFather 提供的 Telegram OAuth Client Secret",
    "Telegram OAuth is not configured or enabled. Please contact your administrator.": "Telegram OAuth 尚未設定或啟用，請聯絡管理員。",
    "The telegram OAuth provider name is reserved. Ask your administrator to rename the conflicting custom provider.": "telegram 是保留的 OAuth 提供方名稱，請聯絡管理員重新命名衝突的自訂提供方。",
    "This Telegram account is not linked. Sign in using another method and link it first.": "此 Telegram 帳號尚未綁定，請先透過其他方式登入並綁定。"
  },
  "fr": {
    "In BotFather, open Login Widget, register this callback URL, and copy the Client ID and Client Secret. Existing Telegram bindings will continue to work after configuration.": "Dans BotFather, ouvrez Login Widget, enregistrez cette URL de rappel et copiez le Client ID et le Client Secret. Les comptes Telegram déjà liés fonctionneront après la configuration.",
    "Login session": "Session de connexion",
    "Telegram authorization failed. Please try again.": "L’autorisation Telegram a échoué. Réessayez.",
    "Telegram login has changed. Reload the page and start Telegram OAuth again.": "La connexion Telegram a changé. Rechargez la page et relancez Telegram OAuth.",
    "Telegram OAuth Client ID from BotFather": "Client ID Telegram OAuth fourni par BotFather",
    "Telegram OAuth Client Secret from BotFather": "Client Secret Telegram OAuth fourni par BotFather",
    "Telegram OAuth is not configured or enabled. Please contact your administrator.": "Telegram OAuth n’est pas configuré ou activé. Contactez votre administrateur.",
    "The telegram OAuth provider name is reserved. Ask your administrator to rename the conflicting custom provider.": "Le nom de fournisseur OAuth telegram est réservé. Demandez à votre administrateur de renommer le fournisseur personnalisé en conflit.",
    "This Telegram account is not linked. Sign in using another method and link it first.": "Ce compte Telegram n’est pas lié. Connectez-vous autrement pour le lier."
  },
  "ja": {
    "In BotFather, open Login Widget, register this callback URL, and copy the Client ID and Client Secret. Existing Telegram bindings will continue to work after configuration.": "BotFather で Login Widget を開き、このコールバック URL を登録して Client ID と Client Secret をコピーしてください。設定後は既存の Telegram 連携を引き続き利用できます。",
    "Login session": "ログインセッション",
    "Telegram authorization failed. Please try again.": "Telegram の認証に失敗しました。もう一度お試しください。",
    "Telegram login has changed. Reload the page and start Telegram OAuth again.": "Telegram のログイン方法が更新されました。ページを再読み込みし、Telegram OAuth をやり直してください。",
    "Telegram OAuth Client ID from BotFather": "BotFather が発行した Telegram OAuth Client ID",
    "Telegram OAuth Client Secret from BotFather": "BotFather が発行した Telegram OAuth Client Secret",
    "Telegram OAuth is not configured or enabled. Please contact your administrator.": "Telegram OAuth が設定されていないか、無効になっています。管理者にお問い合わせください。",
    "The telegram OAuth provider name is reserved. Ask your administrator to rename the conflicting custom provider.": "OAuth プロバイダー名 telegram は予約されています。管理者に競合するカスタムプロバイダーの名前変更を依頼してください。",
    "This Telegram account is not linked. Sign in using another method and link it first.": "この Telegram アカウントは連携されていません。別の方法でログインしてから連携してください。"
  },
  "ru": {
    "In BotFather, open Login Widget, register this callback URL, and copy the Client ID and Client Secret. Existing Telegram bindings will continue to work after configuration.": "Откройте Login Widget в BotFather, зарегистрируйте этот URL обратного вызова и скопируйте Client ID и Client Secret. После настройки существующие привязки Telegram продолжат работать.",
    "Login session": "Сеанс входа",
    "Telegram authorization failed. Please try again.": "Не удалось выполнить авторизацию Telegram. Повторите попытку.",
    "Telegram login has changed. Reload the page and start Telegram OAuth again.": "Способ входа через Telegram изменился. Обновите страницу и снова начните вход через Telegram OAuth.",
    "Telegram OAuth Client ID from BotFather": "Client ID Telegram OAuth из BotFather",
    "Telegram OAuth Client Secret from BotFather": "Client Secret Telegram OAuth из BotFather",
    "Telegram OAuth is not configured or enabled. Please contact your administrator.": "Telegram OAuth не настроен или отключён. Обратитесь к администратору.",
    "The telegram OAuth provider name is reserved. Ask your administrator to rename the conflicting custom provider.": "Имя OAuth-провайдера telegram зарезервировано. Попросите администратора переименовать конфликтующего пользовательского провайдера.",
    "This Telegram account is not linked. Sign in using another method and link it first.": "Этот аккаунт Telegram не привязан. Войдите другим способом и привяжите его."
  },
  "vi": {
    "In BotFather, open Login Widget, register this callback URL, and copy the Client ID and Client Secret. Existing Telegram bindings will continue to work after configuration.": "Trong BotFather, mở Login Widget, đăng ký URL gọi lại này và sao chép Client ID cùng Client Secret. Các liên kết Telegram hiện có sẽ tiếp tục hoạt động sau khi cấu hình.",
    "Login session": "Phiên đăng nhập",
    "Telegram authorization failed. Please try again.": "Ủy quyền Telegram thất bại. Vui lòng thử lại.",
    "Telegram login has changed. Reload the page and start Telegram OAuth again.": "Cách đăng nhập Telegram đã thay đổi. Hãy tải lại trang và bắt đầu lại Telegram OAuth.",
    "Telegram OAuth Client ID from BotFather": "Client ID Telegram OAuth từ BotFather",
    "Telegram OAuth Client Secret from BotFather": "Client Secret Telegram OAuth từ BotFather",
    "Telegram OAuth is not configured or enabled. Please contact your administrator.": "Telegram OAuth chưa được cấu hình hoặc bật. Vui lòng liên hệ quản trị viên.",
    "The telegram OAuth provider name is reserved. Ask your administrator to rename the conflicting custom provider.": "Tên nhà cung cấp OAuth telegram đã được dành riêng. Hãy nhờ quản trị viên đổi tên nhà cung cấp tùy chỉnh bị trùng.",
    "This Telegram account is not linked. Sign in using another method and link it first.": "Tài khoản Telegram này chưa được liên kết. Hãy đăng nhập bằng cách khác rồi liên kết tài khoản."
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
