import { spawnSync } from 'node:child_process'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const filters = process.argv.slice(2).filter((arg) => arg !== '--list')
const files = fs
  .readdirSync(path.join(web, 'src'), { recursive: true })
  .filter((file) => /\.test\.tsx?$/.test(file))
  .map((file) => `src/${file.replaceAll('\\', '/')}`)
  .filter((file) =>
    fs.readFileSync(path.join(web, file), 'utf8').includes("from 'node:test'")
  )
  .filter(
    (file) =>
      filters.length === 0 || filters.some((filter) => file.includes(filter))
  )
  .sort()

if (files.length === 0) {
  throw new Error('No node:test preservation tests matched')
}
if (process.argv.includes('--list')) {
  console.log(JSON.stringify(files, null, 2))
} else {
  const failed = []
  for (const file of files) {
    // Legacy DOM suites install globals at module scope. Keep each in its own process.
    const result = spawnSync('bun', ['test', `./${file}`], {
      cwd: web,
      windowsHide: true,
      stdio: 'inherit',
    })
    if (result.status !== 0 || result.error) failed.push(file)
  }
  console.log(
    JSON.stringify({
      files: files.length,
      passed: files.length - failed.length,
      failed,
    })
  )
  process.exitCode = failed.length ? 1 : 0
}
