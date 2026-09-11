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
import { readFileSync, readdirSync } from 'node:fs'

import { defineConfig } from 'vitest/config'

import channelsConfig from './vitest.channels.config.ts'

export default defineConfig({
  ...channelsConfig,
  test: {
    ...channelsConfig.test,
    // Existing node:test suites run through the isolated preservation runner.
    exclude: readdirSync(new URL('./src', import.meta.url), { recursive: true })
      .filter((file) => /\.test\.tsx?$/.test(file))
      .map((file) => `src/${file.replaceAll('\\', '/')}`)
      .filter((file) =>
        readFileSync(new URL(file, import.meta.url), 'utf8').includes(
          "from 'node:test'"
        )
      ),
    include: [
      'src/features/usage-logs/**/__tests__/*.test.{ts,tsx}',
      'src/features/redemption-codes/**/__tests__/*.test.{ts,tsx}',
      'src/features/keys/**/__tests__/*.test.{ts,tsx}',
      'src/features/users/components/__tests__/quota-display.test.tsx',
      'src/components/data-table/core/__tests__/pagination.test.tsx',
      'src/components/ui/__tests__/combobox.test.tsx',
      'src/components/ui/__tests__/portal-container.test.tsx',
    ],
  },
})
