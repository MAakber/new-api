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
import { defineConfig } from 'vitest/config'

import channelsConfig from './vitest.channels.config.ts'

export default defineConfig({
  ...channelsConfig,
  test: {
    ...channelsConfig.test,
    include: [
      'src/components/ui/__tests__/combobox.test.tsx',
      'src/features/model-pricing/__tests__/*.test.{ts,tsx}',
      'src/features/models/__tests__/*.test.{ts,tsx}',
      'src/features/pricing/__tests__/*.test.{ts,tsx}',
      'src/features/system-settings/__tests__/pricing-sync.test.tsx',
      'src/features/system-settings/models/__tests__/task-pricing-copy.test.tsx',
      'src/features/usage-logs/components/__tests__/detail-preview.test.tsx',
      'src/lib/__tests__/localized-text.test.ts',
    ],
  },
})
