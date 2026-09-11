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

import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Preserve fixtures that own their DOM and responsive tests that use Happy DOM
// while running every suite through the same Vitest entry point.
const files = fs
  .readdirSync(path.join(__dirname, 'src'), { recursive: true })
  .filter((file) => /\.(test|spec)\.tsx?$/.test(String(file)))
  .map((file) => `src/${String(file).replaceAll('\\', '/')}`)
const isolatedDOM: string[] = []
const responsive: string[] = []
for (const file of files) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8')
  if (/new Window\(/.test(source) && source.includes("from 'happy-dom'")) {
    isolatedDOM.push(file)
  } else if (source.includes('happyDOM')) {
    responsive.push(file)
  }
}
const resolve = { alias: { '@': path.resolve(__dirname, './src') } }
const server = {
  deps: { inline: [/@lobehub\/icons/, /@lobehub\/ui/, /@emoji-mart\/data/] },
}

export default defineConfig({
  resolve,
  test: {
    maxWorkers: 4,
    projects: [
      {
        resolve,
        test: {
          name: 'web',
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          clearMocks: true,
          restoreMocks: true,
          server,
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: [...isolatedDOM, ...responsive],
        },
      },
      {
        resolve,
        test: {
          name: 'responsive',
          environment: 'happy-dom',
          setupFiles: [
            './src/features/channels/__tests__/channel-test-setup.ts',
          ],
          restoreMocks: true,
          server,
          include: responsive,
        },
      },
      {
        resolve,
        test: {
          name: 'isolated-dom',
          environment: 'node',
          server,
          include: isolatedDOM,
        },
      },
    ],
  },
})
