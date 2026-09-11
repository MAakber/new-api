import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { repository, save, head } from './ledger.mjs'

const require = createRequire(path.join(repository, 'electron/package.json'))
const asar = require('@electron/asar')
const code = head()
const version = `v20260911-${code.slice(0, 8)}`
const desktopVersion = `2026.9.11-g${code.slice(0, 8)}`
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex')
const pairs = [
  ['new-api.exe', 'bin/new-api.exe'],
  ['LICENSE', 'licenses/LICENSE'],
  ['NOTICE', 'licenses/NOTICE'],
  ['THIRD-PARTY-LICENSES.md', 'licenses/THIRD-PARTY-LICENSES.md'],
  ['electron/node_modules/electron/dist/LICENSE', 'licenses/electron/LICENSE'],
  ['electron/node_modules/electron/dist/LICENSES.chromium.html', 'licenses/electron/LICENSES.chromium.html'],
].map(([source, target]) => {
  const packaged = `electron/dist/win-unpacked/resources/${target}`
  const originalHash = digest(fs.readFileSync(path.join(repository, source)))
  const packagedHash = digest(fs.readFileSync(path.join(repository, packaged)))
  if (originalHash !== packagedHash) throw new Error(`Packaged file differs: ${target}`)
  return { source, packaged, sha256: packagedHash }
})
const archive = path.join(repository, 'electron/dist/win-unpacked/resources/app.asar')
const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString())
if (metadata.version !== desktopVersion) throw new Error('Desktop version differs')
for (const name of ['main.js', 'preload.js']) {
  if (digest(asar.extractFile(archive, name)) !== digest(fs.readFileSync(path.join(repository, 'electron', name)))) {
    throw new Error(`Packaged desktop source differs: ${name}`)
  }
}
const backend = spawnSync(path.join(repository, 'electron/dist/win-unpacked/resources/bin/new-api.exe'), ['--version'], {
  encoding: 'utf8', windowsHide: true,
})
if (backend.status !== 0 || backend.stdout.trim() !== version) throw new Error(`Backend version differs: ${backend.stdout} ${backend.stderr}`)
const jsDirectory = path.join(repository, 'web/dist/static/js')
if (!fs.readdirSync(jsDirectory).filter(file => file.startsWith('index.') && file.endsWith('.js')).some(file => fs.readFileSync(path.join(jsDirectory, file), 'utf8').includes(version))) {
  throw new Error('Frontend bundle lacks revision')
}
const installers = [`New-API-App Setup ${desktopVersion}.exe`, `New-API-App ${desktopVersion}.exe`].map(name => {
  const file = `electron/dist/${name}`
  const data = fs.readFileSync(path.join(repository, file))
  if (data.length < 50_000_000 || data.subarray(0, 2).toString() !== 'MZ') throw new Error(`Invalid Windows artifact: ${name}`)
  return { file, bytes: data.length, sha256: digest(data) }
})
const result = { status: 'passed', code_commit: code, version, desktopVersion, pairs, installers, desktop_source: 'Exact main/preload in ASAR', frontend_revision: 'Present in bundled JavaScript', publication: 'No publishing or installation performed' }
save('evidence/B16-artifacts.json', result)
console.log(JSON.stringify(result, null, 2))
