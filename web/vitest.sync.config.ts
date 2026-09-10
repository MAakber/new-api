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
      'src/features/chat/lib/__tests__/*.test.{ts,tsx}',
      'src/features/pricing/lib/__tests__/time-rule-expr.test.ts',
      'src/features/auth/sign-in/**/__tests__/*.test.{ts,tsx}',
      'src/features/wallet/hooks/__tests__/*.test.{ts,tsx}',
      'src/features/wallet/components/__tests__/*.test.{ts,tsx}',
    ],
  },
})
