import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}
const newKeys = {
  "en": {
    "Account deletion": "Account deletion",
    "Complete sign-in": "Complete sign-in",
    "Enter the 6-digit authenticator code.": "Enter the 6-digit authenticator code.",
    "I understand that disabling 2FA removes its authenticator and backup codes.": "I understand that disabling 2FA removes its authenticator and backup codes.",
    "Verify your identity to finish signing in.": "Verify your identity to finish signing in."
  },
  "zh": {
    "Account deletion": "账号注销",
    "Complete sign-in": "完成登录",
    "Enter the 6-digit authenticator code.": "请输入身份验证器中的 6 位验证码。",
    "I understand that disabling 2FA removes its authenticator and backup codes.": "我了解，关闭 2FA 将移除身份验证器验证方式及其备用码。",
    "Verify your identity to finish signing in.": "请验证身份以完成登录。"
  },
  "zh-TW": {
    "Account deletion": "帳號註銷",
    "Complete sign-in": "完成登入",
    "Enter the 6-digit authenticator code.": "請輸入驗證器中的 6 位驗證碼。",
    "I understand that disabling 2FA removes its authenticator and backup codes.": "我了解，停用 2FA 會移除驗證器驗證方式及其備用碼。",
    "Verify your identity to finish signing in.": "請驗證身分以完成登入。"
  },
  "fr": {
    "Account deletion": "Suppression du compte",
    "Complete sign-in": "Finaliser la connexion",
    "Enter the 6-digit authenticator code.": "Saisissez le code à 6 chiffres de votre application d’authentification.",
    "I understand that disabling 2FA removes its authenticator and backup codes.": "Je comprends que désactiver la 2FA supprimera l’authentificateur associé et ses codes de secours.",
    "Verify your identity to finish signing in.": "Vérifiez votre identité pour terminer la connexion."
  },
  "ja": {
    "Account deletion": "アカウント削除",
    "Complete sign-in": "ログインを完了",
    "Enter the 6-digit authenticator code.": "認証アプリの6桁のコードを入力してください。",
    "I understand that disabling 2FA removes its authenticator and backup codes.": "2FAを無効にすると、認証アプリによる認証とバックアップコードが削除されることを理解しました。",
    "Verify your identity to finish signing in.": "本人確認を行い、ログインを完了してください。"
  },
  "ru": {
    "Account deletion": "Удаление аккаунта",
    "Complete sign-in": "Завершение входа",
    "Enter the 6-digit authenticator code.": "Введите 6-значный код из приложения-аутентификатора.",
    "I understand that disabling 2FA removes its authenticator and backup codes.": "Я понимаю, что отключение 2FA удалит привязку приложения-аутентификатора и резервные коды.",
    "Verify your identity to finish signing in.": "Подтвердите свою личность, чтобы завершить вход."
  },
  "vi": {
    "Account deletion": "Xóa tài khoản",
    "Complete sign-in": "Hoàn tất đăng nhập",
    "Enter the 6-digit authenticator code.": "Nhập mã 6 chữ số từ ứng dụng xác thực.",
    "I understand that disabling 2FA removes its authenticator and backup codes.": "Tôi hiểu rằng tắt 2FA sẽ xóa phương thức xác thực bằng ứng dụng và các mã dự phòng.",
    "Verify your identity to finish signing in.": "Xác minh danh tính để hoàn tất đăng nhập."
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
