import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const extraKeys = [
  'Only one Balance Query route is allowed',
  'Balance Query route does not support client model rules',
  'Balance Query route must use native forwarding',
  'Balance Query upstream path must not contain {model}',
]
const translated = {
  en: extraKeys,
  zh: ['只允许配置一条余额查询路由', '余额查询路由不支持客户端模型规则', '余额查询路由必须使用原生转发', '余额查询的上游路径不能包含 {model}'],
  'zh-TW': ['僅允許設定一條餘額查詢路由', '餘額查詢路由不支援用戶端模型規則', '餘額查詢路由必須使用原生轉發', '餘額查詢的上游路徑不能包含 {model}'],
  fr: ['Une seule route de consultation du solde est autorisée', 'La route de solde ne prend pas en charge les règles de modèle client', 'La route de solde doit utiliser le transfert natif', 'Le chemin amont du solde ne doit pas contenir {model}'],
  ja: ['残高照会ルートは1つだけ設定できます', '残高照会ルートはクライアントモデルのルールに対応していません', '残高照会ルートはネイティブ転送を使用する必要があります', '残高照会の上流パスに {model} は使用できません'],
  ru: ['Разрешён только один маршрут запроса баланса', 'Маршрут баланса не поддерживает правила моделей клиента', 'Маршрут баланса должен использовать нативную пересылку', 'Путь поставщика для баланса не должен содержать {model}'],
  vi: ['Chỉ được cấu hình một tuyến truy vấn số dư', 'Tuyến số dư không hỗ trợ quy tắc mô hình của máy khách', 'Tuyến số dư phải dùng chuyển tiếp nguyên bản', 'Đường dẫn thượng nguồn của số dư không được chứa {model}'],
}
const at = (ref, lang) => JSON.parse(execFileSync('git', ['show', ref + ':web/src/i18n/locales/' + lang + '.json'], { encoding: 'utf8', maxBuffer: 8000000 })).translation
const before = at('2b0efd848^', 'en')
const after = at('2b0efd848', 'en')
const added = Object.keys(after).filter(key => !(key in before))
const newKeys = {}
for (const lang of Object.keys(translated)) {
  const upstream = at('2b0efd848', lang)
  const local = JSON.parse(fs.readFileSync('web/src/i18n/locales/' + lang + '.json', 'utf8')).translation
  newKeys[lang] = Object.fromEntries(added.filter(key => !(key in local)).map(key => {
    if (!upstream[key]) throw new Error('Missing upstream translation: ' + lang + '/' + key)
    return [key, upstream[key]]
  }))
  for (const [index, key] of extraKeys.entries()) newKeys[lang][key] = translated[lang][index]
}
const template = fs.readFileSync('docs/upstream-sync-2026-09-10/evidence/runs/B04.1-model-modifiers-7c044d7c5/add-missing-keys.mjs', 'utf8')
const start = template.indexOf('const newKeys =')
const end = template.indexOf('async function main()')
fs.writeFileSync('web/scripts/add-missing-keys.mjs', template.slice(0, start) + 'const newKeys = ' + JSON.stringify(newKeys, null, 2) + '\n\n' + template.slice(end))
